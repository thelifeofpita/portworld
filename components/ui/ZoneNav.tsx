'use client'

import { useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { useAnimationFrame } from 'framer-motion'
import { posStore } from '@/lib/posStore'
import { silhouetteStore } from '@/lib/silhouetteStore'
import { zoneStore } from '@/lib/zoneStore'
import { cameraStore } from '@/lib/cameraStore'
import { debugStore, hexToRgb255 } from '@/lib/debugStore'
import styles from './ZoneNav.module.css'

const N              = 3
const TWO_PI         = Math.PI * 2
const STEP           = TWO_PI / N       // 120° between boxes
const PADDING        = 55              // gap outside silhouette (CSS px, at nav-mode zoom)
const MIN_LINE       = 128             // minimum dot→label distance (CSS px, at nav-mode zoom)
// Camera Z at nav-mode (must match CameraZoom's NAV_Z in Scene.tsx). PADDING/MIN_LINE
// are tuned for the model's on-screen size at this zoom — scale them down with it
// (apparent size ∝ 1/z) so labels stay proportionally close when the model is small.
const NAV_Z          = 5
const ANGLE_SMOOTH   = 0.18   // per-box angle smoothing — sole lag stage, settles in ~3 frames
const FOLLOW_RATE    = 0.22   // position convergence

const ACCENT_SMOOTH = 0.16  // lerp factor per 60-fps frame (same as PostProcessing tAccent)

// Pre-allocated scratch — no per-frame heap allocations
const _desired     = new Float64Array(N)
// Last valid mesh direction for each box (updated only when the mesh is far enough
// from center to give a reliable angle). Used instead of s.angle as fallback so the
// cluster-base computation never depends on the boxes' own settling angles.
const _lastDesired = new Float64Array([
  -Math.PI / 2,       // initial for box 0
   Math.PI / 6,       // initial for box 1
   Math.PI * 5 / 6,   // initial for box 2
])

interface BoxState { x: number; y: number; angle: number }

export default function ZoneNav({ isContentMode = false }: { isContentMode?: boolean }) {
  const isContentModeRef = useRef(isContentMode)
  const navOpacity = useRef(1)
  const svgRef = useRef<SVGSVGElement>(null)
  const navContainerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    isContentModeRef.current = isContentMode
  }, [isContentMode])

  const box0 = useRef<HTMLDivElement>(null)
  const box1 = useRef<HTMLDivElement>(null)
  const box2 = useRef<HTMLDivElement>(null)
  const line0 = useRef<SVGLineElement>(null)
  const line1 = useRef<SVGLineElement>(null)
  const line2 = useRef<SVGLineElement>(null)
  const dot0  = useRef<SVGCircleElement>(null)
  const dot1  = useRef<SVGCircleElement>(null)
  const dot2  = useRef<SVGCircleElement>(null)
  const ul0   = useRef<SVGRectElement>(null)
  const ul1   = useRef<SVGRectElement>(null)
  const ul2   = useRef<SVGRectElement>(null)
  const boxRefs  = [box0,  box1,  box2 ]
  const lineRefs = [line0, line1, line2]
  const dotRefs  = [dot0,  dot1,  dot2 ]
  const ulRefs   = [ul0,   ul1,   ul2  ]

  const states   = useRef<BoxState[]>([
    { x: 0, y: 0, angle: -Math.PI / 2     },
    { x: 0, y: 0, angle:  Math.PI / 6     },
    { x: 0, y: 0, angle:  Math.PI * 5 / 6 },
  ])
  // Per-box blend: 0 = unfocused red, 1 = focused yellow
  const blends        = useRef(new Float64Array(N))
  const snapTo0 = useCallback(() => { zoneStore.snapToZone?.(0) }, [])
  const snapTo1 = useCallback(() => { zoneStore.snapToZone?.(1) }, [])
  const snapTo2 = useCallback(() => { zoneStore.snapToZone?.(2) }, [])

  // useLayoutEffect fires before the first paint, so states are correct before
  // the first useAnimationFrame tick — boxes never start at (0, 0).
  useLayoutEffect(() => {
    const cx = window.innerWidth  / 2
    const cy = window.innerHeight / 2
    const r  = Math.min(window.innerWidth, window.innerHeight) * 0.3
    states.current.forEach((s) => {
      s.x = cx + Math.cos(s.angle) * r
      s.y = cy + Math.sin(s.angle) * r
    })
  }, [])

  useAnimationFrame((_, delta) => {
    const dt      = Math.min(delta, 100) / 16.67
    const angleF  = 1 - Math.pow(1 - ANGLE_SMOOTH,  dt)
    const followF = 1 - Math.pow(1 - FOLLOW_RATE,   dt)
    const accentF = 1 - Math.pow(1 - ACCENT_SMOOTH, dt)

    // Fade nav in/out based on content mode — lerp opacity each frame
    const targetOpacity = isContentModeRef.current ? 0 : 1
    navOpacity.current += (targetOpacity - navOpacity.current) * accentF
    const opStr = String(navOpacity.current)
    if (svgRef.current) svgRef.current.style.opacity = opStr
    if (navContainerRef.current) navContainerRef.current.style.opacity = opStr

    const { cx, cy, pts, count } = silhouetteStore
    const active = zoneStore.activeZone

    // Accent colors — sourced from the debug menu (same uniforms PostProcessing uses)
    const COLOR_BASE  = hexToRgb255(debugStore.accentBaseColor)
    const COLOR_FOCUS = hexToRgb255(debugStore.accentFocusColor)

    // Shrinks as the camera pulls back for content mode, so label offsets shrink
    // in step with the model's on-screen size — but only halfway (floored at 0.5)
    // so labels stay legibly clear of the model instead of crowding it at full scale.
    const zoomScale = 0.5 + 0.5 * (NAV_Z / Math.max(cameraStore.z, NAV_Z))
    const padding   = PADDING  * zoomScale
    const minLine   = MIN_LINE * zoomScale

    // ── 1. Desired angle for each box (direction toward its mesh) ─────────────
    // When the mesh is far enough from center, record the real direction.
    // When close to center (len ≤ 8), reuse the last recorded direction so that
    // clusterBase never depends on s.angle — breaking the feedback loop that
    // caused the cluster base to drift while boxes were still settling.
    for (let i = 0; i < N; i++) {
      const mesh = posStore[i as 0 | 1 | 2]
      const dx   = mesh.x - cx
      const dy   = mesh.y - cy
      const len  = Math.sqrt(dx * dx + dy * dy)
      if (len > 8) _lastDesired[i] = Math.atan2(dy, dx)
      _desired[i] = _lastDesired[i]
    }

    // ── 2. Equal spacing — find the cluster base angle that minimises total
    //       angular deviation with fixed per-box slot assignment (box i → slot i).
    //       Uses the circular mean of (desired[i] − i×120°), then smoothed over
    //       time so sudden shifts (e.g. model finishing its snap) don't cause a
    //       visible secondary jump.
    let sumX = 0, sumY = 0
    for (let i = 0; i < N; i++) {
      const offset = _desired[i] - i * STEP
      sumX += Math.cos(offset)
      sumY += Math.sin(offset)
    }
    const clusterBase = Math.atan2(sumY, sumX)

    // ── 3. Smooth each box's angle toward its equally-spaced target ───────────
    for (let i = 0; i < N; i++) {
      const box  = boxRefs[i].current
      const line = lineRefs[i].current
      const dot  = dotRefs[i].current
      if (!box || !line || !dot) continue

      const s    = states.current[i]
      const mesh = posStore[i as 0 | 1 | 2]

      const target = clusterBase + i * STEP
      let dAngle = target - s.angle
      while (dAngle >  Math.PI) dAngle -= TWO_PI
      while (dAngle < -Math.PI) dAngle += TWO_PI
      s.angle += dAngle * angleF

      // Support function: furthest model point in this orbital direction
      const nx = Math.cos(s.angle)
      const ny = Math.sin(s.angle)
      let maxProj = 80 * zoomScale
      for (let k = 0; k < count; k++) {
        const d = (pts[k * 2] - cx) * nx + (pts[k * 2 + 1] - cy) * ny
        if (d > maxProj) maxProj = d
      }

      let targetX = cx + nx * (maxProj + padding)
      let targetY = cy + ny * (maxProj + padding)

      // Enforce a minimum visible line length from the dot to the label centre.
      // Without this, labels whose accent part sits at the silhouette boundary
      // (hand, foot) end up only `padding` px from the dot with no visible line.
      const dxDot   = targetX - mesh.x
      const dyDot   = targetY - mesh.y
      const lineDist = Math.sqrt(dxDot * dxDot + dyDot * dyDot)
      if (lineDist < minLine) {
        const extra = minLine - lineDist
        targetX += nx * extra
        targetY += ny * extra
      }

      s.x += (targetX - s.x) * followF
      s.y += (targetY - s.y) * followF

      const w = box.offsetWidth
      const h = box.offsetHeight
      box.style.transform = `translate(${s.x - w / 2}px, ${s.y - h / 2}px)`

      const lx = mesh.x - s.x
      const ly = mesh.y - s.y
      const tx = w > 0 && lx !== 0 ? (w / 2) / Math.abs(lx) : Infinity
      const ty = h > 0 && ly !== 0 ? (h / 2) / Math.abs(ly) : Infinity
      const te = Math.min(tx, ty)
      line.setAttribute('x1', String(s.x + lx * te))
      line.setAttribute('y1', String(s.y + ly * te))
      line.setAttribute('x2', String(mesh.x))
      line.setAttribute('y2', String(mesh.y))
      dot.setAttribute('cx', String(mesh.x))
      dot.setAttribute('cy', String(mesh.y))

      // ── Accent color: lerp blend toward 1 if active, 0 if not (or no zone yet) ──
      blends.current[i] += ((active !== null && i === active ? 1 : 0) - blends.current[i]) * accentF
      const b = blends.current[i]
      const r = Math.round(COLOR_BASE[0] + (COLOR_FOCUS[0] - COLOR_BASE[0]) * b)
      const g = Math.round(COLOR_BASE[1] + (COLOR_FOCUS[1] - COLOR_BASE[1]) * b)
      const bv= Math.round(COLOR_BASE[2] + (COLOR_FOCUS[2] - COLOR_BASE[2]) * b)
      const css = `rgb(${r},${g},${bv})`
      // Underline rect lives in the SVG (outside the difference-blend nav layer)
      // so it renders with its literal accent color, not the inverted color.
      const ul = ulRefs[i].current
      if (ul) {
        ul.setAttribute('x',      String(s.x - w / 2))
        ul.setAttribute('y',      String(s.y + h / 2 - 2))
        ul.setAttribute('width',  String(w))
        ul.setAttribute('fill',   css)
      }
      line.setAttribute('stroke', css)
      dot.setAttribute('fill', css)
    }

  })

  return (
    <>
      <svg ref={svgRef} className={styles.svg} aria-hidden="true">
        <line ref={line0} stroke="var(--accent-base-color)" strokeWidth="2" />
        <line ref={line1} stroke="var(--accent-base-color)" strokeWidth="2" />
        <line ref={line2} stroke="var(--accent-base-color)" strokeWidth="2" />
        <circle ref={dot0} r="4" fill="var(--accent-base-color)" />
        <circle ref={dot1} r="4" fill="var(--accent-base-color)" />
        <circle ref={dot2} r="4" fill="var(--accent-base-color)" />
        {/* Underlines — in the SVG so they sit outside the difference-blend nav layer */}
        <rect ref={ul0} height="2" />
        <rect ref={ul1} height="2" />
        <rect ref={ul2} height="2" />
      </svg>

      <nav ref={navContainerRef} className={styles.nav} aria-label="Sections">
        <div ref={box0} className={styles.box} onClick={snapTo0}>Projects</div>
        <div ref={box1} className={styles.box} onClick={snapTo1}>About Me</div>
        <div ref={box2} className={styles.box} onClick={snapTo2}>Playground</div>
      </nav>
    </>
  )
}
