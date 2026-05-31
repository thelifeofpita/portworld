'use client'

import React, { Suspense, useEffect, useRef, useCallback, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Preload } from '@react-three/drei'
import * as THREE from 'three'
import Model from './Model'
import PostProcessing from './PostProcessing'
import { bgStore } from '@/lib/bgStore'
import { shaderStore } from '@/lib/shaderStore'
import { modelScrollStore } from '@/lib/modelScrollStore'
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

function CameraFov({ isMobile }: { isMobile: boolean }) {
  const { camera, size } = useThree()
  const scrollDelta = useRef(0)
  const targetFov   = useRef(getBaseFov(size.width, size.height, isMobile))

  // Recompute base on viewport resize; preserve accumulated scroll delta
  useEffect(() => {
    targetFov.current = Math.max(12, Math.min(65,
      getBaseFov(size.width, size.height, isMobile) + scrollDelta.current
    ))
  }, [size, isMobile])

  useEffect(() => {
    if (isMobile) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      scrollDelta.current = Math.max(-8, Math.min(37, scrollDelta.current + e.deltaY * 0.08))
      targetFov.current = Math.max(12, Math.min(65,
        getBaseFov(window.innerWidth, window.innerHeight, isMobile) + scrollDelta.current
      ))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [isMobile])

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


const BG_COLORS = {
  white: { bg: '#ffffff', fg: '#0d0d0d', fgMuted: '#999999' },
  black: { bg: '#000000', fg: '#f0f0f0', fgMuted: '#666666' },
}

// Smoothly lerps scene.background and CSS variables toward the target color.
// The canvas is full-page on mobile so scene.background provides the page
// background everywhere — no compositor-layer seam against HTML elements.
function BackgroundSync({ color }: { color: 'white' | 'black' }) {
  const { scene } = useThree()
  const curBg     = useRef(new THREE.Color(BG_COLORS.white.bg))
  const curFg     = useRef(new THREE.Color(BG_COLORS.white.fg))
  const curMuted  = useRef(new THREE.Color(BG_COLORS.white.fgMuted))
  const tgtBg     = useRef(new THREE.Color(BG_COLORS.white.bg))
  const tgtFg     = useRef(new THREE.Color(BG_COLORS.white.fg))
  const tgtMuted  = useRef(new THREE.Color(BG_COLORS.white.fgMuted))
  const settled   = useRef(true)

  // Set scene.background once so Three.js tracks the same object
  useEffect(() => { scene.background = curBg.current }, [scene])

  // Update targets when color changes; mark unsettled so DOM writes resume
  useEffect(() => {
    const { bg, fg, fgMuted } = BG_COLORS[color]
    tgtBg.current.set(bg)
    tgtFg.current.set(fg)
    tgtMuted.current.set(fgMuted)
    settled.current = false
  }, [color])

  useFrame((_, delta) => {
    const t = 1 - Math.pow(1 - 0.12, Math.min(delta, 0.1) * 60)
    curBg.current.lerp(tgtBg.current, t)
    curFg.current.lerp(tgtFg.current, t)
    curMuted.current.lerp(tgtMuted.current, t)
    bgStore.luminance = curBg.current.r

    // Skip DOM writes once the transition has converged — CSS variables are
    // write-expensive even if the value is unchanged.
    if (settled.current) return
    const diff = Math.abs(curBg.current.r - tgtBg.current.r)
               + Math.abs(curBg.current.g - tgtBg.current.g)
               + Math.abs(curBg.current.b - tgtBg.current.b)
    if (diff < 0.002) settled.current = true
    const root = document.documentElement
    root.style.setProperty('--bg-color',    '#' + curBg.current.getHexString())
    root.style.setProperty('--fg-color',    '#' + curFg.current.getHexString())
    root.style.setProperty('--fg-muted',    '#' + curMuted.current.getHexString())
    root.style.setProperty('--icon-invert', String(1 - curBg.current.r))
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
  onLoad: () => void
  isMobile?: boolean
  canvasStyle?: React.CSSProperties
}

export default function Scene({ onZoneChange, onZoneReset, onLoad, isMobile = false, canvasStyle }: SceneProps) {
  const [bg, setBg]           = useState<'white' | 'black'>('white')
  const [shaderMode, setShaderMode] = useState<0|1|2>(0)
  const [initialFov]   = useState(() => getBaseFov(window.innerWidth, window.innerHeight, isMobile))
  const [modelYOffset] = useState(() => getMobileModelYOffset(isMobile))

  const onPointerMissed  = useCallback(() => setBg(p => p === 'white' ? 'black' : 'white'), [])
  const onAsciiToggle    = useCallback(() => {
    const next = ((shaderMode + 1) % 3) as 0|1|2
    setShaderMode(next)
    shaderStore.mode = next
    window.dispatchEvent(new CustomEvent('shaderModeChange', { detail: next }))
  }, [shaderMode])

  const defaultStyle: React.CSSProperties = { position: 'fixed', inset: 0, width: '100%', height: '100%' }

  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: initialFov }}
      gl={{ antialias: true, alpha: false }}
      dpr={1}
      style={canvasStyle ?? defaultStyle}
      onPointerMissed={onPointerMissed}
    >
      <BackgroundSync color={bg} />

      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 4]} intensity={1.2} castShadow />
      <directionalLight position={[-4, 2, -4]} intensity={0.4} />

      <Suspense fallback={null}>
        <Environment preset="studio" />
        <EnvironmentTracker />
        <CameraFov isMobile={isMobile} />
        <ScrollingGroup baseY={modelYOffset} isMobile={isMobile}>
          <Model onZoneChange={onZoneChange} onZoneReset={onZoneReset} onAsciiToggle={onAsciiToggle} yOffset={modelYOffset} />
        </ScrollingGroup>
        <OnLoad onLoad={onLoad} />
        <Preload all />
        <PostProcessing mode={shaderMode} />
      </Suspense>
    </Canvas>
  )
}
