'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion'
import type { Zone } from '@/types'
import { playgroundContent, type PlaygroundItem } from '@/content/playgroundContent'
import { projectsContent, type ProjectItem } from '@/content/projectsContent'
import { aboutContent } from '@/content/aboutContent'
import { cameraStore } from '@/lib/cameraStore'
import { posStore } from '@/lib/posStore'
import { silhouetteStore } from '@/lib/silhouetteStore'
import { zoneStore } from '@/lib/zoneStore'
import { zoneTransitionStore } from '@/lib/zoneTransitionStore'
import { cardGlowStore, projectCardCorners } from '@/lib/cardGlowStore'
import { playgroundGlowStore } from '@/lib/playgroundGlowStore'
import { cursorStore, ensureCursorTracking } from '@/lib/cursorStore'
import { debugStore } from '@/lib/debugStore'
import { buildConfigs, resolveAspectRatio, type PlaygroundCardConfig } from '@/lib/playgroundLayout'
import BackInSmoothlyDetail from './BackInSmoothly'
import styles from './ContentPanel.module.css'

// Snappy panel open/close — same feel as the accent color snap
const PANEL_TRANSITION = { duration: 0.22, ease: [0.2, 0, 0, 1] as const }
const PANEL_EXIT       = { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const }

// ─── Hover tilt ───────────────────────────────────────────────────────────────
// Shared by project/playground/about cards: the whole card leans toward the
// live cursor position at all times (not just on hover), matching the deleted
// 3D cards' look-toward-cursor behavior (see project_card_outer_glow.md
// memory). Uncapped: dx/dy are no longer clamped to [-1, 1] before scaling,
// so cards far from the viewport center (where the cursor-to-card-center
// offset already exceeds one screen half at rest) keep tilting further as
// the cursor keeps moving instead of saturating at LOOK_MAX_DEG partway
// through the cursor's travel. Hover itself now only drives each card's own
// separate feedback (the outer glow's color/presence) rather than any lift/
// tilt/shine here — see ProjectCard/PlaygroundCard/AboutPane's own
// glow-publish effects.
const LOOK_MAX_DEG      = 16
const LOOK_SENSITIVITY  = 1.15
// Must match ProjectCard's `transformPerspective: PROJECT_CARD_PERSPECTIVE`
// style — projectCardCorners() replicates that exact CSS transform in JS to
// find the tilted card's true on-screen quad, so the two have to agree.
const PROJECT_CARD_PERSPECTIVE = 900
// Must match PlaygroundCard's `transformPerspective: PLAYGROUND_CARD_PERSPECTIVE` style.
const PLAYGROUND_CARD_PERSPECTIVE = 700
// dt-normalized smoothing factor for the glow's hover color-wipe progress —
// same shape/pace as PostProcessing.tsx's own dither-mode transition lerp.
const HOVER_WIPE_SMOOTH = 0.14

function useCardTilt<T extends HTMLElement = HTMLElement>() {
  const [hovered, setHovered] = useState(false)
  // Mirrors `hovered` for consumers with their own rAF loop (e.g. ProjectCard's
  // glow-color publish) that need the live value without re-running their
  // effect (and restarting their loop) on every hover enter/leave.
  const hoveredRef = useRef(false)
  const rootRef  = useRef<T>(null)
  const rotateX = useMotionValue(0)
  const rotateY = useMotionValue(0)
  const springX = useSpring(rotateX, { stiffness: 260, damping: 22 })
  const springY = useSpring(rotateY, { stiffness: 260, damping: 22 })

  // Ambient look-toward-cursor — runs continuously (hovered or not), reading
  // the shared cursorStore (one global listener for every card) against this
  // card's own live rect each frame.
  useEffect(() => {
    ensureCursorTracking()
    let rafId: number
    const tick = () => {
      if (cursorStore.hasMoved) {
        const el = rootRef.current
        if (el) {
          const r = el.getBoundingClientRect()
          const cx = r.left + r.width  / 2
          const cy = r.top  + r.height / 2
          const dx = (cursorStore.x - cx) / (window.innerWidth  / 2)
          const dy = (cursorStore.y - cy) / (window.innerHeight / 2)
          rotateY.set(dx * LOOK_SENSITIVITY * LOOK_MAX_DEG)
          rotateX.set(-dy * LOOK_SENSITIVITY * LOOK_MAX_DEG)
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [rotateX, rotateY])

  const onTiltEnter = useCallback(() => { hoveredRef.current = true; setHovered(true) }, [])
  const onTiltLeave = useCallback(() => {
    hoveredRef.current = false
    setHovered(false)
  }, [])

  return { hovered, hoveredRef, springX, springY, onTiltEnter, onTiltLeave, rootRef }
}

// ─── Single card ─────────────────────────────────────────────────────────────

type CardRect = { top: number; left: number; width: number; height: number }

interface CardProps {
  index:       number  // slot in cardGlowStore.entries (0-5) — matches projectsContent order
  direction:   'left' | 'right'
  arcInset?:   boolean // top/bottom card in its column — pulled inward for the circular composition
  onExpand:    (rect: CardRect) => void
  thumb?:      string
  accentColor?: string // published to cardGlowStore for PostProcessing's outer-glow pass
  isOpen:      boolean // portal is fully open — card hides so they don't overlap
  thumbScale?: number  // CSS scale applied to the thumbnail image
}

function ProjectCard({ index, direction, arcInset, onExpand, thumb, accentColor, isOpen, thumbScale = 1 }: CardProps) {
  const thumbRef     = useRef<HTMLDivElement>(null)
  const dragBlockRef = useRef(false)
  const { hoveredRef, springX, springY, onTiltEnter, onTiltLeave, rootRef } = useCardTilt<HTMLDivElement>()

  // Publish this card's live tilted QUAD (its 4 corners after rotateX/rotateY/
  // perspective — not the axis-aligned bounding box, which is visibly larger
  // than the actual tilted card) + colors every frame, so PostProcessing.tsx's
  // outer-glow pass — running inside the R3F Canvas, behind this DOM layer —
  // can hug the real shape. rootRef gives the UNROTATED anchor rect (rotation
  // lives on a deeper child, projectCardInner, so rootRef's own rect — which
  // does include drag's translate — is exactly the pre-rotation box); reading
  // springX/springY's live values (rather than the DOM) sidesteps having to
  // reverse-engineer the applied CSS matrix. On hover the glow wipes from
  // `color` (the project's own brand color) to `hoverColor` (the sitewide
  // "focused" accent color, matching the same convention used elsewhere — the
  // model's hand/foot/head, ZoneNav — for "this one is selected") — the wipe
  // itself (radiating outward from the card's own center through the glow
  // ring) is computed in the shader from `hoverProgress`, smoothed here so it
  // animates rather than cutting instantly. Cleared on unmount so a stale
  // glow doesn't linger after this pane hides.
  useEffect(() => {
    let rafId: number
    let lastTime = performance.now()
    const hoverProgress = { current: 0 }
    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now
      const f = 1 - Math.pow(1 - HOVER_WIPE_SMOOTH, dt * 60)
      hoverProgress.current += ((hoveredRef.current ? 1 : 0) - hoverProgress.current) * f

      const anchorEl = rootRef.current
      const w = thumbRef.current?.offsetWidth  ?? 0
      const h = thumbRef.current?.offsetHeight ?? 0
      // isOpen: the detail portal has taken over and this card is hidden
      // (opacity 0) at the same rect — publishing would glow an invisible card.
      if (anchorEl && accentColor && w && h && !isOpen) {
        const r  = anchorEl.getBoundingClientRect()
        const cx = r.left + r.width  / 2
        const cy = r.top  + r.height / 2
        const corners = projectCardCorners(springX.get(), springY.get(), w, h, PROJECT_CARD_PERSPECTIVE, cx, cy)
        cardGlowStore.entries[index] = {
          corners,
          color:      accentColor,
          hoverColor: debugStore.accentFocusColor,
          hoverProgress: hoverProgress.current,
        }
      } else {
        cardGlowStore.entries[index] = null
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      cardGlowStore.entries[index] = null
    }
  }, [index, accentColor, isOpen, rootRef, springX, springY, hoveredRef])

  // Arc composition — top/bottom cards in each column pull horizontally toward
  // the model at screen-center (mirrors the deleted 3D cards' COL_X/ARC_RADIUS_Y
  // arc, see project_card_outer_glow.md memory). Static, so it lives on the
  // outer <li> (plain, not a motion element) rather than fighting the inner
  // motion.div's own drag-driven x/y transform.
  const edgeClass = arcInset
    ? (direction === 'left' ? styles.projectCardEdgeLeft : styles.projectCardEdgeRight)
    : ''

  return (
    <li className={`${styles.projectCard} ${edgeClass}`}>
      <motion.div
        ref={rootRef}
        drag
        dragElastic={0}
        dragMomentum={false}
        whileDrag={{ scale: 1.05, zIndex: 20 }}
        onDragStart={() => { dragBlockRef.current = true }}
        onDragEnd={() => { setTimeout(() => { dragBlockRef.current = false }, 0) }}
        onPointerEnter={onTiltEnter}
        onPointerLeave={onTiltLeave}
        onTap={() => {
          if (dragBlockRef.current) return
          // Measure the thumb's live rect so the portal opens from exactly
          // where the card is on screen.
          const r = thumbRef.current?.getBoundingClientRect()
          if (r) onExpand({ top: r.top, left: r.left, width: r.width, height: r.height })
        }}
        style={{ cursor: 'grab', touchAction: 'none' }}
      >
        {/* Hidden only while the portal is fully open (isOpen). During the closing
            animation the card is already visible underneath — the portal sits on top
            via z-index and animates back to the card position, so when it unmounts
            the card is already there with no gap or blink. */}
        <motion.div
          style={{ width: '100%' }}
          initial={false}
          animate={{ opacity: isOpen ? 0 : 1 }}
          transition={{ opacity: { duration: isOpen ? 0.05 : 0 } }}
        >
          <motion.div
            className={styles.projectCardInner}
            style={{ rotateX: springX, rotateY: springY, transformPerspective: PROJECT_CARD_PERSPECTIVE, pointerEvents: 'none' }}
          >
            <div className={styles.projectCardRow}>
              <div ref={thumbRef} className={styles.projectThumb}>
                {thumb && <Image src={thumb} alt="" fill priority quality={90} style={{ objectFit: 'cover', transform: thumbScale !== 1 ? `scale(${thumbScale})` : undefined }} sizes="30vw" />}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </li>
  )
}

// ─── 3D wheel carousel slide ─────────────────────────────────────────────────
// Each slide is absolutely positioned. `vi` is a virtual integer index that can
// grow in either direction forever — modular arithmetic maps it to a real slot.

interface CarouselSlideProps {
  trackX:      MotionValue<number>
  vi:          number   // virtual index — any integer
  PITCH:       number
  trackOffset: number
  slideWidth:  number
  slideHeight: number
  slot:        MediaSlot
  item:        ProjectItem
  activeVi:    number
  onGoTo:      (vi: number) => void
}

function CarouselSlide({ trackX, vi, PITCH, trackOffset, slideWidth, slideHeight, slot, item, activeVi, onGoTo }: CarouselSlideProps) {
  const x = useTransform(trackX, (t: number) => t + vi * PITCH)

  const rotateY = useTransform(trackX, (t: number) => {
    const n = (t + vi * PITCH - trackOffset) / PITCH
    return n * 25
  })

  // perspective: 2400px on the container keeps the scale-projected near corner
  // above y=0 at all n values, so clip-path: inset(0) never cuts the top/bottom.
  const scale = useTransform(trackX, (t: number) => {
    const n = Math.abs((t + vi * PITCH - trackOffset) / PITCH)
    return Math.max(0.75, 1 - n * 0.15)
  })

  const opacity = useTransform(trackX, (t: number) => {
    const n = Math.abs((t + vi * PITCH - trackOffset) / PITCH)
    return Math.max(0.35, 1 - n * 0.35)
  })

  const isActive = vi === activeVi

  return (
    <motion.div
      className={styles.carouselSlide}
      style={{
        position: 'absolute', top: 0, left: 0,
        width: slideWidth, height: slideHeight,
        // Active slide sits above side slides in 2D stacking order
        zIndex: isActive ? 1 : 0,
        x, rotateY, scale, opacity,
      }}
      onClick={() => { if (!isActive) onGoTo(vi) }}
    >
      <div className={styles.carouselMedia}>
        <MediaContent slot={slot} item={item} />
      </div>
      {!isActive && <div className={styles.carouselOverlay} />}
    </motion.div>
  )
}

// ─── Project detail overlay ───────────────────────────────────────────────────

type MediaSlot = 'video' | 'img0' | 'img1'
const ALL_SLOTS:  MediaSlot[] = ['video', 'img0', 'img1']
const SLOT_COUNT = ALL_SLOTS.length  // 3

function MediaContent({ slot, item }: { slot: MediaSlot; item: ProjectItem }) {
  if (slot === 'video') {
    return item.youtubeId ? (
      <iframe
        src={`https://www.youtube.com/embed/${item.youtubeId}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={item.title}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    ) : <div className={styles.detailVideoPlaceholder} />
  }
  const src = item.images[slot === 'img0' ? 0 : 1]
  return src
    ? <Image src={src} alt="" fill quality={90} style={{ objectFit: 'cover' }} sizes="65vw" />
    : <div style={{ width: '100%', height: '100%', background: 'var(--placeholder-color)' }} />
}

function ProjectDetail({
  item, index, cardRect, onClose, onNavigate,
}: {
  item:       ProjectItem
  index:      number
  cardRect:   CardRect
  onClose:    () => void
  onNavigate: (newIndex: number) => void
}) {
  const isCustomLayout = item.customLayout === 'backInSmoothly'

  const defaultVIdx = item.defaultFeatured ? ALL_SLOTS.indexOf(item.defaultFeatured) : 0

  const [vIdx, setVIdx]    = useState(defaultVIdx)
  const vIdxRef            = useRef(defaultVIdx)
  const carouselRef        = useRef<HTMLDivElement>(null)
  const animControlRef     = useRef<ReturnType<typeof animate> | null>(null)

  // Full-page — no inset border/margin
  const final = useRef({
    top: 0, left: 0,
    width:  window.innerWidth,
    height: window.innerHeight,
  }).current

  const SLIDE_GAP   = 20
  const slideWidth  = final.width * 0.56
  const slideHeight = slideWidth * 9 / 16
  const trackOffset = (final.width - slideWidth) / 2
  const PITCH       = slideWidth + SLIDE_GAP

  // trackX = trackOffset - vi * PITCH  when virtual index vi is centered
  const getTrackX = useCallback(
    (vi: number) => -vi * PITCH + trackOffset,
    [PITCH, trackOffset]
  )

  const trackX = useMotionValue(getTrackX(defaultVIdx))

  const goTo = useCallback((target: number) => {
    setVIdx(target)
    vIdxRef.current = target
    if (animControlRef.current) animControlRef.current.stop()
    animControlRef.current = animate(trackX, getTrackX(target), {
      type: 'spring', stiffness: 350, damping: 35, mass: 0.8,
    })
    // After settling, normalize so vIdx stays in [0, SLOT_COUNT-1] and trackX stays bounded.
    // The trackX adjustment is imperceptible because content is identical every SLOT_COUNT steps.
    animControlRef.current.then(() => {
      if (vIdxRef.current !== target) return
      const normalized = ((target % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT
      if (normalized !== target) {
        const cycles = (target - normalized) / SLOT_COUNT
        trackX.set(trackX.get() + cycles * SLOT_COUNT * PITCH)
        setVIdx(normalized)
        vIdxRef.current = normalized
      }
    })
  }, [trackX, getTrackX, PITCH])

  // Reset carousel when the active project changes (project-to-project nav)
  useEffect(() => {
    const newV = item.defaultFeatured ? ALL_SLOTS.indexOf(item.defaultFeatured) : 0
    if (animControlRef.current) animControlRef.current.stop()
    setVIdx(newV)
    vIdxRef.current = newV
    trackX.set(getTrackX(newV))
  }, [item, trackX, getTrackX])

  // Listen on window so scroll works from anywhere in the panel (title, desc, sides),
  // not just when the cursor is directly over the carousel track.
  useEffect(() => {
    if (isCustomLayout) return  // custom layout scrolls the page normally instead
    let lastTime = 0
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const now = Date.now()
      if (now - lastTime < 250) return
      lastTime = now
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      goTo(vIdxRef.current + (delta > 0 ? 1 : -1))
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [goTo, isCustomLayout])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (isCustomLayout) return  // no carousel to step through on this layout
      if (e.key === 'ArrowLeft')  goTo(vIdxRef.current - 1)
      if (e.key === 'ArrowRight') goTo(vIdxRef.current + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, goTo, isCustomLayout])

  // Pointer-based drag — updates trackX directly, no Framer Motion drag needed.
  const pointerStartX  = useRef(0)
  const trackXAtStart  = useRef(0)
  const dragging       = useRef(false)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (animControlRef.current) animControlRef.current.stop()
    dragging.current     = true
    pointerStartX.current  = e.clientX
    trackXAtStart.current  = trackX.get()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [trackX])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const raw  = e.clientX - pointerStartX.current
    // Elastic resistance beyond one slide so the drag doesn't fly off
    const abs  = Math.abs(raw)
    const sign = raw >= 0 ? 1 : -1
    const clamped = abs <= PITCH ? raw : sign * (PITCH + (abs - PITCH) * 0.2)
    trackX.set(trackXAtStart.current + clamped)
  }, [trackX, PITCH])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    if (Math.abs(e.clientX - pointerStartX.current) < 6) {
      // Tap: setPointerCapture swallows the click event, so navigate here instead.
      // Use the tap X position relative to the carousel to decide which slide was hit.
      const rect = carouselRef.current?.getBoundingClientRect()
      if (!rect) return
      const relX = e.clientX - rect.left
      if (relX < trackOffset)               goTo(vIdxRef.current - 1)
      else if (relX > trackOffset + slideWidth) goTo(vIdxRef.current + 1)
      return
    }
    const pos   = (trackOffset - trackX.get()) / PITCH
    const delta = Math.round(pos - vIdxRef.current)
    goTo(vIdxRef.current + Math.max(-1, Math.min(1, delta)))
  }, [trackX, trackOffset, slideWidth, PITCH, goTo])

  const prevIndex   = ((index - 1) + projectsContent.length) % projectsContent.length
  const nextIndex   = (index + 1) % projectsContent.length
  const prevProject = projectsContent[prevIndex]
  const nextProject = projectsContent[nextIndex]

  return createPortal(
    <>
      <motion.div
        style={{ position: 'fixed', inset: 0, zIndex: 50 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      <motion.div
        className={styles.detailPanel}
        initial={{ ...cardRect, borderRadius: 0 }}
        animate={{ ...final, borderRadius: 0, transition: PANEL_TRANSITION }}
        exit={{
          ...cardRect,
          borderRadius: 0,
          opacity: [1, 1, 0],
          transition: { ...PANEL_EXIT, opacity: { duration: PANEL_EXIT.duration, times: [0, 0.8, 1] } },
        }}
        style={isCustomLayout ? { backgroundColor: item.accentColor } : undefined}
        role="dialog"
        aria-modal="true"
      >
        {/* Thumbnail flash — on open, the custom layout's accent color already matches
            the destination page background, so it stays hidden and the growing rect
            fills with that flat color instead of the thumbnail image (the transition
            reads as the color taking over rather than an image zooming in and fading).
            On close it fades back in for every layout so the shrinking rect shows the
            real thumbnail image matching the card underneath, then dissolves away again
            just before the panel unmounts — in 3D card mode the mesh underneath never
            fades and its rect is only an approximation, so a shape/position mismatch is
            unavoidable; fading out first (rather than cutting straight from opaque to
            gone) keeps that handoff smooth regardless of how closely it lines up. */}
        <motion.div
          initial={{ opacity: isCustomLayout ? 0 : 1 }}
          animate={{ opacity: 0, transition: isCustomLayout ? { duration: 0 } : { delay: 0.08, duration: 0.12 } }}
          exit={{ opacity: [null, 1, 1, 0], transition: { duration: PANEL_EXIT.duration, times: [0, 0.4, 0.72, 1] } }}
          style={{ position: 'absolute', inset: 0, background: 'var(--placeholder-color)', zIndex: 1, pointerEvents: 'none', overflow: 'hidden' }}
        >
          {item.thumb && (
            <Image src={item.thumb} alt="" fill quality={90} style={{ objectFit: 'cover', transform: item.thumbScale && item.thumbScale !== 1 ? `scale(${item.thumbScale})` : undefined }} sizes="100vw" />
          )}
        </motion.div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.16, duration: 0.10 } }}
          exit={{ opacity: 0, transition: { duration: 0.04 } }}
          style={{ position: 'absolute', top: 0, left: 0, width: final.width, height: final.height, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 2 }}
        >
          {/* backInSmoothly has its own [X] inside the top/bottom in-page nav
              rows (BackInSmoothly.tsx's ProjectNav) instead of this fixed
              corner control, so it scrolls away with that menu rather than
              hovering over the page the whole time. */}
          {!isCustomLayout && (
            <button className={styles.detailClose} onClick={onClose} aria-label="Close">×</button>
          )}

          <button
            className={`${styles.detailHomeLink} ${isCustomLayout ? styles.detailHomeLinkCustom : ''}`}
            onClick={() => { onClose(); setTimeout(() => zoneStore.resetToLanding?.(), 300) }}
            aria-label="Return to home"
          >
            THELIFEOF<span className={styles.detailHomePita}>PITA</span>
          </button>

          {isCustomLayout ? (
            // scrollbarGutter reserves equal space on both edges regardless of
            // whether the scrollbar is actually showing, so this scrolling
            // container's own centered content (BackInSmoothly's nav/hero/etc.)
            // stays centered on the true viewport width — otherwise a
            // right-only scrollbar shifts its visual center a few px left of
            // the fixed THELIFEOFPITA logo above (which isn't inside this
            // scroll container), reading as "off-center."
            <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', paddingTop: '2.4rem', scrollbarGutter: 'stable both-edges' }}>
              <BackInSmoothlyDetail onPrev={() => onNavigate(prevIndex)} onNext={() => onNavigate(nextIndex)} onClose={onClose} />
            </div>
          ) : (
            <>
              {/* Header — prev/next project flanking centered title */}
              <div className={styles.detailHeader}>
                <button className={`${styles.detailNavItem} ${styles.detailNavLeft}`} onClick={() => onNavigate(prevIndex)}>
                  <span className={styles.detailNavArrow}>←</span>
                  <span className={styles.detailNavTitle}>{prevProject.title}</span>
                </button>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={item.title}
                    className={styles.detailHeaderCenter}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                  >
                    <h2 className={styles.detailTitle}>{item.title}</h2>
                    <p className={styles.detailDesc}>{item.description}</p>
                  </motion.div>
                </AnimatePresence>

                <button className={`${styles.detailNavItem} ${styles.detailNavRight}`} onClick={() => onNavigate(nextIndex)}>
                  <span className={styles.detailNavArrow}>→</span>
                  <span className={styles.detailNavTitle}>{nextProject.title}</span>
                </button>
              </div>

              {/* Infinite 3D wheel carousel */}
              <div
                ref={carouselRef}
                className={styles.carousel}
                style={{
                  position: 'relative',
                  height: slideHeight,
                  perspective: '2400px',
                  clipPath: 'inset(0)',
                  touchAction: 'none',
                  userSelect: 'none',
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {/* 7 virtual slides: 3 before active, active, 3 after */}
                {[-3, -2, -1, 0, 1, 2, 3].map(offset => {
                  const vi       = vIdx + offset
                  const realSlot = ((vi % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT
                  return (
                    <CarouselSlide
                      key={vi}
                      trackX={trackX}
                      vi={vi}
                      PITCH={PITCH}
                      trackOffset={trackOffset}
                      slideWidth={slideWidth}
                      slideHeight={slideHeight}
                      slot={ALL_SLOTS[realSlot]}
                      item={item}
                      activeVi={vIdx}
                      onGoTo={goTo}
                    />
                  )
                })}
              </div>
            </>
          )}

        </motion.div>
      </motion.div>
    </>,
    document.body
  )
}

// ─── Projects pane ───────────────────────────────────────────────────────────


function ProjectsPane() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [expandedRect, setExpandedRect]   = useState<CardRect | null>(null)
  const leftListRef  = useRef<HTMLUListElement>(null)
  const rightListRef = useRef<HTMLUListElement>(null)

  // Drive column positions via rAF — same pattern as the overlay transform/opacity.
  // Writing style.left directly avoids React re-renders and the single-frame jump
  // they cause. The loop tracks the silhouette every frame so positions smoothly
  // follow the model as the camera zooms out; no fixed timeout needed.
  useEffect(() => {
    let rafId: number
    const tick = () => {
      const { pts, count, cx } = silhouetteStore
      const vw = window.innerWidth
      const fallback = vw / 2
      let minX = cx || fallback
      let maxX = cx || fallback
      for (let k = 0; k < count; k++) {
        const x = pts[k * 2]
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
      if (leftListRef.current)  leftListRef.current.style.left  = `${minX / 2}px`
      if (rightListRef.current) rightListRef.current.style.left = `${(maxX + vw) / 2}px`
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const handleExpand = useCallback((index: number, rect: CardRect) => {
    setExpandedRect(rect)
    setExpandedIndex(index)
  }, [])

  const handleClose    = useCallback(() => setExpandedIndex(null), [])
  const handleNavigate = useCallback((newIndex: number) => setExpandedIndex(newIndex), [])

  return (
    <>
      <div className={styles.projectsPane}>
        <ul ref={leftListRef} className={styles.projectsList}>
          {[0, 1, 2].map((i, pos) => (
            <ProjectCard key={i} index={i} direction="left" arcInset={pos !== 1} onExpand={(r) => handleExpand(i, r)} thumb={projectsContent[i].thumb} accentColor={projectsContent[i].accentColor} isOpen={expandedIndex === i} thumbScale={projectsContent[i].thumbScale} />
          ))}
        </ul>
        <ul ref={rightListRef} className={styles.projectsList}>
          {[3, 4, 5].map((i, pos) => (
            <ProjectCard key={i} index={i} direction="right" arcInset={pos !== 1} onExpand={(r) => handleExpand(i, r)} thumb={projectsContent[i].thumb} accentColor={projectsContent[i].accentColor} isOpen={expandedIndex === i} thumbScale={projectsContent[i].thumbScale} />
          ))}
        </ul>
      </div>

      {/* Detail overlay — portal so it escapes the overlay stacking context. */}
      <AnimatePresence>
        {expandedIndex !== null && expandedRect !== null && (
          <ProjectDetail
            key="detail"
            item={projectsContent[expandedIndex]}
            index={expandedIndex}
            cardRect={expandedRect}
            onClose={handleClose}
            onNavigate={handleNavigate}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── About pane ──────────────────────────────────────────────────────────────

function AboutPane() {
  const [photoIndex, setPhotoIndex] = useState(0)
  const [prevIndex,  setPrevIndex]  = useState<number | null>(null)
  const [photoHovered, setPhotoHovered] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const photoThumbRef = useRef<HTMLDivElement>(null)
  const { hoveredRef, springX, springY, onTiltEnter, onTiltLeave, rootRef } = useCardTilt<HTMLDivElement>()

  // Preload all photos immediately so subsequent frames are already in cache
  useEffect(() => {
    aboutContent.photos.forEach(src => { new window.Image().src = src })
  }, [])

  // Same auto-rotate-pauses-on-hover behavior as before — untouched by the
  // lift/shine/glow treatment below, which only changes hover FEEDBACK, not
  // this existing "stop rotating while the user's looking at it" behavior.
  useEffect(() => {
    if (photoHovered || aboutContent.photos.length <= 1) return
    intervalRef.current = setInterval(() => {
      setPhotoIndex(i => {
        setPrevIndex(i)
        return (i + 1) % aboutContent.photos.length
      })
    }, 250)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [photoHovered])

  const photo     = aboutContent.photos[photoIndex]
  const prevPhoto = prevIndex !== null ? aboutContent.photos[prevIndex] : null

  const handleEnter = useCallback(() => { onTiltEnter(); setPhotoHovered(true)  }, [onTiltEnter])
  const handleLeave = useCallback(() => { onTiltLeave(); setPhotoHovered(false) }, [onTiltLeave])

  // Hover-only glow — same treatment as PlaygroundCard (see its own comment
  // for the reasoning), sharing playgroundGlowStore's pool since About and
  // Playground are different zones that are never displayed simultaneously
  // (see ContentPanel's zoneTransitionStore/`inert` gating), so there's no
  // slot-collision risk. Reuses PROJECT_CARD_PERSPECTIVE since this photo's
  // own transformPerspective (below) happens to be the same 900 value.
  const glowSlotRef = useRef<number | null>(null)
  useEffect(() => {
    let rafId: number
    let lastTime = performance.now()
    const hoverProgress = { current: 0 }
    const releaseSlot = () => {
      if (glowSlotRef.current !== null) {
        playgroundGlowStore.entries[glowSlotRef.current] = null
        glowSlotRef.current = null
      }
    }
    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now
      const f = 1 - Math.pow(1 - HOVER_WIPE_SMOOTH, dt * 60)
      hoverProgress.current += ((hoveredRef.current ? 1 : 0) - hoverProgress.current) * f

      const el = photoThumbRef.current
      const w  = el?.offsetWidth  ?? 0
      const h  = el?.offsetHeight ?? 0
      if (el && w && h && hoverProgress.current > 0.001) {
        if (glowSlotRef.current === null) {
          glowSlotRef.current = playgroundGlowStore.entries.findIndex(e => e === null)
        }
        if (glowSlotRef.current !== -1 && glowSlotRef.current !== null) {
          const r  = el.getBoundingClientRect()
          const cx = r.left + r.width  / 2
          const cy = r.top  + r.height / 2
          const corners = projectCardCorners(springX.get(), springY.get(), w, h, PROJECT_CARD_PERSPECTIVE, cx, cy)
          playgroundGlowStore.entries[glowSlotRef.current] = { corners, opacity: hoverProgress.current }
        }
      } else {
        releaseSlot()
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      releaseSlot()
    }
  }, [springX, springY, hoveredRef])

  return (
    <div className={styles.aboutPane}>

      {/* ── Left: photo · bio · contact ── */}
      <div className={styles.aboutPanelLeft}>

        <div className={styles.aboutPanelInner}>
          <motion.div
            ref={rootRef}
            className={styles.aboutPhoto}
            aria-hidden="true"
            drag
            dragElastic={0}
            dragMomentum={false}
            whileDrag={{ scale: 1.05, zIndex: 20 }}
            style={{ cursor: 'grab' }}
            onPointerEnter={handleEnter}
            onPointerLeave={handleLeave}
          >
            <motion.div
              style={{ rotateX: springX, rotateY: springY, transformPerspective: PROJECT_CARD_PERSPECTIVE, pointerEvents: 'none' }}
            >
              <div ref={photoThumbRef} className={styles.aboutPhotoThumb}>
                {/* Outgoing photo — stays fully opaque underneath as the base layer */}
                {prevPhoto && (
                  <img
                    src={prevPhoto}
                    alt=""
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )}
                {/* Incoming photo — fades in on top */}
                {photo && (
                  <img
                    key={photoIndex}
                    src={photo}
                    alt=""
                    className={styles.aboutPhotoImg}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
          <p className={styles.bio}>{aboutContent.bio}</p>
        </div>
      </div>

      {/* ── Right: CV ── */}
      <div className={styles.aboutPanelRight}>
        <div className={styles.aboutPanelInner}>

          {aboutContent.cv.experience.length > 0 && (
            <div className={styles.cvSection}>
              <h3 className={styles.cvHeading}>Experience</h3>
              {aboutContent.cv.experience.map((item, i) => (
                <div key={i} className={styles.cvItem}>
                  <span className={styles.cvTitle}>{item.title}</span>
                  <span className={styles.cvMeta}>{item.meta}</span>
                </div>
              ))}
            </div>
          )}

          {aboutContent.cv.education.length > 0 && (
            <div className={styles.cvSection}>
              <h3 className={styles.cvHeading}>Education</h3>
              {aboutContent.cv.education.map((item, i) => (
                <div key={i} className={styles.cvItem}>
                  <span className={styles.cvTitle}>{item.title}</span>
                  <span className={styles.cvMeta}>{item.meta}</span>
                </div>
              ))}
            </div>
          )}

          {aboutContent.cv.skills.length > 0 && (
            <div className={styles.cvSection}>
              <h3 className={styles.cvHeading}>Skills</h3>
              <div className={styles.cvSkillsGrid}>
                {aboutContent.cv.skills.map((skill, i) => (
                  <p key={i} className={styles.cvTitle}>{skill}</p>
                ))}
              </div>
            </div>
          )}

          {aboutContent.cv.awards.length > 0 && (
            <div className={styles.cvSection}>
              <h3 className={styles.cvHeading}>Awards</h3>
              {aboutContent.cv.awards.map((award, i) => (
                <p key={i} className={styles.cvTitle}>{award}</p>
              ))}
            </div>
          )}

          {aboutContent.cv.languages.length > 0 && (
            <div className={styles.cvSection}>
              <h3 className={styles.cvHeading}>Languages</h3>
              {aboutContent.cv.languages.map((lang, i) => (
                <p key={i} className={styles.cvTitle}>{lang}</p>
              ))}
            </div>
          )}

          <a
            href="/JOSE_PITA_EN.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.cvDownload}
          >▾ Full CV</a>

        </div>
      </div>

    </div>
  )
}

// ─── Playground card ──────────────────────────────────────────────────────────

interface PlaygroundCardProps {
  index:       number
  cfg:         PlaygroundCardConfig
  item:        PlaygroundItem
  isOpen:      boolean      // detail portal is showing this item — hide the card underneath
  onExpand:    (index: number, rect: CardRect) => void
  registerRef: (index: number, el: HTMLDivElement | null) => void
}

function PlaygroundCard({ index, cfg, item, isOpen, onExpand, registerRef }: PlaygroundCardProps) {
  const videoRef     = useRef<HTMLVideoElement>(null)
  const thumbRef      = useRef<HTMLDivElement>(null)
  const dragBlockRef = useRef(false)
  const { hovered, hoveredRef, springX, springY, onTiltEnter, onTiltLeave, rootRef } = useCardTilt<HTMLDivElement>()

  // Register the thumb's element so the detail overlay can measure its live
  // rect for the FLIP-open animation and for the close animation (which needs
  // the rect of whichever item is current after scrolling through the panel).
  useEffect(() => {
    registerRef(index, thumbRef.current)
    return () => registerRef(index, null)
  }, [index, registerRef])

  const handleEnter = useCallback(() => {
    onTiltEnter()
    videoRef.current?.play().catch(() => {})
  }, [onTiltEnter])

  const handleLeave = useCallback(() => {
    onTiltLeave()
    const v = videoRef.current
    if (v) { v.pause(); v.currentTime = 0 }
  }, [onTiltLeave])

  // Hover-only glow — unlike Projects' always-on glow, Playground items have
  // no per-item brand color, so the glow only fades in (in the sitewide
  // focus accent color) while hovered, using a dynamically-claimed slot from
  // playgroundGlowStore's small pool (see that file for why — far more items
  // than fit a fixed per-item uniform array, but only ever a couple are
  // mid-transition at once). Anchor uses thumbRef's own (post-rotation) rect
  // center rather than an unrotated ancestor — unlike ProjectCard, this
  // card's rotated element also contains the title text below the thumb, so
  // no ancestor box matches the thumb's own pre-rotation position exactly;
  // this is a deliberate small-bias approximation (a few px at this card's
  // clamped tilt range), not the exact approach used for Projects.
  const glowSlotRef = useRef<number | null>(null)
  useEffect(() => {
    let rafId: number
    let lastTime = performance.now()
    const hoverProgress = { current: 0 }
    const releaseSlot = () => {
      if (glowSlotRef.current !== null) {
        playgroundGlowStore.entries[glowSlotRef.current] = null
        glowSlotRef.current = null
      }
    }
    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now
      const f = 1 - Math.pow(1 - HOVER_WIPE_SMOOTH, dt * 60)
      hoverProgress.current += ((hoveredRef.current ? 1 : 0) - hoverProgress.current) * f

      const el = thumbRef.current
      const w  = el?.offsetWidth  ?? 0
      const h  = el?.offsetHeight ?? 0
      if (el && w && h && !isOpen && hoverProgress.current > 0.001) {
        if (glowSlotRef.current === null) {
          glowSlotRef.current = playgroundGlowStore.entries.findIndex(e => e === null)
        }
        if (glowSlotRef.current !== -1 && glowSlotRef.current !== null) {
          const r  = el.getBoundingClientRect()
          const cx = r.left + r.width  / 2
          const cy = r.top  + r.height / 2
          const corners = projectCardCorners(springX.get(), springY.get(), w, h, PLAYGROUND_CARD_PERSPECTIVE, cx, cy)
          playgroundGlowStore.entries[glowSlotRef.current] = { corners, opacity: hoverProgress.current }
        }
      } else {
        releaseSlot()
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      releaseSlot()
    }
  }, [isOpen, springX, springY, hoveredRef])

  return (
    <div style={{ position: 'absolute', left: `${cfg.x}%`, top: `${cfg.y}%`, pointerEvents: 'none', zIndex: hovered ? 100 : 'auto' }}>
      <div className={styles.playgroundCardAnchor}>
        <motion.div
          ref={rootRef}
          className={styles.playgroundCard}
          style={{ width: cfg.thumbW, cursor: 'grab' }}
          drag
          dragElastic={0}
          dragMomentum={false}
          whileDrag={{ scale: 1.05, zIndex: 20 }}
          onDragStart={() => { dragBlockRef.current = true }}
          onDragEnd={() => { setTimeout(() => { dragBlockRef.current = false }, 0) }}
          onPointerEnter={handleEnter}
          onPointerLeave={handleLeave}
          onTap={() => {
            if (dragBlockRef.current) return
            const r = thumbRef.current?.getBoundingClientRect()
            if (r) onExpand(index, { top: r.top, left: r.left, width: r.width, height: r.height })
          }}
        >
          {/* Hidden only while the detail portal is showing this exact item — see
              ProjectCard for why this doesn't cause a gap/blink on close. */}
          <motion.div
            style={{ width: '100%' }}
            initial={false}
            animate={{ opacity: isOpen ? 0 : 1 }}
            transition={{ opacity: { duration: isOpen ? 0.05 : 0 } }}
          >
            <motion.div
              className={styles.playgroundCardInner}
              style={{ rotateX: springX, rotateY: springY, transformPerspective: PLAYGROUND_CARD_PERSPECTIVE, pointerEvents: 'none' }}
            >
              <div
                ref={thumbRef}
                className={styles.playgroundThumb}
                style={{ aspectRatio: String(cfg.aspectRatio) }}
              >
                {(item.mp4 || item.webm) && (
                  <video ref={videoRef} className={styles.playgroundVideo} muted loop playsInline preload="metadata">
                    {item.webm && <source src={item.webm} type="video/webm" />}
                    {item.mp4  && <source src={item.mp4}  type="video/mp4"  />}
                  </video>
                )}
                {item.poster && (
                  <img
                    src={item.poster} alt=""
                    className={styles.playgroundPoster}
                    style={{ opacity: (hovered && (item.mp4 || item.webm)) ? 0 : 1 }}
                  />
                )}
              </div>
              <p className={styles.playgroundCardTitle}>{item.title}</p>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

// ─── Playground detail overlay ────────────────────────────────────────────────
// Fullscreen (minus a generous margin) view of one item. The white backdrop
// fades in on its own. The media itself FLIPs from the clicked card's rect to
// the near-fullscreen bounds, mirroring ProjectDetail. Scrolling or the arrow
// keys move through items — the outgoing item's media shrinks back to its own
// grid position while the incoming one grows from its own grid position, in
// either direction.

function PlaygroundMedia({ item }: { item: PlaygroundItem }) {
  if (item.mp4 || item.webm) {
    return (
      <video
        autoPlay loop muted playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      >
        {item.webm && <source src={item.webm} type="video/webm" />}
        {item.mp4  && <source src={item.mp4}  type="video/mp4"  />}
      </video>
    )
  }
  return item.poster
    ? <img src={item.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
    : <div style={{ width: '100%', height: '100%', background: 'var(--placeholder-color)' }} />
}

function PlaygroundDetail({
  index, initialRect, getCardRect, configs, onNavigate, onClose,
}: {
  index:       number | null
  initialRect: CardRect | null
  getCardRect: (i: number) => CardRect | null
  configs:     PlaygroundCardConfig[]
  onNavigate:  (i: number) => void
  onClose:     () => void
}) {
  const indexRef = useRef(index)
  useEffect(() => { indexRef.current = index }, [index])

  const n = playgroundContent.length

  // Almost-fullscreen bounds — generous margin, computed once on first open
  // and kept for the life of the component (it's always mounted; only its
  // internal AnimatePresence shows/hides content — see below for why).
  const finalRef = useRef<{ top: number; left: number; width: number; height: number } | null>(null)
  if (index !== null && !finalRef.current) {
    finalRef.current = {
      top:    Math.min(window.innerHeight * 0.09, 110),
      left:   Math.min(window.innerWidth  * 0.07, 110),
      width:  window.innerWidth  - 2 * Math.min(window.innerWidth  * 0.07, 110),
      height: window.innerHeight - 2 * Math.min(window.innerHeight * 0.09, 110),
    }
  }
  const final = finalRef.current

  const goTo = useCallback((dir: 1 | -1) => {
    if (indexRef.current === null) return
    onNavigate(((indexRef.current + dir) % n + n) % n)
  }, [n, onNavigate])

  // Wheel moves through items — either direction. Throttled so one wheel
  // "tick" (trackpad or mouse) advances exactly one item.
  useEffect(() => {
    if (index === null) return
    let lastTime = 0
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const now = Date.now()
      if (now - lastTime < 300) return
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (Math.abs(delta) < 4) return
      lastTime = now
      goTo(delta > 0 ? 1 : -1)
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [index, goTo])

  useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')                              onClose()
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  goTo(1)
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    goTo(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, onClose, goTo])

  if (!final) return null  // never opened yet — nothing to portal

  // Sized to the item's real aspect ratio and centered in `final` — the hit
  // area matches the visible image exactly, so a click just outside the
  // picture (not out at the true screen edge) already counts as "outside".
  const bigRect = (i: number): CardRect => {
    const ar = configs[i]?.aspectRatio ?? 1
    let width = final.width, height = width / ar
    if (height > final.height) { height = final.height; width = height * ar }
    return {
      width, height,
      left: final.left + (final.width  - width)  / 2,
      top:  final.top  + (final.height - height) / 2,
    }
  }

  const titleStyle: React.CSSProperties = {
    position: 'fixed',
    top:  final.top + final.height + 24,
    left: final.left + final.width / 2,
    transform: 'translateX(-50%)',
  }

  // Everything below lives in ONE AnimatePresence (not nested ones per element),
  // so closing — which removes all of it in a single React commit — actually
  // waits for each child's own exit animation instead of cutting instantly.
  // Backdrop and close button use a stable key so item-to-item navigation
  // doesn't remount them; only the media/title (keyed by index) enter/exit,
  // simultaneously (no `mode="wait"`) so the outgoing item shrinks+fades out
  // while the incoming one grows+fades in at the same time.
  return createPortal(
    <AnimatePresence>
      {index !== null && [
        <motion.div
          key="pg-backdrop"
          className={styles.playgroundBackdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />,

        <motion.div
          key={`pg-media-${index}`}
          className={styles.playgroundDetailMedia}
          initial={{ ...(getCardRect(index) ?? initialRect ?? bigRect(index)), opacity: 0, borderRadius: 0 }}
          animate={{ ...bigRect(index), opacity: 1, borderRadius: 0, transition: PANEL_TRANSITION }}
          exit={{ ...(getCardRect(index) ?? initialRect ?? bigRect(index)), opacity: 0, borderRadius: 0, transition: PANEL_EXIT }}
        >
          <PlaygroundMedia item={playgroundContent[index]} />
        </motion.div>,

        <button
          key="pg-close"
          className={styles.playgroundDetailClose}
          onClick={onClose}
          aria-label="Close"
        >[X]</button>,

        <motion.p
          key={`pg-title-${index}`}
          className={styles.playgroundDetailTitle}
          style={titleStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.18 } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          {playgroundContent[index].title}
        </motion.p>,
      ]}
    </AnimatePresence>,
    document.body
  )
}

// ─── Playground pane ──────────────────────────────────────────────────────────

function PlaygroundPane({ configs }: { configs: PlaygroundCardConfig[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [expandedRect,  setExpandedRect]  = useState<CardRect | null>(null)
  const cardElRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const registerRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) cardElRefs.current.set(index, el)
    else cardElRefs.current.delete(index)
  }, [])

  const getCardRect = useCallback((index: number): CardRect | null => {
    const el = cardElRefs.current.get(index)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top, left: r.left, width: r.width, height: r.height }
  }, [])

  const handleExpand = useCallback((index: number, rect: CardRect) => {
    setExpandedRect(rect)
    setExpandedIndex(index)
  }, [])

  const handleClose = useCallback(() => setExpandedIndex(null), [])

  return (
    <>
      <div className={styles.playgroundPane}>
        {configs.map((cfg, i) =>
          cfg ? (
            <PlaygroundCard
              key={i}
              index={i}
              cfg={cfg}
              item={playgroundContent[i]}
              isOpen={expandedIndex === i}
              onExpand={handleExpand}
              registerRef={registerRef}
            />
          ) : null
        )}
      </div>

      {/* Always mounted — it manages its own show/hide internally via a single
          AnimatePresence, so its exit animations actually play on close
          instead of being cut short by an outer AnimatePresence unmounting it. */}
      <PlaygroundDetail
        index={expandedIndex}
        initialRect={expandedRect}
        getCardRect={getCardRect}
        configs={configs}
        onNavigate={setExpandedIndex}
        onClose={handleClose}
      />
    </>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface ContentPanelProps {
  activeZone: Zone | null
  isContentMode: boolean
}

function easeOutCubic(t: number): number { const inv = 1 - t; return 1 - inv * inv * inv }
function easeInCubic(t: number): number { return t * t * t }
// Drives every section's zone-to-zone crossfade (opacity + a directional drift).
const ZONE_FADE_DURATION = 0.2
// Multiplier on the raw screen-px offset of a zone's own accent body part
// (posStore — hand/foot/head) from viewport center, so a pane visibly
// originates from that body part's position and settles into place, instead
// of growing from the center. Raw posStore offsets only run ±40-80px in
// practice, so this needs real amplification to read clearly against crisp
// DOM content.
const ZONE_PARALLAX = 2.2

export default function ContentPanel({ activeZone, isContentMode }: ContentPanelProps) {
  const overlayRef        = useRef<HTMLDivElement>(null)
  // One layer per zone, always mounted while isVisible — a hard swap between
  // panes read as a cut, so instead all three stay in the DOM and cross-fade
  // (+ scale pop) in place. Only ONE zone is ever actually fading/shown at a
  // time (displayedZoneRef) — switching zones fully fades the old one OUT
  // first, then fades the new one IN, rather than blending both together.
  // An earlier version blended the outgoing and incoming zone simultaneously
  // (independent per-zone tweens), which — once the position-drift that used
  // to keep them visually apart was removed for being unreliable (see memory
  // project_debug_menu_3d_cards.md) — left both panes' content overlapping
  // in the same screen position mid-transition, looking like a messy double
  // exposure. Sequential exit-then-enter is simpler and guarantees zero
  // overlap by construction: whatever isn't the currently-displayed zone is
  // always fully hidden (blend 0), never partially visible at the same time
  // as another zone.
  const paneRefs        = useRef<Record<Zone, HTMLDivElement | null>>({ 0: null, 1: null, 2: null })
  const displayedZoneRef = useRef<Zone | null>(null) // the one zone currently shown/fading
  const blendRef         = useRef(0)   // 0..1 opacity/drift progress for displayedZoneRef
  const targetBlendRef   = useRef(0)   // 0 (exiting) or 1 (entering) for displayedZoneRef
  const fadeStartRef     = useRef(0)   // blend value when the current phase began
  const elapsedRef       = useRef(0)
  // Entrance drift-origin vector (px offset of a zone's own accent body part
  // from viewport center) — captured ONCE, the instant that zone starts
  // entering, not re-sampled live every frame, so a pane arrives from a
  // fixed point and eases smoothly into rest rather than chasing a moving
  // target the whole way in. EXIT deliberately does NOT reuse this frozen
  // value (an earlier version did, for exact mirror symmetry) — the body
  // part is already mid-rotation toward whatever zone is being entered next
  // by the time a pane exits, and content should visibly leave toward
  // wherever its body part is heading now, not back the way it arrived —
  // see the live sample in the render loop below.
  const enterDriftRef = useRef<Record<Zone, { x: number; y: number }>>({
    0: { x: 0, y: 0 }, 1: { x: 0, y: 0 }, 2: { x: 0, y: 0 },
  })
  const liveDrift = (zone: Zone) => ({
    x: (posStore[zone].x - window.innerWidth  / 2) * ZONE_PARALLAX,
    y: (posStore[zone].y - window.innerHeight / 2) * ZONE_PARALLAX,
  })
  const captureDrift = (zone: Zone) => { enterDriftRef.current[zone] = liveDrift(zone) }
  const isContentModeRef  = useRef(isContentMode)
  // Content stays mounted while camera is mid-travel back to nav, so the exit
  // animation (scale 1→3, fade out) plays out fully before unmounting.
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    isContentModeRef.current = isContentMode
    if (isContentMode) {
      // Snap straight to whichever zone is already active so entry doesn't
      // fade in from scratch — only zone-to-zone switches (while already
      // visible) ease via the sequential tween below.
      const active = zoneStore.activeZone
      displayedZoneRef.current = active
      blendRef.current       = active !== null ? 1 : 0
      targetBlendRef.current = blendRef.current
      fadeStartRef.current   = blendRef.current
      elapsedRef.current     = ZONE_FADE_DURATION
      if (active !== null) captureDrift(active)
      zoneTransitionStore.displayedZone = active
      zoneTransitionStore.blend         = blendRef.current
      setIsVisible(true)
    }
  }, [isContentMode])

  // Warm the browser cache for project thumbnails immediately on mount so they're
  // ready before the user rotates to zone 0 (belt-and-suspenders with the <link
  // rel="preload"> in layout.tsx which fires even earlier via the HTML parser).
  useEffect(() => {
    projectsContent.forEach(p => { if (p.thumb) new window.Image().src = p.thumb })
  }, [])

  // Configs computed once after all aspect ratios are known — prevents overlap
  // that would occur if layout ran before the real card shapes were resolved.
  const [playgroundConfigs, setMiscConfigs] = useState<PlaygroundCardConfig[]>([])
  useLayoutEffect(() => {
    Promise.all(playgroundContent.map(resolveAspectRatio)).then(aspectRatios => {
      const resolved = playgroundContent.map((item, i) => ({ ...item, aspectRatio: aspectRatios[i] }))
      setMiscConfigs(buildConfigs(window.innerWidth, window.innerHeight, resolved))
    })
  }, [])

  // Drive scale + opacity from live camera Z so DOM content moves in lockstep with
  // the 3D camera pull — not on an independent CSS timer.
  //
  // Scale = CONTENT_Z / z  →  at z=5: scale=3 (content 3× oversized, spilling off screen)
  //                         →  at z=15: scale=1 (content at natural size and positions)
  // This is the correct perspective inverse: objects appear larger when camera is close.
  //
  // Opacity fades in quickly once the pull starts, so the first visible frame already
  // shows content large and settling — the scale decrease does all the animation work.
  //
  // The overlay CSS keeps pointer-events:none at all times so the transparent centerNav
  // circle (z-index:9, below overlay z-index:10) can still receive hover events.
  // Card children declare their own pointer-events:auto and receive events directly.
  useEffect(() => {
    const NAV_Z     = 5
    const CONTENT_Z = 15
    let rafId: number
    let lastTime = performance.now()
    const tick = (now: number) => {
      // dt-normalize the blend below — a fixed per-frame multiplier would decay
      // at whatever frame rate the machine happens to render at (proven to drag
      // out and ghost for seconds on a slow/throttled frame rate), same fix as
      // the slerp factors elsewhere (Model.tsx, Scene.tsx).
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now

      const el = overlayRef.current
      if (el) {
        const z = cameraStore.z
        const s = Math.min(CONTENT_Z / NAV_Z, CONTENT_Z / z)   // 3→1 as z: 5→15
        const o = Math.max(0, Math.min(1, (z - (NAV_Z + 0.5)) / 2))  // 0 at z=5.5, 1 at z=7.5
        el.style.transform = `scale(${s})`
        el.style.opacity   = String(o)

        // Unmount once camera has fully returned to the nav position
        if (!isContentModeRef.current && z <= NAV_Z + 0.3) {
          setIsVisible(false)
        }
      }

      // Sequential cross-fade + directional drift — see displayedZoneRef
      // comment above. Only ONE zone (displayedZoneRef) is ever non-zero;
      // switching zones exits the current one to blend 0 first, THEN starts
      // entering the new one, so no two zones are ever partially visible
      // together.
      const desired = zoneStore.activeZone
      if (desired !== displayedZoneRef.current && targetBlendRef.current !== 0) {
        // Desired zone changed — begin exiting whatever's currently shown
        // (or mid-entrance), from wherever its blend currently sits.
        fadeStartRef.current   = blendRef.current
        elapsedRef.current     = 0
        targetBlendRef.current = 0
      }
      if (targetBlendRef.current === 0 && blendRef.current <= 0.001 && displayedZoneRef.current !== desired) {
        // Fully exited (or nothing was shown yet) — switch to the desired
        // zone and start entering it. Freeze its entrance drift origin NOW
        // (see enterDriftRef comment) — exit does NOT reuse this, it
        // live-samples instead (see the render loop below).
        displayedZoneRef.current = desired
        fadeStartRef.current     = 0
        elapsedRef.current       = 0
        targetBlendRef.current   = desired !== null ? 1 : 0
        if (desired !== null) captureDrift(desired)
      }
      elapsedRef.current += dt
      const tp = Math.min(elapsedRef.current / ZONE_FADE_DURATION, 1)
      const eased = targetBlendRef.current === 1 ? easeOutCubic(tp) : easeInCubic(tp)
      blendRef.current = fadeStartRef.current + (targetBlendRef.current - fadeStartRef.current) * eased

      // Publish for anything outside this component to read — see
      // zoneTransitionStore.ts for why this needs to be the literal same
      // number, not an independently-computed one.
      zoneTransitionStore.displayedZone = displayedZoneRef.current
      zoneTransitionStore.blend         = blendRef.current

      ;([0, 1, 2] as const).forEach(zone => {
        const layer = paneRefs.current[zone]
        if (!layer) return
        const b = zone === displayedZoneRef.current ? blendRef.current : 0
        // Exiting (this zone is displayed but easing toward 0): live-sample
        // every frame, so the content visibly chases wherever its body part
        // is heading right now as the model keeps rotating toward whatever
        // zone comes next — NOT a mirror of the frozen direction it arrived
        // from. Entering (or settled): use the frozen entrance origin, so
        // it still arrives from a fixed point rather than an ever-shifting
        // target.
        const isExiting = zone === displayedZoneRef.current && targetBlendRef.current === 0
        const drift = isExiting ? liveDrift(zone) : enterDriftRef.current[zone]
        const dx = drift.x * (1 - b)
        const dy = drift.y * (1 - b)
        layer.style.transform = `translate(${dx}px, ${dy}px)`
        layer.style.opacity   = String(b)
        // Cards declare their own `pointer-events: auto` (so drags on the empty
        // canvas between them still reach the 3D model), which means the
        // layer's own pointer-events can't gate them — only `inert` actually
        // disables a faded-out zone's cards without also blocking the canvas.
        layer.inert = desired !== zone
      })

      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    // No inline pointer-events — the CSS rule (pointer-events:none) stands always.
    // This keeps the overlay transparent to events so the centerNav circle below it
    // (z-index:9) can receive mouseenter even though the overlay is at z-index:10.
    <div ref={overlayRef} className={styles.overlay} aria-live="polite">
      <div ref={el => { paneRefs.current[0] = el }} className={styles.paneLayer} aria-hidden={activeZone !== 0}>
        {isVisible && <ProjectsPane />}
      </div>
      <div ref={el => { paneRefs.current[1] = el }} className={styles.paneLayer} aria-hidden={activeZone !== 1}>
        {isVisible && <AboutPane />}
      </div>
      <div ref={el => { paneRefs.current[2] = el }} className={styles.paneLayer} aria-hidden={activeZone !== 2}>
        {isVisible && <PlaygroundPane configs={playgroundConfigs} />}
      </div>
    </div>
  )
}
