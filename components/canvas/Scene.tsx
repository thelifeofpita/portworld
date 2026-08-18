'use client'

import React, { Suspense, useEffect, useRef, useCallback, useState, useReducer } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Preload } from '@react-three/drei'
import * as THREE from 'three'
import Model from './Model'
import PostProcessing from './PostProcessing'
import { bgStore } from '@/lib/bgStore'
import { fgStore } from '@/lib/fgStore'
import { shaderStore } from '@/lib/shaderStore'
import { modelScrollStore } from '@/lib/modelScrollStore'
import { cameraStore } from '@/lib/cameraStore'
import { debugStore } from '@/lib/debugStore'
import { getThemeColors, subscribePalette } from '@/lib/paletteStore'
import type { Zone } from '@/types'

// Mounts only after Suspense resolves — signals that the model is loaded
function OnLoad({ onLoad }: { onLoad: () => void }) {
  useEffect(() => {
    onLoad()
  }, [onLoad])
  return null
}

// Rotates the environment map to follow the mouse cursor
function EnvironmentTracker() {
  const { scene } = useThree()
  const mouse = useRef({ x: 0, y: 0 })
  const current = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * (Math.PI / 4)
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 0.4
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useFrame((_, delta) => {
    const t = 1 - Math.pow(1 - 0.08, Math.min(delta, 0.1) * 60)
    current.current.x += (mouse.current.x - current.current.x) * t
    current.current.y += (mouse.current.y - current.current.y) * t
    scene.environmentRotation.set(current.current.y, current.current.x, 0)
  })

  return null
}

// Mobile canvas is full-page. The model should appear in the top CANVAS_VH (45%)
// portion at the same pixel density it had when the canvas was physically 45vh.
// To keep that density, the full-page vFOV cap = old 16° cap / CANVAS_VH ≈ 35.6°.
// (The top 45% of a 35.6° field contains exactly 16° worth of content.)
const MOBILE_CANVAS_VH  = 0.45
const MOBILE_FOV_CAP    = 16 / MOBILE_CANVAS_VH            // ≈ 35.56°
const MOBILE_NDC_OFFSET = (0.5 - MOBILE_CANVAS_VH / 2) * 2 // 0.55 — NDC above center

// Returns vertical FOV calibrated so 16:9 → 28° vFOV.
// Portrait (mobile, full-page canvas): capped at ~35.6° so the top-45% zone
// shows the same content density as the original 45vh canvas at 16°.
function getBaseFov(width: number, height: number, isMobile: boolean): number {
  const hFov = 2 * Math.atan(Math.tan(14 * Math.PI / 180) * (16 / 9))
  const vFov = 2 * Math.atan(Math.tan(hFov / 2) / (width / height)) * 180 / Math.PI
  return isMobile ? Math.min(vFov, MOBILE_FOV_CAP) : vFov
}

// Portrait: how far (world units) to shift the model group UP so it appears
// centered in the top 45% zone. Camera stays at [0,0,5]—moving camera.y is
// cancelled by R3F's automatic lookAt(0,0,0), so we move the model instead.
function getMobileModelYOffset(isMobile: boolean): number {
  if (!isMobile) return 0
  const halfH = Math.tan((MOBILE_FOV_CAP / 2) * Math.PI / 180) * 5
  return MOBILE_NDC_OFFSET * halfH  // +0.881 — model moves up → appears above center
}

// Smoothly moves camera Z between "nav" (close) and "content" (pulled back) modes.
// Nav: z=5 (default), Content: z=15 — model appears ~1/3 size, revealing work.
// Pull-in uses a higher factor to counteract the perceptual "size grows slowly at distance" effect —
// the angular size change rate ∝ 1/z² is much lower at z=15 than at z=5, making pull-in look slow
// even though the camera moves the same absolute distance. Higher k compensates.
function CameraZoom({ isContentMode }: { isContentMode: boolean }) {
  const { camera } = useThree()
  const targetZ = useRef(5)

  useEffect(() => {
    targetZ.current = isContentMode ? 15 : 5
  }, [isContentMode])

  useFrame((_, delta) => {
    const cam = camera as THREE.PerspectiveCamera
    const diff = targetZ.current - cam.position.z
    if (Math.abs(diff) < 0.001) return
    const k = diff < 0 ? 0.24 : 0.18  // pull-in faster, pull-out slightly slower
    const t = 1 - Math.pow(1 - k, Math.min(delta, 0.1) * 60)
    cam.position.z += diff * t
    cameraStore.z = cam.position.z
  })

  return null
}

function CameraFov({ isMobile }: { isMobile: boolean }) {
  const { camera, size } = useThree()
  const targetFov = useRef(getBaseFov(size.width, size.height, isMobile))

  useEffect(() => {
    targetFov.current = Math.max(12, Math.min(65,
      getBaseFov(size.width, size.height, isMobile)
    ))
  }, [size, isMobile])

  useFrame((_, delta) => {
    const cam = camera as THREE.PerspectiveCamera
    if (Math.abs(cam.fov - targetFov.current) > 0.01) {
      const t = 1 - Math.pow(1 - 0.2, Math.min(delta, 0.1) * 60)
      cam.fov += (targetFov.current - cam.fov) * t
      cam.updateProjectionMatrix()
    }
  })

  return null
}


// Total time a bg/fg/muted fade takes, regardless of how far apart the old
// and new colors are — see the fadeStart/startBg.. machinery in BackgroundSync
// below for why this replaced a plain per-frame lerp.
const COLOR_FADE_DURATION = 0.25
const easeOutQuintic = (x: number) => 1 - Math.pow(1 - x, 5)

// Smoothly lerps scene.background and CSS variables toward the target color.
// The canvas is full-page on mobile so scene.background provides the page
// background everywhere — no compositor-layer seam against HTML elements.
function BackgroundSync() {
  const { scene } = useThree()
  const initialColors = getThemeColors()
  const curBg     = useRef(new THREE.Color(initialColors.bg))
  const curFg     = useRef(new THREE.Color(initialColors.fg))
  const curMuted  = useRef(new THREE.Color(initialColors.fgMuted))
  const tgtBg     = useRef(new THREE.Color(initialColors.bg))
  const tgtFg     = useRef(new THREE.Color(initialColors.fg))
  const tgtMuted  = useRef(new THREE.Color(initialColors.fgMuted))
  // Colors curBg/curFg/curMuted are fading FROM, and when that fade began —
  // captured fresh (from wherever curBg.. currently sits) every time the
  // target changes, so a fade that gets interrupted by another reroll starts
  // its own full-duration fade from the current on-screen color rather than
  // snapping. See the useFrame below for why this replaced a plain per-frame
  // percentage-of-remaining-distance lerp: that approach closes the same
  // FRACTION of the gap every frame, so it visually settles quickly for a
  // small color jump but takes much longer to become imperceptible for a
  // large one — the fade needs to take the same wall-clock time regardless
  // of distance.
  const startBg    = useRef(new THREE.Color(initialColors.bg))
  const startFg    = useRef(new THREE.Color(initialColors.fg))
  const startMuted = useRef(new THREE.Color(initialColors.fgMuted))
  const fadeStart  = useRef(0)
  // Tracks the debug override's previous on/off state so the frame it turns
  // off can restart the fade from curBg's current (override-set) color —
  // otherwise the fade would resume from a start captured before the
  // override began, snapping back toward that stale position.
  const wasOverridden = useRef(false)
  // Bumped when the random palette finishes loading (arrives async, after
  // this component's first render) — forces the target effect below to
  // re-run even though `color` itself hasn't changed, so curBg/curFg/curMuted
  // lerp smoothly from the temporary defaults into the palette's colors
  // instead of snapping.
  const [paletteTick, onPaletteChange] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribePalette(onPaletteChange), [])
  // Last hex actually written to each CSS var — lets natural-lerp writes stop
  // once converged (CSS variables are write-expensive even unchanged) while
  // still reacting instantly the frame an override starts/stops, regardless
  // of whether the natural lerp itself happens to be settled at that moment.
  const lastWritten = useRef({ bg: '', fg: '', muted: '', iconInvert: '' })

  // Set scene.background once so Three.js tracks the same object
  useEffect(() => { scene.background = curBg.current }, [scene])

  // Update targets when the random palette finishes loading, so curBg/curFg
  // lerp smoothly from the placeholder defaults into the real palette colors.
  useEffect(() => {
    const { bg, fg, fgMuted } = getThemeColors()
    tgtBg.current.set(bg)
    tgtFg.current.set(fg)
    tgtMuted.current.set(fgMuted)
    startBg.current.copy(curBg.current)
    startFg.current.copy(curFg.current)
    startMuted.current.copy(curMuted.current)
    fadeStart.current = performance.now() / 1000
  }, [paletteTick])

  useFrame(() => {
    // Debug menu overrides are hard-pinned every frame (not lerped — the color
    // picker is already a continuous input) instead of feeding into the
    // natural palette lerp target. This keeps scene.background — the ACTUAL
    // pixels Three.js renders — in lockstep with whatever color the shader
    // composites against. Previously the override only reached the shader's
    // uBgColor uniform while scene.background stayed the natural color, so
    // the shader's ink/background luminance threshold was comparing against a
    // color that wasn't actually on screen — misclassifying most of the
    // background as "ink" and tinting it with whatever the ink color was.
    const bgOverride    = debugStore.bgColor
    const fgOverride     = debugStore.fgColor
    const mutedOverride  = debugStore.fgMutedColor
    const overridden = !!(bgOverride || fgOverride || mutedOverride)

    if (wasOverridden.current && !overridden) {
      startBg.current.copy(curBg.current)
      startFg.current.copy(curFg.current)
      startMuted.current.copy(curMuted.current)
      fadeStart.current = performance.now() / 1000
    }
    wasOverridden.current = overridden

    const elapsed = performance.now() / 1000 - fadeStart.current
    const eased   = easeOutQuintic(Math.min(1, elapsed / COLOR_FADE_DURATION))

    if (bgOverride) curBg.current.set(bgOverride)
    else curBg.current.lerpColors(startBg.current, tgtBg.current, eased)

    if (fgOverride) curFg.current.set(fgOverride)
    else curFg.current.lerpColors(startFg.current, tgtFg.current, eased)

    if (mutedOverride) curMuted.current.set(mutedOverride)
    else curMuted.current.lerpColors(startMuted.current, tgtMuted.current, eased)

    // bgStore is the single source of truth PostProcessing reads for the
    // shader's background color/luminance — always derived from curBg
    // (whichever of the two paths above produced it) so the two never disagree.
    bgStore.luminance = curBg.current.r * 0.299 + curBg.current.g * 0.587 + curBg.current.b * 0.114
    bgStore.r = curBg.current.r
    bgStore.g = curBg.current.g
    bgStore.b = curBg.current.b

    // fgStore mirrors bgStore for the live fg color — needed because fg is no
    // longer necessarily grayscale (it's the palette's black/white slot, which
    // can be any hue), so non-React readers can't re-derive it from luminance alone.
    fgStore.r = curFg.current.r
    fgStore.g = curFg.current.g
    fgStore.b = curFg.current.b

    // Overrides write their own CSS vars instantly via debugStore.applyCssVars
    // on every change — this loop only needs to drive the DOM while following
    // the natural palette fade-in, and only when the value actually moved.
    const bgHex = '#' + curBg.current.getHexString()
    if (!bgOverride && bgHex !== lastWritten.current.bg) {
      document.documentElement.style.setProperty('--bg-color', bgHex)
      lastWritten.current.bg = bgHex
    }
    const fgHex = '#' + curFg.current.getHexString()
    if (!fgOverride && fgHex !== lastWritten.current.fg) {
      document.documentElement.style.setProperty('--fg-color', fgHex)
      lastWritten.current.fg = fgHex
    }
    const mutedHex = '#' + curMuted.current.getHexString()
    if (!mutedOverride && mutedHex !== lastWritten.current.muted) {
      document.documentElement.style.setProperty('--fg-muted', mutedHex)
      lastWritten.current.muted = mutedHex
    }
    const iconInvertStr = String(1 - bgStore.luminance)
    if (iconInvertStr !== lastWritten.current.iconInvert) {
      document.documentElement.style.setProperty('--icon-invert', iconInvertStr)
      lastWritten.current.iconInvert = iconInvertStr
    }
  })

  return null
}

// Moves the model group upward in world space to match page scroll, so the model
// scrolls with page content. Also publishes the extra offset to modelScrollStore
// so Model.tsx posStore computations stay accurate.
function ScrollingGroup({ baseY, isMobile, children }: { baseY: number; isMobile: boolean; children: React.ReactNode }) {
  const ref      = useRef<THREE.Group>(null)
  const scrollPx = useRef(0)
  const { camera } = useThree()

  useEffect(() => {
    if (!isMobile) return
    const onScroll = () => { scrollPx.current = window.scrollY }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isMobile])

  useFrame(() => {
    if (!ref.current) return
    let y = baseY
    if (isMobile) {
      const cam = camera as THREE.PerspectiveCamera
      const halfH = Math.tan((cam.fov / 2) * Math.PI / 180) * 5
      y += scrollPx.current * (2 * halfH / window.innerHeight)
    }
    ref.current.position.y = y
    modelScrollStore.extraWorldY = y - baseY
  })

  return <group ref={ref} position={[0, baseY, 0]}>{children}</group>
}

interface SceneProps {
  onZoneChange: (zone: Zone) => void
  onZoneReset: () => void
  onModelClick?: () => void
  onLoad: () => void
  isMobile?: boolean
  canvasStyle?: React.CSSProperties
  isContentMode?: boolean
}

export default function Scene({ onZoneChange, onZoneReset, onModelClick, onLoad, isMobile = false, canvasStyle, isContentMode = false }: SceneProps) {
  const [shaderMode, setShaderMode] = useState<0|1|2>(0)
  const [initialFov]   = useState(() => getBaseFov(window.innerWidth, window.innerHeight, isMobile))
  const [modelYOffset] = useState(() => getMobileModelYOffset(isMobile))

  // WebGL contexts can be lost for reasons entirely outside this app's control
  // (GPU driver reset, the OS reclaiming VRAM under pressure from other apps,
  // too many contexts open, etc.) — when it happens, Three.js/R3F's internal
  // state (textures, render targets, compiled programs) is gone and cannot be
  // trivially re-uploaded in place, so the canvas otherwise just freezes on
  // its last rendered frame forever. A full reload is the standard, reliable
  // recovery for a WebGL app — cheap here since there's no unsaved state to lose.
  const onContextLost = useCallback((e: Event) => {
    e.preventDefault()
    console.warn('[Scene] WebGL context lost — reloading to recover.')
    window.location.reload()
  }, [])

  // R3F only creates its renderer once react-use-measure reports a non-zero
  // size for the canvas container — and Chrome does not deliver that first
  // ResizeObserver callback while the tab is HIDDEN. Open the site in a
  // background tab (cmd-clicked link, restored session, a window opened
  // behind another) and the renderer is never built, nothing inside the
  // Canvas's Suspense boundary ever mounts, so OnLoad never fires and the
  // loading screen sits on "Behold." indefinitely — verified in a hidden tab,
  // where the canvas stayed at its default 300x150 with no model/env request
  // ever issued. A synthetic resize forces the measurement immediately, even
  // while hidden (also verified), so this nudges once on mount and again on
  // any visibility change. Timers rather than rAF, which is itself throttled
  // to a standstill in hidden tabs.
  useEffect(() => {
    const kick = () => window.dispatchEvent(new Event('resize'))
    const t = setTimeout(kick, 0)
    document.addEventListener('visibilitychange', kick)
    return () => {
      clearTimeout(t)
      document.removeEventListener('visibilitychange', kick)
    }
  }, [])

  const onAsciiToggle    = useCallback(() => {
    const next = ((shaderMode + 1) % 3) as 0|1|2
    setShaderMode(next)
    shaderStore.mode = next
    window.dispatchEvent(new CustomEvent('shaderModeChange', { detail: next }))
  }, [shaderMode])

  const defaultStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, width: '100%', height: '100%',
    // Always auto: cards (z-index:10, pointer-events:auto) intercept their own
    // clicks before the canvas sees them, so keeping the canvas interactive
    // doesn't break card interactions and allows drag to restart after a snap.
    pointerEvents: 'auto',
    // Stops the browser from treating a drag-to-rotate touch as a page-scroll
    // gesture — the canvas handles the touch itself (rotation), so native
    // panning/zooming on this element must be disabled.
    touchAction: 'none',
  }

  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: initialFov }}
      gl={{ antialias: true, alpha: false }}
      dpr={1}
      style={canvasStyle ?? defaultStyle}
      onCreated={(state) => {
        state.gl.domElement.addEventListener('webglcontextlost', onContextLost)
      }}
    >
      <BackgroundSync />

      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 4]} intensity={1.2} castShadow />
      <directionalLight position={[-4, 2, -4]} intensity={0.4} />

      <Suspense fallback={null}>
        {/* Self-hosted rather than preset="studio": drei's presets are fetched
            from raw.githack.com, a third-party CDN whose latency is out of our
            hands — and since this sits inside the same Suspense boundary as
            OnLoad below, every slow CDN response held the loading screen open
            for as long as it took. Same asset, served from our own origin
            (and preloaded in layout.tsx alongside the model). */}
        <Environment files="/env/studio_small_03_1k.hdr" />
        <EnvironmentTracker />
        <CameraFov isMobile={isMobile} />
        <CameraZoom isContentMode={isContentMode} />
        <ScrollingGroup baseY={modelYOffset} isMobile={isMobile}>
          <Model onZoneChange={onZoneChange} onZoneReset={onZoneReset} onAsciiToggle={onAsciiToggle} onModelClick={onModelClick} isContentMode={isContentMode} yOffset={modelYOffset} />
        </ScrollingGroup>
        <OnLoad onLoad={onLoad} />
        <Preload all />
        <PostProcessing mode={shaderMode} />
      </Suspense>
    </Canvas>
  )
}
