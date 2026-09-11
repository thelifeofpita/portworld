'use client'

import { useState, useRef, useEffect, useCallback, RefObject } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useAnimationFrame } from 'framer-motion'
import { posStore } from '@/lib/posStore'
import { zoneStore } from '@/lib/zoneStore'
import { zoneTransitionStore } from '@/lib/zoneTransitionStore'
import { rerollPalette } from '@/lib/paletteStore'
import { debugStore, hexToRgb255 } from '@/lib/debugStore'
import { observeLayout } from '@/lib/layoutMeasurement'
import { subscribeFrame } from '@/lib/frameScheduler'
import { bigProjectSlotStore } from '@/lib/bigProjectSlotStore'
import { bigProjectGlowStore } from '@/lib/bigProjectGlowStore'
import { bigProjectFootprintStore } from '@/lib/bigProjectFootprintStore'
import { bigProjectExpandStore } from '@/lib/bigProjectExpandStore'
import { aboutContent } from '@/content/aboutContent'
import { projectsContent, type ProjectItem } from '@/content/projectsContent'
const PlaygroundGallery = dynamic(() => import('./PlaygroundGallery'))
import { CUSTOM_LAYOUTS } from './customLayouts'
import type { Zone } from '@/types'
import styles from './MobilePage.module.css'

const Scene = dynamic(() => import('@/components/canvas/Scene'), { ssr: false })

// ─── Shared constants ─────────────────────────────────────────────────────────

const ACCENT_SMOOTH = 0.16

// Must match .mobileCanvasArea height in CSS
const CANVAS_VH = 0.45

const EASE_OUT = [0.22, 1, 0.36, 1] as const

// dt-normalized smoothing factor for the selected-card glow's fade in/out —
// same shape/pace as desktop's hover-glow smoothing (see ContentPanel.tsx).
const GLOW_SMOOTH = 0.14


// ─── Zone Nav ────────────────────────────────────────────────────────────────

interface MobileZoneNavProps {
  activeZone:    Zone | null
  canvasAreaRef: RefObject<HTMLDivElement | null>
}

function MobileZoneNav({ activeZone, canvasAreaRef }: MobileZoneNavProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef       = useRef<SVGSVGElement>(null)

  const box0  = useRef<HTMLDivElement>(null)
  const box1  = useRef<HTMLDivElement>(null)
  const box2  = useRef<HTMLDivElement>(null)
  const line0 = useRef<SVGLineElement>(null)
  const line1 = useRef<SVGLineElement>(null)
  const line2 = useRef<SVGLineElement>(null)
  const dot0  = useRef<SVGCircleElement>(null)
  const dot1  = useRef<SVGCircleElement>(null)
  const dot2  = useRef<SVGCircleElement>(null)
  const ul0   = useRef<SVGRectElement>(null)
  const ul1   = useRef<SVGRectElement>(null)
  const ul2   = useRef<SVGRectElement>(null)

  const boxRefs  = [box0,  box1,  box2]
  const lineRefs = [line0, line1, line2]
  const dotRefs  = [dot0,  dot1,  dot2]
  const ulRefs   = [ul0,   ul1,   ul2]
  const blends   = useRef(new Float64Array(3))

  const snap = (zone: Zone) => {
    zoneStore.snapToZone?.(zone)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useAnimationFrame((_, delta) => {
    if (!containerRef.current || !svgRef.current) return
    const cRect = containerRef.current.getBoundingClientRect()
    svgRef.current.style.visibility = cRect.bottom < 0 ? 'hidden' : 'visible'

    const canvasH = canvasAreaRef.current?.offsetHeight ?? window.innerHeight * CANVAS_VH

    const dt      = Math.min(delta, 100) / 16.67
    const accentF = 1 - Math.pow(1 - ACCENT_SMOOTH, dt)

    // Accent colors — sourced from the debug menu (same uniforms PostProcessing
    // uses), read live each frame since the random palette overwrites these on load.
    const COLOR_BASE  = hexToRgb255(debugStore.accentBaseColor)
    const COLOR_FOCUS = hexToRgb255(debugStore.accentFocusColor)

    boxRefs.forEach((boxRef, i) => {
      const box  = boxRef.current
      const line = lineRefs[i].current
      const dot  = dotRefs[i].current
      const ul   = ulRefs[i].current
      if (!box || !line || !dot) return

      const boxRect = box.getBoundingClientRect()

      const lx = boxRect.left + boxRect.width / 2 - cRect.left
      const ly = boxRect.top - cRect.top

      const mx = posStore[i as 0 | 1 | 2].x - cRect.left
      const my = posStore[i as 0 | 1 | 2].y - cRect.top

      line.setAttribute('x1', String(lx))
      line.setAttribute('y1', String(ly))
      line.setAttribute('x2', String(mx))
      line.setAttribute('y2', String(my))
      dot.setAttribute('cx', String(mx))
      dot.setAttribute('cy', String(my))

      if (ul) {
        ul.setAttribute('x',     String(boxRect.left  - cRect.left))
        ul.setAttribute('y',     String(boxRect.bottom - cRect.top))
        ul.setAttribute('width', String(boxRect.width))
      }

      const target = (activeZone !== null && i === activeZone) ? 1 : 0
      blends.current[i] += (target - blends.current[i]) * accentF
      const b   = blends.current[i]
      const r   = Math.round(COLOR_BASE[0] + (COLOR_FOCUS[0] - COLOR_BASE[0]) * b)
      const g   = Math.round(COLOR_BASE[1] + (COLOR_FOCUS[1] - COLOR_BASE[1]) * b)
      const bv  = Math.round(COLOR_BASE[2] + (COLOR_FOCUS[2] - COLOR_BASE[2]) * b)
      const css = `rgb(${r},${g},${bv})`

      line.setAttribute('stroke', css)
      dot.setAttribute('fill',   css)
      if (ul) ul.setAttribute('fill', css)
      // Label color: plain CSS `color: var(--fg-color)` on .mobileZoneNavBox
      // (same as desktop's ZoneNav .box) — no per-frame JS needed, and no
      // risk of the mismatch that was here before: fgStore mirrors a
      // THREE.Color, which Three's color management stores LINEAR, but this
      // built the rgb() string straight from fgStore.r/g/b as if they were
      // already sRGB 0-255 — same hex, visibly darker/desaturated than the
      // CSS var every other piece of fg-colored UI (including desktop's
      // nav) actually uses.
    })
  })

  return (
    <div ref={containerRef} className={styles.mobileZoneNavContainer}>
      <svg ref={svgRef} className={styles.mobileZoneNavSvg} aria-hidden="true">
        <line ref={line0} strokeWidth="1.5" stroke="var(--accent-base-color)" />
        <line ref={line1} strokeWidth="1.5" stroke="var(--accent-base-color)" />
        <line ref={line2} strokeWidth="1.5" stroke="var(--accent-base-color)" />
        <circle ref={dot0} r="3" fill="var(--accent-base-color)" />
        <circle ref={dot1} r="3" fill="var(--accent-base-color)" />
        <circle ref={dot2} r="3" fill="var(--accent-base-color)" />
        <rect ref={ul0} height="1.5" />
        <rect ref={ul1} height="1.5" />
        <rect ref={ul2} height="1.5" />
      </svg>

      <nav className={styles.mobileZoneNavLabels} aria-label="Sections">
        <div ref={box2} className={styles.mobileZoneNavBox} onClick={() => snap(2)}>Playground</div>
        <div ref={box0} className={styles.mobileZoneNavBox} onClick={() => snap(0)}>Projects</div>
        <div ref={box1} className={styles.mobileZoneNavBox} onClick={() => snap(1)}>About Me</div>
      </nav>
    </div>
  )
}

// ─── Playground ───────────────────────────────────────────────────────────────

// ─── Projects ─────────────────────────────────────────────────────────────────
//
// Real in-scene 3D models — the same InSceneProjectModel every desktop
// project uses (full studio lighting rig, per-project material tuning, real
// shadows), not a boxed/cropped card thumbnail. Scene.tsx now warms and
// mounts these on mobile too (it used to skip mobile project models
// entirely, falling back to flat poster cards); this file only owns the DOM
// layout — an invisible measurement box per project (MobileProjectSlot,
// mirroring ContentPanel.tsx's BigProjectCardSlot) publishes its live rect
// into bigProjectSlotStore every frame, and the actual model — rendered
// inside Scene.tsx's shared canvas, not a canvas of its own — reads that to
// position/scale/rotate itself, breaking out of its nominal box exactly like
// desktop's cards do rather than being cropped to fit it.
//
// Scrolling still picks whichever slot is nearest the viewport center as
// "focused" — that one gets the silhouette hover-glow (desktop's version of
// this comes from a real cursor hover, which mobile doesn't have). A tap
// opens the project's full detail, routed through bigProjectExpandStore —
// the same plain-callback bridge desktop's ProjectsPane uses, since the
// actual clickable surface is a mesh raycast inside the canvas now, not a
// DOM element (the slot is pointer-events:none, same reasoning as
// .bigProjectModelSlot on desktop).

// Two plain columns (even index left, odd right — see MobileProjects) —
// each item flows in normal document order, no per-item position. rollDeg is
// a static screen-plane roll (rotation.z, around the view axis — the same
// effect as tilting a photo); yawDeg is a smaller 3D turn (rotation.y) on
// top, for the objects with real depth where it still reads as one.
const MOBILE_PROJECT_LAYOUT: Record<number, { yawDeg: number; rollDeg: number }> = {
  0: { yawDeg:  8, rollDeg: -22 }, // Surf the Spike
  1: { yawDeg: -6, rollDeg:  18 }, // Duolingo
  2: { yawDeg:  6, rollDeg: -14 }, // Verified magazine
  3: { yawDeg: -10, rollDeg:  26 }, // Hat Twix
  4: { yawDeg:  8, rollDeg: -20 }, // Pick a Side fries
  5: { yawDeg: -8, rollDeg:  16 }, // Back in Smoothly
}

// A shared "look up → look down" pitch (rotation.x) as you scroll through
// the whole grid — every model tilted up slightly at the top of the section,
// tilted down slightly by the time you've scrolled past the last one. One
// value for all 6 (not per-item), updated by MobileProjects' own scroll
// listener (see mobileProjectScrollPitch's writer) and read every frame by
// each MobileProjectSlot below — a plain mutable object rather than React
// state so a continuous scroll gesture never re-renders the grid, same
// cross-boundary-store pattern as bigProjectSlotStore itself.
const mobileProjectScrollPitch = { deg: 0 }
const MOBILE_PITCH_RANGE_DEG = 9 // "subtle" — +9° (looking up) at the top, -9° (looking down) by the bottom

function MobileProjectSlot({
  index, isFocused, onRef,
}: {
  index:      number
  isFocused:  boolean
  onRef:      (el: HTMLDivElement | null) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const isFocusedRef = useRef(isFocused)
  useEffect(() => { isFocusedRef.current = isFocused }, [isFocused])

  useEffect(() => {
    if (!rootRef.current) return
    const measurement = observeLayout(rootRef.current)
    let lastTime = performance.now()
    const glowProgress = { current: 0 }
    const tick = (now: number) => {
      if (!measurement.rect) return
      const r = measurement.rect
      const layout = MOBILE_PROJECT_LAYOUT[index]
      bigProjectSlotStore[index] = {
        top: r.top, left: r.left, width: r.width, height: r.height,
        tiltXDeg: mobileProjectScrollPitch.deg, tiltYDeg: layout.yawDeg, rollDeg: layout.rollDeg,
      }

      // Same silhouette hover-glow desktop's cursor drives — mobile has no
      // hover, so this publishes it for whichever slot is scroll-focused,
      // reading the model's own live on-screen footprint (populated every
      // frame it's visible, independent of hover — see bigProjectFootprintStore).
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now
      const f = 1 - Math.pow(1 - GLOW_SMOOTH, dt * 60)
      glowProgress.current += ((isFocusedRef.current ? 1 : 0) - glowProgress.current) * f
      const footprint = bigProjectFootprintStore.entries[index]
      bigProjectGlowStore.entries[index] = footprint && glowProgress.current > 0.001
        ? { ...footprint, opacity: glowProgress.current }
        : null
    }
    const stop = subscribeFrame(tick, measurement.read)
    return () => {
      stop()
      measurement.dispose()
      bigProjectSlotStore[index] = null
      bigProjectGlowStore.entries[index] = null
    }
  }, [index])

  return <div ref={el => { rootRef.current = el; onRef(el) }} className={styles.mobileProjectSlot} />
}

function MobileProjectDetail({
  item, onClose, onPrev, onNext,
}: { item: ProjectItem; onClose: () => void; onPrev: () => void; onNext: () => void }) {
  const CustomLayout  = item.customLayout ? CUSTOM_LAYOUTS[item.customLayout] : null
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [])

  return createPortal(
    <motion.div
      className={styles.mobileProjectDetailOverlay}
      style={CustomLayout ? { backgroundColor: item.detailBackground ?? item.accentColor } : undefined}
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      role="dialog" aria-modal="true" aria-label={item.title}
    >
      {CustomLayout ? (
        // Every CustomLayout renders its own prev/next/close nav internally
        // (see CampaignCase.tsx, PickASide/BackInSmoothly/SurfTheSpike's own
        // ProjectNav) — an outer header here would just duplicate it.
        <CustomLayout onPrev={onPrev} onNext={onNext} onClose={onClose} />
      ) : (
        <>
          <div className={styles.mobileProjectDetailHeader}>
            <button className={styles.mobileProjectDetailNavBtn} onClick={onPrev} aria-label="Previous project">← Previous</button>
            <button ref={closeRef} className={styles.mobileProjectDetailClose} onClick={onClose} aria-label="Close">[X]</button>
            <button className={styles.mobileProjectDetailNavBtn} onClick={onNext} aria-label="Next project">Next →</button>
          </div>
          <h2 className={styles.mobileProjectDetailTitle}>{item.title}</h2>
          <p className={styles.mobileProjectDesc}>{item.description}</p>

          {item.youtubeId && (
            <div className={styles.mobileProjectVideo}>
              <iframe
                src={`https://www.youtube.com/embed/${item.youtubeId}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={item.title}
              />
            </div>
          )}

          {item.images[0] && (
            <div className={styles.mobileProjectImageWrap}>
              <Image src={item.images[0]} alt="" fill quality={90} style={{ objectFit: 'cover' }} sizes="100vw" />
            </div>
          )}
          {item.images[1] && (
            <div className={styles.mobileProjectImageWrap}>
              <Image src={item.images[1]} alt="" fill quality={90} style={{ objectFit: 'cover' }} sizes="100vw" />
            </div>
          )}
        </>
      )}
    </motion.div>,
    document.body
  )
}

function MobileProjects({ active }: { active: boolean }) {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  // Only tracks scroll while Projects is the actual active zone — this
  // component stays mounted (hidden) in the other zones (Scene.tsx keeps
  // every model warmed regardless, same as desktop), and
  // getBoundingClientRect() against a hidden, off-flow section wouldn't mean
  // anything anyway.
  useEffect(() => {
    if (!active) return
    const pick = () => {
      const vpCenter = window.innerHeight / 2
      let best: number | null = null, bestDist = Infinity
      let maxBottom = 0
      itemRefs.current.forEach((el, i) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        const d = Math.abs(r.top + r.height / 2 - vpCenter)
        if (d < bestDist) { bestDist = d; best = i }
        maxBottom = Math.max(maxBottom, r.bottom + window.scrollY)
      })
      setSelectedIndex(best)

      // Global "look up → look down" pitch (see mobileProjectScrollPitch
      // above) — 0 at the very top of the scroll (haven't scrolled at all),
      // 1 once you've scrolled enough that the last piece's own bottom edge
      // clears the bottom of the viewport (seen the whole grid).
      const scrollRange = Math.max(1, maxBottom - window.innerHeight)
      const progress = Math.max(0, Math.min(1, window.scrollY / scrollRange))
      mobileProjectScrollPitch.deg = MOBILE_PITCH_RANGE_DEG * (1 - 2 * progress)
    }
    pick()
    window.addEventListener('scroll', pick, { passive: true })
    window.addEventListener('resize', pick)
    // Deliberately no setSelectedIndex(null) here — Strict Mode's mount/
    // cleanup/remount double-invoke in dev collapsed that reset together
    // with the very pick() it was meant to follow, net result never
    // settling. MobileProjectSlot's isFocused is gated on `active` directly
    // below instead, which gets the same "stop glowing once hidden" result
    // without a state reset racing the mount cycle.
    return () => {
      window.removeEventListener('scroll', pick)
      window.removeEventListener('resize', pick)
    }
  }, [active])

  // Bridge for the in-scene model's click-to-expand — it lives inside
  // Scene.tsx's <Canvas>, a separate React reconciler root that can't
  // receive a normal prop. Same plain-callback pattern desktop's
  // ProjectsPane uses for the identical bridge.
  useEffect(() => {
    bigProjectExpandStore.onExpand = index => setOpenIndex(index)
    return () => { bigProjectExpandStore.onExpand = null }
  }, [])

  const n = projectsContent.length
  const leftIndices  = projectsContent.map((_, i) => i).filter(i => i % 2 === 0)
  const rightIndices = projectsContent.map((_, i) => i).filter(i => i % 2 === 1)

  const renderSlot = (i: number) => (
    <MobileProjectSlot key={i} index={i} isFocused={active && selectedIndex === i} onRef={el => { itemRefs.current[i] = el }} />
  )

  return (
    <>
      <div className={styles.mobileProjectGrid}>
        <div className={styles.mobileProjectGridCol}>{leftIndices.map(renderSlot)}</div>
        <div className={styles.mobileProjectGridCol}>{rightIndices.map(renderSlot)}</div>
      </div>
      <AnimatePresence>
        {openIndex !== null && (
          <MobileProjectDetail
            key="detail"
            item={projectsContent[openIndex]}
            onClose={() => setOpenIndex(null)}
            onPrev={() => setOpenIndex((openIndex - 1 + n) % n)}
            onNext={() => setOpenIndex((openIndex + 1) % n)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── About ────────────────────────────────────────────────────────────────────

function MobileAbout() {
  const [photoIndex, setPhotoIndex] = useState(0)
  const [prevIndex, setPrevIndex]   = useState<number | null>(null)

  useEffect(() => {
    aboutContent.photos.forEach(src => { new window.Image().src = src })
  }, [])

  useEffect(() => {
    if (aboutContent.photos.length <= 1) return
    const id = setInterval(() => {
      setPhotoIndex(i => {
        setPrevIndex(i)
        return (i + 1) % aboutContent.photos.length
      })
    }, 250)
    return () => clearInterval(id)
  }, [])

  const photo     = aboutContent.photos[photoIndex]
  const prevPhoto = prevIndex !== null ? aboutContent.photos[prevIndex] : null

  return (
    <div className={styles.mobileAbout}>
      <div className={styles.mobileAboutHeader}>
        <div className={styles.mobilePhotoContainer}>
          <div className={styles.mobilePhotoWrapper}>
            {prevPhoto && (
              <img src={prevPhoto} alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            )}
            {photo && (
              <img key={photoIndex} src={photo} alt="" className={styles.mobilePhotoImg}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            )}
          </div>
        </div>
        <div
          className={styles.mobileAboutName}
          onClick={() => { zoneStore.resetToLanding?.(); rerollPalette() }}
          role="button"
          aria-label="THELIFEOFPITA — tap to change theme colors"
        >
          <span className={styles.mobileAboutBylineText}>THELIFEOF<span className={styles.mobileAboutBylinePita}>PITA</span></span>
        </div>
      </div>

      <p className={styles.mobileBio}>{aboutContent.bio}</p>

      <div className={styles.mobileCv}>
        {aboutContent.cv.experience.length > 0 && (
          <div className={styles.mobileCvSection}>
            <h3 className={styles.mobileCvHeading}>Experience</h3>
            {aboutContent.cv.experience.map((it, i) => (
              <div key={i} className={styles.mobileCvItem}>
                <span className={styles.mobileCvTitle}>{it.title}</span>
                <span className={styles.mobileCvMeta}>{it.meta}</span>
              </div>
            ))}
          </div>
        )}
        {aboutContent.cv.education.length > 0 && (
          <div className={styles.mobileCvSection}>
            <h3 className={styles.mobileCvHeading}>Education</h3>
            {aboutContent.cv.education.map((it, i) => (
              <div key={i} className={styles.mobileCvItem}>
                <span className={styles.mobileCvTitle}>{it.title}</span>
                <span className={styles.mobileCvMeta}>{it.meta}</span>
              </div>
            ))}
          </div>
        )}
        {aboutContent.cv.skills.length > 0 && (
          <div className={styles.mobileCvSection}>
            <h3 className={styles.mobileCvHeading}>Skills</h3>
            <div className={styles.mobileCvSkillsGrid}>
              {aboutContent.cv.skills.map((s, i) => (
                <p key={i} className={styles.mobileCvTitle}>{s}</p>
              ))}
            </div>
          </div>
        )}
        {aboutContent.cv.awards.length > 0 && (
          <div className={styles.mobileCvSection}>
            <h3 className={styles.mobileCvHeading}>Awards</h3>
            {aboutContent.cv.awards.map((a, i) => (
              <p key={i} className={styles.mobileCvTitle}>{a}</p>
            ))}
          </div>
        )}
        {aboutContent.cv.languages.length > 0 && (
          <div className={styles.mobileCvSection}>
            <h3 className={styles.mobileCvHeading}>Languages</h3>
            {aboutContent.cv.languages.map((l, i) => (
              <p key={i} className={styles.mobileCvTitle}>{l}</p>
            ))}
          </div>
        )}
        <a href="/JOSE_PITA_EN.pdf" target="_blank" rel="noopener noreferrer" className={styles.mobileCvDownload}>
          ▾ Full CV
        </a>
      </div>

      {/* Contact links live here in section-based layout */}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface MobilePageProps {
  activeZone:   Zone | null
  onZoneChange: (zone: Zone) => void
  onZoneReset:  () => void
  onPrepared?: () => void
  warming?: boolean
  onLoad:       () => void
}

export default function MobilePage({ activeZone, onZoneChange, onZoneReset, onLoad, onPrepared, warming = false }: MobilePageProps) {
  const canvasAreaRef = useRef<HTMLDivElement>(null)
  const projectsRef = useRef<HTMLElement>(null)
  const prepared = useCallback(() => {
    const images = [...(projectsRef.current?.querySelectorAll('img') ?? [])]
    void Promise.all(images.map(img => img.decode().catch(() => {}))).then(() => onPrepared?.())
  }, [onPrepared])
  const hiddenSection = { position: 'absolute' as const, visibility: 'hidden' as const, pointerEvents: 'none' as const, width: '100%', top: 0, left: 0 }

  // PostProcessing.tsx's outer-glow passes (Projects' always-on glow, and
  // Playground/About's hover-only glow) are gated on zoneTransitionStore —
  // normally written every frame by ContentPanel.tsx's own rAF loop, which
  // doesn't mount on mobile. Without this, uPgGlowOpacity/uGlowOpacity stay
  // permanently 0 and no glow renders no matter what's published into
  // playgroundGlowStore. Mobile has no cross-fade choreography to match, so
  // this just snaps blend to 1 the instant a zone is active. projectsOpacity
  // additionally gates whether InSceneProjectModel shows itself at all
  // (desktop derives it from the camera-pull overlay's own live opacity;
  // mobile has no such overlay, so this just snaps it to 1/0 the same way).
  useEffect(() => {
    zoneTransitionStore.displayedZone = activeZone
    zoneTransitionStore.blend = activeZone !== null ? 1 : 0
    zoneTransitionStore.projectsOpacity = activeZone === 0 ? 1 : 0
  }, [activeZone])

  return (
    <>
      {/* Full-page fixed canvas — provides background everywhere, no seam against HTML */}
      <Scene
        onZoneChange={onZoneChange}
        onZoneReset={onZoneReset}
        onLoad={onLoad}
        isMobile={true}
      />

      <main className={styles.mobileMain}>
        {/* Spacer — height reference for ZoneNav SVG line calculations */}
        <div ref={canvasAreaRef} className={styles.mobileCanvasArea} />

        {/* Zone nav — right below canvas, SVG lines overflow upward */}
        <MobileZoneNav activeZone={activeZone} canvasAreaRef={canvasAreaRef} />

      {/* Keep prepared sections mounted; only the active one occupies scroll space. */}
      <AnimatePresence mode="wait">
        {(
          <motion.section
            key="projects" ref={projectsRef}
            style={activeZone === 0 ? undefined : hiddenSection}
            aria-hidden={activeZone !== 0}
            initial={{ opacity: 0 }} animate={{ opacity: activeZone === 0 ? 1 : 0 }}
            transition={{ duration: 0.2 }}
            className={`${styles.mobileSection} ${styles.mobileProjectsSection}`}
          >
            <MobileProjects active={activeZone === 0} />
          </motion.section>
        )}
        {activeZone === 1 && (
          <motion.section
            key="about"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={styles.mobileSection}
          >
            <MobileAbout />
          </motion.section>
        )}
        {(
          <motion.section
            key="playground"
            style={activeZone === 2 ? undefined : hiddenSection}
            aria-hidden={activeZone !== 2}
            initial={{ opacity: 0 }} animate={{ opacity: activeZone === 2 ? 1 : 0 }}
            transition={{ duration: 0.2 }}
            className={styles.mobileSection}
          >
            <PlaygroundGallery mobile active={warming || activeZone === 2} warming={warming} onPrepared={prepared} />
          </motion.section>
        )}
      </AnimatePresence>

      {/* Contact footer — visible only when a section is active */}
      <AnimatePresence>
        {activeZone !== null && (
          <motion.footer
            key="footer"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={styles.mobileFooter}
          >
            <div className={styles.mobileFooterSeparator} aria-hidden="true" />
            <div className={styles.mobileFooterLinks}>
              {aboutContent.linkedin && (
                <a href={aboutContent.linkedin} target="_blank" rel="noopener noreferrer" className={styles.mobileContactLink}>
                  LinkedIn
                </a>
              )}
              {aboutContent.instagram && (
                <a href={aboutContent.instagram} target="_blank" rel="noopener noreferrer" className={styles.mobileContactLink}>
                  Instagram
                </a>
              )}
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
    </main>
    </>
  )
}
