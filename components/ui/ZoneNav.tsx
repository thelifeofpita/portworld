'use client'

import { useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { useAnimationFrame } from 'framer-motion'
import { posStore } from '@/lib/posStore'
import { silhouetteStore } from '@/lib/silhouetteStore'
import { zoneStore } from '@/lib/zoneStore'
import { bgStore } from '@/lib/bgStore'
import styles from './ZoneNav.module.css'

const N              = 3
const TWO_PI         = Math.PI * 2
const STEP           = TWO_PI / N       // 120° between boxes
const PADDING        = 55              // gap outside silhouette (CSS px)
const ANGLE_SMOOTH   = 0.18   // per-box angle smoothing — sole lag stage, settles in ~3 frames
const FOLLOW_RATE    = 0.22   // position convergence
// Accent colors — must match PostProcessing.tsx shader constants
const COLOR_BASE  = [242,  12, 31] as const  // #F20C1F unfocused red
const COLOR_FOCUS = [242, 223, 12] as const  // #F2DF0C focused yellow

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

export default function ZoneNav() {
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
  // Per-box hover blend: 0 = resting white, 1 = hover red (lerped with accentF)
  const hoverBlends   = useRef(new Float64Array(N))
  // Tracks which boxes are currently hovered (updated by mouse events, read per frame)
  const hovered       = useRef(new Uint8Array(N))
  const snapTo0 = useCallback(() => zoneStore.snapToZone?.(0), [])
  const snapTo1 = useCallback(() => zoneStore.snapToZone?.(1), [])
  const snapTo2 = useCallback(() => zoneStore.snapToZone?.(2), [])

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

    const { cx, cy, pts, count } = silhouetteStore
    const active = zoneStore.activeZone

    // Hover text: lerp target is the complement of #F20C1F against the current bg
    // (so it renders as the literal site red through mix-blend-mode:difference).
    // bgStore.luminance is the live grayscale value (1 = white, 0 = black).
    const bgCh  = Math.round(bgStore.luminance * 255)
    const htR   = Math.abs(COLOR_BASE[0] - bgCh)
    const htG   = Math.abs(COLOR_BASE[1] - bgCh)
    const htB   = Math.abs(COLOR_BASE[2] - bgCh)

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
      let maxProj = 80
      for (let k = 0; k < count; k++) {
        const d = (pts[k * 2] - cx) * nx + (pts[k * 2 + 1] - cy) * ny
        if (d > maxProj) maxProj = d
      }

      let targetX = cx + nx * (maxProj + PADDING)
      let targetY = cy + ny * (maxProj + PADDING)

      // Enforce a minimum visible line length from the dot to the label centre.
      // Without this, labels whose accent part sits at the silhouette boundary
      // (hand, foot) end up only PADDING px from the dot with no visible line.
      const MIN_LINE = 128
      const dxDot   = targetX - mesh.x
      const dyDot   = targetY - mesh.y
      const lineDist = Math.sqrt(dxDot * dxDot + dyDot * dyDot)
      if (lineDist < MIN_LINE) {
        const extra = MIN_LINE - lineDist
        targetX += nx * extra
        targetY += ny * extra
      }

      s.x += (targetX - s.x) * followF
      s.y += (targetY - s.y) * followF

      const w = box.offsetWidth
      const h = box.offsetHeight
      box.style.transform = `translate(${s.x - w / 2}px, ${s.y - h / 2}px)`

      // Hover color — lerped with accentF so it fades in/out at the same speed
      // as the accent highlight. Target is 1 for inactive hovered boxes, 0 otherwise.
      const hoverTarget = (hovered.current[i] && i !== active) ? 1 : 0
      hoverBlends.current[i] += (hoverTarget - hoverBlends.current[i]) * accentF
      const hb = hoverBlends.current[i]
      if (hb < 0.002) {
        box.style.color = ''  // fully resting — let CSS default (white) take over
      } else {
        // Lerp raw CSS color from white (255,255,255) toward the hover complement
        const cr = Math.round(255 + (htR - 255) * hb)
        const cg = Math.round(255 + (htG - 255) * hb)
        const cb = Math.round(255 + (htB - 255) * hb)
        box.style.color = `rgb(${cr},${cg},${cb})`
      }

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
      <svg className={styles.svg} aria-hidden="true">
        <line ref={line0} stroke="#F20C1F" strokeWidth="2" />
        <line ref={line1} stroke="#F20C1F" strokeWidth="2" />
        <line ref={line2} stroke="#F20C1F" strokeWidth="2" />
        <circle ref={dot0} r="4" fill="#F20C1F" />
        <circle ref={dot1} r="4" fill="#F20C1F" />
        <circle ref={dot2} r="4" fill="#F20C1F" />
        {/* Underlines — in the SVG so they sit outside the difference-blend nav layer */}
        <rect ref={ul0} height="2" />
        <rect ref={ul1} height="2" />
        <rect ref={ul2} height="2" />
      </svg>

      <nav className={styles.nav} aria-label="Sections">
        <div ref={box0} className={styles.box} onClick={snapTo0} onMouseEnter={() => { hovered.current[0] = 1 }} onMouseLeave={() => { hovered.current[0] = 0 }}>Projects</div>
        <div ref={box1} className={styles.box} onClick={snapTo1} onMouseEnter={() => { hovered.current[1] = 1 }} onMouseLeave={() => { hovered.current[1] = 0 }}>About Me</div>
        <div ref={box2} className={styles.box} onClick={snapTo2} onMouseEnter={() => { hovered.current[2] = 1 }} onMouseLeave={() => { hovered.current[2] = 0 }}>Playground</div>
      </nav>
    </>
  )
}
