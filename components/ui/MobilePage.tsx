'use client'

import { memo, useState, useRef, useEffect, useLayoutEffect, type CSSProperties } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { posStore } from '@/lib/posStore'
import { zoneStore } from '@/lib/zoneStore'
import { zoneTransitionStore } from '@/lib/zoneTransitionStore'
import { rerollPalette } from '@/lib/paletteStore'
import { debugStore, hexToRgb255 } from '@/lib/debugStore'
import { startMobileWarmup } from '@/lib/mobileWarmup'
import { mobileOverlayStore } from '@/lib/mobileLayout'
import { lockScroll } from '@/lib/scrollLock'
import { subscribeFrame } from '@/lib/frameScheduler'
import { setAttr, setStyle, px } from '@/lib/domWrites'
import { EASE_OUT } from '@/lib/motionEasing'
import { aboutContent } from '@/content/aboutContent'
import { projectsContent, type ProjectItem } from '@/content/projectsContent'
const PlaygroundGallery = dynamic(() => import('./PlaygroundGallery'))
import { CUSTOM_LAYOUTS, prefetchCustomLayouts } from './customLayouts'
import type { Zone } from '@/types'
import styles from './MobilePage.module.css'

const Scene = dynamic(() => import('@/components/canvas/Scene'), { ssr: false })

// ─── Shared constants ─────────────────────────────────────────────────────────

const ACCENT_SMOOTH = 0.16


// ─── Zone Nav ────────────────────────────────────────────────────────────────

interface MobileZoneNavProps {
  activeZone: Zone | null
}

function MobileZoneNav({ activeZone }: MobileZoneNavProps) {
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

  const activeZoneRef = useRef(activeZone)
  useEffect(() => { activeZoneRef.current = activeZone }, [activeZone])

  // All four rects are read in the shared scheduler's read phase, before any
  // subscriber writes. Reading them interleaved with this loop's own SVG
  // writes forced up to four layouts per frame, for the life of the page.
  useEffect(() => {
    let last = performance.now()
    let baseHex = '', focusHex = ''
    let COLOR_BASE = hexToRgb255(debugStore.accentBaseColor)
    let COLOR_FOCUS = hexToRgb255(debugStore.accentFocusColor)
    let cRect: DOMRect | null = null
    const boxRects: (DOMRect | null)[] = [null, null, null]
    const read = () => {
      cRect = containerRef.current?.getBoundingClientRect() ?? null
      // Scrolled past: the SVG is hidden, so the labels need no measuring.
      if (!cRect || cRect.bottom < 0) return
      for (let i = 0; i < 3; i++) boxRects[i] = boxRefs[i].current?.getBoundingClientRect() ?? null
    }
    return subscribeFrame(now => {
      const delta = now - last
      last = now
      const svg = svgRef.current
      if (!cRect || !svg) return
      const offscreen = cRect.bottom < 0
      setStyle(svg, 'visibility', offscreen ? 'hidden' : 'visible')

      const dt      = Math.min(delta, 100) / 16.67
      const accentF = 1 - Math.pow(1 - ACCENT_SMOOTH, dt)

      // Accent colors — sourced from the debug menu (same uniforms PostProcessing
      // uses); the random palette overwrites these on load, so re-parse on change.
      if (debugStore.accentBaseColor !== baseHex) { baseHex = debugStore.accentBaseColor; COLOR_BASE = hexToRgb255(baseHex) }
      if (debugStore.accentFocusColor !== focusHex) { focusHex = debugStore.accentFocusColor; COLOR_FOCUS = hexToRgb255(focusHex) }

      for (let i = 0; i < 3; i++) {
        const target = (activeZoneRef.current !== null && i === activeZoneRef.current) ? 1 : 0
        blends.current[i] += (target - blends.current[i]) * accentF
        if (offscreen) continue

        const line = lineRefs[i].current
        const dot  = dotRefs[i].current
        const ul   = ulRefs[i].current
        const boxRect = boxRects[i]
        if (!boxRect || !line || !dot) continue

        const lx = boxRect.left + boxRect.width / 2 - cRect.left
        const ly = boxRect.top - cRect.top

        const mx = posStore[i as 0 | 1 | 2].x - cRect.left
        const my = posStore[i as 0 | 1 | 2].y - cRect.top

        setAttr(line, 'x1', px(lx))
        setAttr(line, 'y1', px(ly))
        setAttr(line, 'x2', px(mx))
        setAttr(line, 'y2', px(my))
        setAttr(dot, 'cx', px(mx))
        setAttr(dot, 'cy', px(my))

        if (ul) {
          setAttr(ul, 'x',     px(boxRect.left  - cRect.left))
          setAttr(ul, 'y',     px(boxRect.bottom - cRect.top))
          setAttr(ul, 'width', px(boxRect.width))
        }

        const b   = blends.current[i]
        const r   = Math.round(COLOR_BASE[0] + (COLOR_FOCUS[0] - COLOR_BASE[0]) * b)
        const g   = Math.round(COLOR_BASE[1] + (COLOR_FOCUS[1] - COLOR_BASE[1]) * b)
        const bv  = Math.round(COLOR_BASE[2] + (COLOR_FOCUS[2] - COLOR_BASE[2]) * b)
        const css = `rgb(${r},${g},${bv})`

        setAttr(line, 'stroke', css)
        setAttr(dot, 'fill',   css)
        if (ul) setAttr(ul, 'fill', css)
        // Label color: plain CSS `color: var(--fg-color)` on .mobileZoneNavBox
        // (same as desktop's ZoneNav .box) — no per-frame JS needed.
      }
    }, read)
  // Everything the loop reads is a ref or a module store.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
// A static image of each project's live 3D model (see scripts/capture-
// mobile-project-thumbs.mjs + process-mobile-project-thumbs.mjs — a one-time
// Playwright capture of the real InSceneProjectModel render, chroma-keyed to
// a transparent background and trimmed to content), not a live WebGL render.
// Desktop is unaffected — ContentPanel.tsx still mounts the real
// InSceneProjectModel there. Six simultaneous live renders (full studio
// lighting, shadows, env-mapping) is real weight to carry through a
// scrolling mobile page for comparatively little payoff at thumbnail size,
// and it was the underlying reason mobile's Projects grid ever had to route
// taps through a canvas mesh raycast (pointer-events:none DOM forwarding to
// the canvas below) instead of a plain DOM element — which was itself the
// root cause of an earlier scroll-vs-rotate touch conflict. A real `<img>` +
// `<button>` here sidesteps that class of problem entirely: touches over the
// grid now hit real DOM elements first and never reach the canvas.
//
// Each piece's own yaw and screen-plane roll are baked into its capture (see
// /capture-mobile-thumbs). The only thing applied at runtime is
// mobileProjectScrollPitch — the shared scroll-driven "look up → look down"
// tilt — written imperatively as a plain CSS transform from MobileProjects'
// own rAF-coalesced scroll handler, so a continuous scroll gesture never
// triggers a React re-render.

// Two plain columns (even index left, odd right — see MobileProjects) —
// each item flows in normal document order, no per-item position.
//
// There is deliberately NO per-item rotation map here any more. Both the yaw
// (rotation.y) and the screen-plane roll (rotation.z) are dialed in at
// capture time by /capture-mobile-thumbs, which owns the single copy of
// those angles — see MOBILE_PROJECT_LAYOUT there. This file used to declare
// the same six rollDeg values again and re-apply them as a CSS rotate on the
// already-rolled image, so every thumbnail shipped at double its intended
// angle (Surf the Spike at −44° rather than −22°, Hat Twix at +52°). That
// skew is what made the phone UI and magazine covers unreadable at this
// size, and what pushed the wider crops across the column gutter into their
// neighbours. It also silently invalidated mobileThumbWidthPct, which
// process-mobile-project-thumbs.mjs measures from the once-rolled crop.

// A shared "look up → look down" pitch (rotation.x) as you scroll through
// the whole grid — every model tilted up slightly at the top of the section,
// tilted down slightly by the time you've scrolled past the last one. One
// value for all 6 (not per-item), updated by MobileProjects' own scroll
// listener and applied straight to each <img>'s style in that same
// handler — a plain mutable object rather than React state so a continuous
// scroll gesture never re-renders the grid.
const mobileProjectScrollPitch = { deg: 0 }
const MOBILE_PITCH_RANGE_DEG = 9 // "subtle" — +9° (looking up) at the top, -9° (looking down) by the bottom

// How much a piece grows at the very centre of the viewport, and how far from
// that centre the effect reaches (as a fraction of viewport height). The
// falloff is what makes this continuous rather than a switch — see the
// transform loop in MobileProjects for why that matters.
const FOCUS_SCALE_RANGE = 0.05
const FOCUS_FALLOFF_VH  = 0.5

// mobileThumbWidthPct is measured as the model's width relative to the slot it
// was photographed in — and it was photographed on DESKTOP, where that slot is
// 362px wide. A mobile column is about 155px. So displaying at the raw measured
// percentage reproduces desktop's proportions but lands the models at under
// half their desktop size in absolute terms: the Surf the Spike phone comes out
// 73 CSS px wide against ~170 on desktop.
//
// At 73px a dark-mode phone UI stops reading as a screen and becomes a dark
// rectangle, which is what "the screen is extremely dark" actually was — the
// pixels match desktop exactly (whites peak at 242 in both), there just aren't
// enough of them on screen to read. So the thumbnails are displayed larger than
// desktop's slot ratio implies. A phone is small; the artwork has to be bigger
// on it, not proportionally the same.
//
// Kept here rather than baked into the captured data so it stays a display
// decision, separate from the measurement. Sized so the widest piece (Back in
// Smoothly, 72%) stays inside .mobileProjectImage's break-out clamp.
const MOBILE_DISPLAY_BOOST = 1.6

function MobileProjectSlot({
  index, item, onOpen, onRef, onImgRef,
}: {
  index:  number
  item:   ProjectItem
  onOpen: () => void
  onRef:    (el: HTMLDivElement | null) => void
  onImgRef: (el: HTMLImageElement | null) => void
}) {
  const widthPct = (item.mobileThumbWidthPct ?? 100) * MOBILE_DISPLAY_BOOST
  const aspect   = item.mobileThumbAspect ?? 1

  return (
    <div
      ref={onRef}
      className={styles.mobileProjectSlot}
      data-project-index={index}
      style={{
        '--thumb-width-pct': `${widthPct}%`,
        // The image's rendered height as a % of the slot's width — the stage
        // below reserves exactly this via padding-top, so a piece can no
        // longer spill onto the one above or below it.
        '--thumb-height-pct': `${(widthPct / aspect).toFixed(1)}%`,
      } as CSSProperties}
    >
      {/* The piece itself is the only thing on the card — no caption. The
          accessible name comes from aria-label so the button still announces
          which project it opens. */}
      <button className={styles.mobileProjectBtn} onClick={onOpen} aria-label={`Open ${item.title}`}>
        <span className={styles.mobileProjectStage}>
          {item.mobileThumb && (
            <img
              ref={onImgRef}
              src={item.mobileThumb}
              srcSet={item.mobileThumbSrcSet}
              // What the image actually renders at: widthPct of a column, and a
              // column is half the page minus its side padding and the gutter
              // (1.25rem × 2 + 2.5rem = 5rem). Without this the browser assumes
              // 100vw and always pulls the largest candidate.
              sizes={`calc((100vw - 5rem) * ${(widthPct / 200).toFixed(4)})`}
              width={item.mobileThumbWidth}
              height={item.mobileThumbHeight}
              alt=""
              draggable={false}
              className={styles.mobileProjectImage}
            />
          )}
        </span>
      </button>
    </div>
  )
}

function MobileProjectDetail({
  item, index, onClose, onPrev, onNext,
}: { item: ProjectItem; index: number; onClose: () => void; onPrev: () => void; onNext: () => void }) {
  const CustomLayout  = item.customLayout ? CUSTOM_LAYOUTS[item.customLayout] : null
  const closeRef   = useRef<HTMLButtonElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Freeze the grid behind this overlay (see lib/scrollLock.ts for why
  // `body { overflow: hidden }` is not enough), and hide the 3D model while
  // it's up — the document isn't scrolling, so the model's own scroll-driven
  // fade is frozen wherever it happened to be.
  useEffect(() => {
    closeRef.current?.focus()
    mobileOverlayStore.open = true
    const unlock = lockScroll()
    return () => {
      mobileOverlayStore.open = false
      unlock()
    }
  }, [])

  // Prev/next swaps the project inside a persistent overlay (it's rendered
  // key="detail" so it never remounts), and the overlay is itself the
  // scrolling element — so without this you keep the previous case study's
  // scrollTop. Land on a shorter page and the browser clamps you near its
  // end with nothing above: the reported "can't scroll back up".
  useLayoutEffect(() => {
    overlayRef.current?.scrollTo({ top: 0 })
  }, [index])

  return createPortal(
    <motion.div
      ref={overlayRef}
      className={styles.mobileProjectDetailOverlay}
      style={CustomLayout ? { backgroundColor: item.detailBackground ?? item.accentColor } : undefined}
      // Opacity only — deliberately no `y` here. A transform on the element
      // that owns the scroll breaks iOS momentum scrolling for as long as it
      // is applied, which left the first flick after opening dead. The
      // entrance slide lives on the inner wrapper below instead.
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      role="dialog" aria-modal="true" aria-label={item.title}
    >
      <motion.div
        initial={{ y: 24 }} animate={{ y: 0 }} exit={{ y: 24 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
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
      </motion.div>
    </motion.div>,
    document.body
  )
}

function MobileProjects({ active }: { active: boolean }) {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const imgRefs  = useRef<(HTMLImageElement | null)[]>([])
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  // Only tracks scroll while Projects is the actual active zone — this
  // component stays mounted (hidden) in the other zones (Scene.tsx keeps
  // every model warmed regardless, same as desktop), and
  // getBoundingClientRect() against a hidden, off-flow section wouldn't mean
  // anything anyway.
  useEffect(() => {
    if (!active) return
    // getBoundingClientRect() forces a synchronous layout read — calling it
    // 6x (once per project) on every raw 'scroll' event, unthrottled, is a
    // classic jank source: a fast fling can fire dozens of scroll events per
    // second, each doing a full forced-reflow pass. Coalescing to at most
    // one measurement per animation frame (the standard fix) keeps this to
    // ~60/s worst case regardless of how many scroll events actually fired.
    let frame = 0
    const centers: number[] = []
    const measure = () => {
      frame = 0
      const vpCenter = window.innerHeight / 2
      let maxBottom = 0
      centers.length = 0
      itemRefs.current.forEach((el, i) => {
        if (!el) { centers[i] = Infinity; return }
        const r = el.getBoundingClientRect()
        centers[i] = r.top + r.height / 2 - vpCenter
        maxBottom = Math.max(maxBottom, r.bottom + window.scrollY)
      })

      // Global "look up → look down" pitch (see mobileProjectScrollPitch
      // above) — 0 at the very top of the scroll (haven't scrolled at all),
      // 1 once you've scrolled enough that the last piece's own bottom edge
      // clears the bottom of the viewport (seen the whole grid).
      const scrollRange = Math.max(1, maxBottom - window.innerHeight)
      const progress = Math.max(0, Math.min(1, window.scrollY / scrollRange))
      mobileProjectScrollPitch.deg = MOBILE_PITCH_RANGE_DEG * (1 - 2 * progress)

      // Written directly to each <img>'s style, not React state — a
      // continuous scroll gesture must never re-render the grid. No rotateZ
      // here — each image's roll is already baked into the capture (see the
      // comment above the removed layout map).
      //
      // The focus cue is a function of DISTANCE from the viewport centre, not
      // a winner-takes-all flag. It used to be `i === nearest ? 1.05 : 1`,
      // which meant that as you scrolled, one piece jumped to 1.05 the instant
      // it took the lead and the previous one snapped back — a visible pop on
      // every handover, six times down the grid. Easing each piece in and out
      // by its own distance keeps the cue and removes the discontinuity: at
      // any moment the scales are wherever the geometry puts them, so there is
      // nothing to jump between. (It reads as depth now rather than a
      // spotlight, which also suits a grid where two pieces sit side by side.)
      const falloff = window.innerHeight * FOCUS_FALLOFF_VH
      imgRefs.current.forEach((el, i) => {
        if (!el) return
        const t = Math.max(0, 1 - Math.abs(centers[i] ?? Infinity) / falloff)
        const eased = t * t * (3 - 2 * t)  // smoothstep — flat at both ends
        const scale = 1 + FOCUS_SCALE_RANGE * eased
        el.style.transform = `translate(-50%, -50%) perspective(900px) rotateX(${mobileProjectScrollPitch.deg}deg) scale(${scale.toFixed(4)})`
      })
    }
    const pick = () => { if (!frame) frame = requestAnimationFrame(measure) }
    pick()
    window.addEventListener('scroll', pick, { passive: true })
    window.addEventListener('resize', pick)
    return () => {
      window.removeEventListener('scroll', pick)
      window.removeEventListener('resize', pick)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [active])

  const n = projectsContent.length
  const leftIndices  = projectsContent.map((_, i) => i).filter(i => i % 2 === 0)
  const rightIndices = projectsContent.map((_, i) => i).filter(i => i % 2 === 1)

  const renderSlot = (i: number) => (
    <MobileProjectSlot
      key={i} index={i} item={projectsContent[i]}
      onOpen={() => setOpenIndex(i)}
      onRef={el => { itemRefs.current[i] = el }}
      onImgRef={el => { imgRefs.current[i] = el }}
    />
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
            index={openIndex}
            onClose={() => setOpenIndex(null)}
            onPrev={() => setOpenIndex((openIndex - 1 + n) % n)}
            onNext={() => setOpenIndex((openIndex + 1) % n)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// Memoized for the same reason as PlaygroundGallery: MobilePage re-renders on
// every zone change, and this grid depends only on `active`.
const MemoMobileProjects = memo(MobileProjects)

// ─── About ────────────────────────────────────────────────────────────────────

// The About photo's 250ms frame cycle, in its own component so each frame
// re-renders two <img>s instead of the whole About section and CV.
function MobilePhotoFrames() {
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
    <>
      {prevPhoto && (
        <img src={prevPhoto} alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      {photo && (
        <img key={photoIndex} src={photo} alt="" className={styles.mobilePhotoImg}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
    </>
  )
}

function MobileAbout() {
  return (
    <div className={styles.mobileAbout}>
      <div className={styles.mobileAboutHeader}>
        <div className={styles.mobilePhotoContainer}>
          <div className={styles.mobilePhotoWrapper}>
            <MobilePhotoFrames />
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
  // How an inactive section is parked. `fixed`, not `absolute`, and that is the
  // whole point: `visibility: hidden` does NOT take a box out of layout, and an
  // absolutely-positioned box still contributes scrollable overflow to its
  // containing block (.mobileMain, which is position:relative). With the two
  // inactive sections parked absolutely, the page carried 2420px of empty
  // scrollable space below the content — measured: body.scrollHeight 2847
  // against a real main height of 427 — so you could scroll off the bottom of
  // the site into nothing. A fixed-position box contributes no scrollable
  // overflow at all, which removes that space entirely (verified: 2847 -> 427).
  //
  // It still has to be a positioned-and-laid-out box rather than display:none:
  // PlaygroundGallery gates its warm-up on having a real measured width/height
  // (see its `!width || !height` guard), so a zero-size section would never
  // report itself prepared and the "Behold." loader would never lift. `fixed`
  // keeps full layout — confirmed both hidden sections still measure their real
  // 500x1106 / 500x2847 boxes.
  const hiddenSection = { position: 'fixed' as const, visibility: 'hidden' as const, pointerEvents: 'none' as const, width: '100%', top: 0, left: 0 }

  // Once the initial "Behold" warm-up has actually released (PlaygroundGallery's
  // own grid-preview warm-up has finished, via onPrepared below), background-
  // prefetch everything that warm-up doesn't cover — full playground-item
  // media and every custom-layout project's own photos — so opening one
  // later rarely shows content popping in. See lib/mobileWarmup.ts.
  useEffect(() => {
    if (warming) return
    startMobileWarmup()
    // Case-study page code, alongside the media warm-up above, so the first
    // open of a project does not also download and parse its page.
    const id = typeof requestIdleCallback === 'function' ? requestIdleCallback(prefetchCustomLayouts, { timeout: 5000 }) : window.setTimeout(prefetchCustomLayouts, 2000)
    return () => { if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id); else clearTimeout(id) }
  }, [warming])

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
        {/* Spacer that reserves the model's area at the top of the page —
            the model itself is drawn by the fixed full-page canvas behind. */}
        <div className={styles.mobileCanvasArea} />

        {/* Zone nav — right below canvas, SVG lines overflow upward */}
        <MobileZoneNav activeZone={activeZone} />

      {/* Keep prepared sections mounted; only the active one occupies scroll space. */}
      <AnimatePresence mode="wait">
        {(
          <motion.section
            key="projects"
            style={activeZone === 0 ? undefined : hiddenSection}
            aria-hidden={activeZone !== 0}
            initial={{ opacity: 0 }} animate={{ opacity: activeZone === 0 ? 1 : 0 }}
            transition={{ duration: 0.2 }}
            className={`${styles.mobileSection} ${styles.mobileProjectsSection}`}
          >
            <MemoMobileProjects active={activeZone === 0} />
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
            <PlaygroundGallery mobile active={warming || activeZone === 2} warming={warming} onPrepared={onPrepared} />
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
