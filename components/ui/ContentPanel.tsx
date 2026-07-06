'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useMotionValue, useSpring, useMotionTemplate, useTransform, type MotionValue } from 'framer-motion'
import type { Zone } from '@/types'
import { playgroundContent, type PlaygroundItem } from '@/content/playgroundContent'
import { projectsContent, type ProjectItem } from '@/content/projectsContent'
import { aboutContent } from '@/content/aboutContent'
import { cameraStore } from '@/lib/cameraStore'
import { silhouetteStore } from '@/lib/silhouetteStore'
import { zoneStore } from '@/lib/zoneStore'
import styles from './ContentPanel.module.css'

// Snappy panel open/close — same feel as the accent color snap
const PANEL_TRANSITION = { duration: 0.22, ease: [0.2, 0, 0, 1] as const }
const PANEL_EXIT       = { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const }

// ─── Hover tilt / lift / shine ───────────────────────────────────────────────
// Shared by project and playground cards: on hover the card lifts up, tilts in
// 3D toward the pointer, casts a soft shadow, and shows a moving specular shine.

const LIFT     = { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }
const TILT_MAX = 10  // degrees of rotation at the card edge

function useCardTilt() {
  const [hovered, setHovered] = useState(false)
  const rotateX = useMotionValue(0)
  const rotateY = useMotionValue(0)
  const shineX  = useMotionValue(50)
  const shineY  = useMotionValue(50)
  const springX = useSpring(rotateX, { stiffness: 260, damping: 22 })
  const springY = useSpring(rotateY, { stiffness: 260, damping: 22 })
  const shine   = useMotionTemplate`radial-gradient(circle at ${shineX}% ${shineY}%, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.07) 45%, rgba(255,255,255,0) 70%)`

  const onTiltMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    if (!r.width || !r.height) return
    const px = (e.clientX - r.left) / r.width  - 0.5
    const py = (e.clientY - r.top)  / r.height - 0.5
    rotateY.set(px * TILT_MAX * 2)
    rotateX.set(-py * TILT_MAX * 2)
    shineX.set((px + 0.5) * 100)
    shineY.set((py + 0.5) * 100)
  }, [rotateX, rotateY, shineX, shineY])

  const onTiltEnter = useCallback(() => setHovered(true), [])
  const onTiltLeave = useCallback(() => {
    setHovered(false)
    rotateX.set(0)
    rotateY.set(0)
  }, [rotateX, rotateY])

  return { hovered, springX, springY, shine, onTiltMove, onTiltEnter, onTiltLeave }
}

// ─── Single card ─────────────────────────────────────────────────────────────

type CardRect = { top: number; left: number; width: number; height: number }

interface CardProps {
  direction: 'left' | 'right'
  onExpand: (rect: CardRect) => void
  thumb?: string
  isOpen: boolean      // portal is fully open — card hides so they don't overlap
  thumbScale?: number  // CSS scale applied to the thumbnail image
}

function ProjectCard({ direction, onExpand, thumb, isOpen, thumbScale = 1 }: CardProps) {
  const thumbRef     = useRef<HTMLDivElement>(null)
  const dragBlockRef = useRef(false)
  const { hovered, springX, springY, shine, onTiltMove, onTiltEnter, onTiltLeave } = useCardTilt()

  return (
    <motion.li
      className={styles.projectCard}
      drag
      dragElastic={0}
      dragMomentum={false}
      whileDrag={{ scale: 1.05, zIndex: 20 }}
      onDragStart={() => { dragBlockRef.current = true }}
      onDragEnd={() => { setTimeout(() => { dragBlockRef.current = false }, 0) }}
      onPointerMove={onTiltMove}
      onPointerEnter={onTiltEnter}
      onPointerLeave={onTiltLeave}
      onTap={() => {
        if (dragBlockRef.current) return
        // Measure the thumb's live rect (including the hover lift) so the portal
        // opens from exactly where the card is on screen.
        const r = thumbRef.current?.getBoundingClientRect()
        if (r) onExpand({ top: r.top, left: r.left, width: r.width, height: r.height })
      }}
      style={{ cursor: 'grab' }}
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
          style={{ rotateX: springX, rotateY: springY, transformPerspective: 900, pointerEvents: 'none' }}
          animate={{ y: hovered ? -12 : 0, scale: hovered ? 1.04 : 1 }}
          transition={LIFT}
        >
          <div className={styles.projectCardRow}>
            <motion.div
              ref={thumbRef}
              className={styles.projectThumb}
              animate={{ boxShadow: hovered ? '0 24px 48px rgba(0, 0, 0, 0.12)' : '0 24px 48px rgba(0, 0, 0, 0)' }}
              transition={LIFT}
            >
              {thumb && <Image src={thumb} alt="" fill priority quality={90} style={{ objectFit: 'cover', transform: thumbScale !== 1 ? `scale(${thumbScale})` : undefined }} sizes="30vw" />}
              <motion.div
                className={styles.cardShine}
                style={{ background: shine }}
                animate={{ opacity: hovered ? 1 : 0 }}
                transition={{ duration: 0.25 }}
              />
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </motion.li>
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
    : <div style={{ width: '100%', height: '100%', background: '#f0ece8' }} />
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
  }, [goTo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowLeft')  goTo(vIdxRef.current - 1)
      if (e.key === 'ArrowRight') goTo(vIdxRef.current + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, goTo])

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
        exit={{ ...cardRect, borderRadius: 0, transition: PANEL_EXIT }}
        role="dialog"
        aria-modal="true"
      >
        {/* Thumbnail flash */}
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0, transition: { delay: 0.08, duration: 0.12 } }}
          exit={{ opacity: 1, transition: { delay: 0.04, duration: 0.10 } }}
          style={{ position: 'absolute', inset: 0, background: '#f0ece8', zIndex: 1, pointerEvents: 'none', overflow: 'hidden' }}
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
          <button className={styles.detailClose} onClick={onClose} aria-label="Close">×</button>

          <button
            className={styles.detailHomeLink}
            onClick={() => { onClose(); setTimeout(() => zoneStore.resetToLanding?.(), 300) }}
            aria-label="Return to home"
          >
            THELIFEOF<span className={styles.detailHomePita}>PITA</span>
          </button>

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
          {[0, 1, 2].map(i => (
            <ProjectCard key={i} direction="left" onExpand={(r) => handleExpand(i, r)} thumb={projectsContent[i].thumb} isOpen={expandedIndex === i} thumbScale={projectsContent[i].thumbScale} />
          ))}
        </ul>
        <ul ref={rightListRef} className={styles.projectsList}>
          {[3, 4, 5].map(i => (
            <ProjectCard key={i} direction="right" onExpand={(r) => handleExpand(i, r)} thumb={projectsContent[i].thumb} isOpen={expandedIndex === i} thumbScale={projectsContent[i].thumbScale} />
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
  const { hovered, springX, springY, shine, onTiltMove, onTiltEnter, onTiltLeave } = useCardTilt()

  // Preload all photos immediately so subsequent frames are already in cache
  useEffect(() => {
    aboutContent.photos.forEach(src => { new window.Image().src = src })
  }, [])

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

  return (
    <div className={styles.aboutPane}>

      {/* ── Left: photo · bio · contact ── */}
      <div className={styles.aboutPanelLeft}>

        <div className={styles.aboutPanelInner}>
          <motion.div
            className={styles.aboutPhoto}
            aria-hidden="true"
            drag
            dragElastic={0}
            dragMomentum={false}
            whileDrag={{ scale: 1.05, zIndex: 20 }}
            style={{ cursor: 'grab' }}
            onPointerMove={onTiltMove}
            onPointerEnter={handleEnter}
            onPointerLeave={handleLeave}
          >
            <motion.div
              style={{ rotateX: springX, rotateY: springY, transformPerspective: 900, pointerEvents: 'none' }}
              animate={{ y: hovered ? -12 : 0, scale: hovered ? 1.04 : 1 }}
              transition={LIFT}
            >
              <motion.div
                className={styles.aboutPhotoThumb}
                animate={{ boxShadow: hovered ? '0 24px 48px rgba(0, 0, 0, 0.12)' : '0 24px 48px rgba(0, 0, 0, 0)' }}
                transition={LIFT}
              >
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
                <motion.div
                  className={styles.cardShine}
                  style={{ background: shine }}
                  animate={{ opacity: hovered ? 1 : 0 }}
                  transition={{ duration: 0.25 }}
                />
              </motion.div>
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
            download
            className={styles.cvDownload}
          >▾ Download Full CV</a>

        </div>
      </div>

    </div>
  )
}

// ─── Playground content ───────────────────────────────────────────────────────

interface PlaygroundCardConfig {
  x: number            // card centre as % of viewport width
  y: number            // card centre as % of viewport height
  thumbW: number       // thumbnail width in px
  thumbH: number       // thumbnail height in px
  aspectRatio: number  // real w/h — resolved from poster/video before layout
}

// Full-width masonry with per-column circular exclusion.
//
// N equal-width columns span the viewport. Columns whose footprint intersects
// the exclusion circle get a vertical gap — items sit above AND below the model.
// Portrait items that are too tall to fit in a gap-column section are routed to
// outer (full-height) columns instead, preventing any overflow.
function buildConfigs(vw: number, vh: number, items: PlaygroundItem[]): PlaygroundCardConfig[] {
  const rem         = parseFloat(getComputedStyle(document.documentElement).fontSize)
  const GAP         = 20
  const LABEL_H     = 22
  const marginX     = 44
  const marginTop    = rem * 7    // clears header: 3rem top + ~2.75rem text + gap
  const marginBottom = rem * 6    // clears footer: 4rem bottom + 1rem text + gap

  const R  = Math.min(vw, vh) * 0.08
  const ex = vw / 2
  const ey = vh / 2

  const n     = items.length
  const ars   = items.map(it => it.aspectRatio ?? 1)
  const avgAR = ars.reduce((s, ar) => s + ar, 0) / n
  const zoneH = vh - marginTop - marginBottom

  // Equal-area sizing: thumbW = S*√AR, thumbH = S/√AR → area = S² for every card.
  // Use √avgAR for the column-count estimate (average card height ≈ S/√avgAR).
  const sqrtAvgAR = Math.sqrt(avgAR)
  let N = 8, cardW = 0
  for (let nc = 6; nc <= 10; nc++) {
    const w = (vw - 2 * marginX - (nc - 1) * GAP) / nc
    if ((w / sqrtAvgAR + LABEL_H + GAP) * (n / nc) <= zoneH * 0.88) {
      N = nc; cardW = w; break
    }
  }
  if (!cardW) {
    N = 10
    cardW = (vw - 2 * marginX - (N - 1) * GAP) / N
  }

  interface ColInfo {
    cx: number; gapTop: number | null; gapBottom: number | null
    topAvail: number; botAvail: number; items: number[]
  }

  const cols: ColInfo[] = []
  for (let c = 0; c < N; c++) {
    const xLeft    = marginX + c * (cardW + GAP)
    const colCx    = xLeft + cardW / 2
    const nearX    = Math.max(xLeft, Math.min(ex, xLeft + cardW))
    const nearDist = Math.abs(nearX - ex)

    let gapTop: number | null = null, gapBottom: number | null = null
    let topAvail = zoneH, botAvail = 0

    if (nearDist < R) {
      const half = Math.sqrt(R * R - nearDist * nearDist)
      gapTop    = Math.max(marginTop,         ey - half)
      gapBottom = Math.min(vh - marginBottom, ey + half)
      topAvail  = Math.max(0, gapTop - marginTop)
      botAvail  = Math.max(0, vh - marginBottom - gapBottom)
    }

    cols.push({ cx: colCx, gapTop, gapBottom, topAvail, botAvail, items: [] })
  }

  // Per-card visual dimensions with equal-area scaling: thumbW = S*√AR, thumbH = S/√AR.
  // Cap thumbW to the column pitch so adjacent landscape cards never visually overlap.
  // For capped cards the true AR is still preserved (thumbH = cappedW / AR),
  // only the area is slightly reduced for very wide cards.
  const sqrtArs = ars.map(ar => Math.sqrt(ar))
  const pitch   = cardW + GAP

  function visW(itemIdx: number): number {
    return Math.min(cardW * sqrtArs[itemIdx], pitch - 2)
  }

  function cardH(itemIdx: number): number {
    return visW(itemIdx) / ars[itemIdx]
  }

  // Returns true if the item can fit in at least one section of the column.
  function canFit(itemIdx: number, col: ColInfo): boolean {
    if (col.gapTop === null) return true
    const itemH = cardH(itemIdx) + LABEL_H
    return itemH <= col.topAvail || itemH <= col.botAvail
  }

  // Greedy: prefer columns where the item actually fits in a section.
  // Add a small left/right alternating tiebreaker so cards spread evenly
  // across both sides of the center model rather than clustering on one side.
  const remaining = cols.map(c => c.gapTop === null ? zoneH : c.topAvail + c.botAvail)
  let lastSide = -1  // 0 = left of center, 1 = right of center
  for (let i = 0; i < n; i++) {
    let best = -1, bestScore = -Infinity
    for (let c = 0; c < N; c++) {
      if (!canFit(i, cols[c]) || remaining[c] <= 0) continue
      const side = cols[c].cx > ex ? 1 : 0
      const sideBonus = (lastSide === -1 || side !== lastSide) ? 0.5 : 0
      const score = remaining[c] + sideBonus
      if (score > bestScore) { bestScore = score; best = c }
    }
    if (best === -1) {
      let fallback = -Infinity
      for (let c = 0; c < N; c++) {
        const side = cols[c].cx > ex ? 1 : 0
        const sideBonus = (lastSide === -1 || side !== lastSide) ? 0.5 : 0
        const score = remaining[c] + sideBonus
        if (score > fallback) { fallback = score; best = c }
      }
    }
    if (best === -1) best = 0
    cols[best].items.push(i)
    remaining[best] -= cardH(i) + LABEL_H + GAP
    lastSide = cols[best].cx > ex ? 1 : 0
  }

  const configs: PlaygroundCardConfig[] = new Array(n)

  // Place group within [yStart, yEnd]. Each card: thumbW = S*√AR, thumbH = S/√AR → same area.
  function placeGroup(group: number[], yStart: number, yEnd: number, colCx: number) {
    if (!group.length || yEnd <= yStart) return
    const placed: number[] = []
    let usedH = 0
    for (const idx of group) {
      const itemH = cardH(idx) + LABEL_H
      const gap   = placed.length > 0 ? GAP : 0
      if (usedH + gap + itemH > yEnd - yStart + 1) break
      placed.push(idx)
      usedH += gap + itemH
    }
    if (!placed.length) return
    const total  = placed.reduce((s, idx) => s + cardH(idx) + LABEL_H + GAP, 0) - GAP
    const offset = Math.max(0, (yEnd - yStart - total) / 2)
    let y = yStart + offset
    for (const idx of placed) {
      const h = cardH(idx)
      const w = visW(idx)
      configs[idx] = {
        x: colCx / vw * 100,
        y: (y + (h + LABEL_H) / 2) / vh * 100,
        thumbW: Math.round(w), thumbH: Math.round(h), aspectRatio: ars[idx],
      }
      y += h + LABEL_H + GAP
    }
  }

  for (const col of cols) {
    if (!col.items.length) continue
    if (col.gapTop === null) {
      placeGroup(col.items, marginTop, vh - marginBottom, col.cx)
    } else {
      let usedTop = 0, split = 0
      for (let k = 0; k < col.items.length; k++) {
        const itemH = cardH(col.items[k]) + LABEL_H
        const gap   = split > 0 ? GAP : 0
        if (usedTop + gap + itemH > col.topAvail) break
        usedTop += gap + itemH; split = k + 1
      }
      placeGroup(col.items.slice(0, split), marginTop,      col.gapTop,        col.cx)
      placeGroup(col.items.slice(split),    col.gapBottom!, vh - marginBottom, col.cx)
    }
  }

  return configs
}

// ─── Playground card ──────────────────────────────────────────────────────────

interface PlaygroundCardProps {
  cfg:  PlaygroundCardConfig
  item: PlaygroundItem
}

function PlaygroundCard({ cfg, item }: PlaygroundCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { hovered, springX, springY, shine, onTiltMove, onTiltEnter, onTiltLeave } = useCardTilt()

  const handleEnter = useCallback(() => {
    onTiltEnter()
    videoRef.current?.play().catch(() => {})
  }, [onTiltEnter])

  const handleLeave = useCallback(() => {
    onTiltLeave()
    const v = videoRef.current
    if (v) { v.pause(); v.currentTime = 0 }
  }, [onTiltLeave])

  return (
    <div style={{ position: 'absolute', left: `${cfg.x}%`, top: `${cfg.y}%`, pointerEvents: 'none', zIndex: hovered ? 100 : 'auto' }}>
      <div className={styles.playgroundCardAnchor}>
        <motion.div
          className={styles.playgroundCard}
          style={{ width: cfg.thumbW, cursor: 'grab' }}
          drag
          dragElastic={0}
          dragMomentum={false}
          whileDrag={{ scale: 1.05, zIndex: 20 }}
          onPointerMove={onTiltMove}
          onPointerEnter={handleEnter}
          onPointerLeave={handleLeave}
        >
          <motion.div
            className={styles.playgroundCardInner}
            style={{ rotateX: springX, rotateY: springY, transformPerspective: 700, pointerEvents: 'none' }}
            animate={{ y: hovered ? -10 : 0, scale: hovered ? 1.06 : 1 }}
            transition={LIFT}
          >
            <motion.div
              className={styles.playgroundThumb}
              style={{ aspectRatio: String(cfg.aspectRatio) }}
              animate={{ boxShadow: hovered ? '0 20px 40px rgba(0, 0, 0, 0.12)' : '0 20px 40px rgba(0, 0, 0, 0)' }}
              transition={LIFT}
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
              <motion.div
                className={styles.cardShine}
                style={{ background: shine }}
                animate={{ opacity: hovered ? 1 : 0 }}
                transition={{ duration: 0.25 }}
              />
            </motion.div>
            <p className={styles.playgroundCardTitle}>{item.title}</p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

// ─── Aspect-ratio resolver ────────────────────────────────────────────────────
// Reads the real w/h from the poster image (fast, always available when set)
// or from video metadata as fallback, before buildConfigs runs — so placement
// is computed with the actual card shape and cards never overlap post-load.

function resolveAspectRatio(item: PlaygroundItem): Promise<number> {
  if (item.aspectRatio !== undefined) return Promise.resolve(item.aspectRatio)

  const giveUp = new Promise<number>(r => setTimeout(() => r(1), 3000))

  const detect = new Promise<number>(resolve => {
    if (item.poster) {
      const img = new window.Image()
      img.onload  = () => resolve((img.naturalWidth / img.naturalHeight) || 1)
      img.onerror = () => resolve(1)
      img.src = item.poster
    } else if (item.mp4 || item.webm) {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => resolve((v.videoWidth / v.videoHeight) || 1)
      v.onerror = () => resolve(1)
      v.src = (item.mp4 ?? item.webm)!
    } else {
      resolve(1)
    }
  })

  return Promise.race([detect, giveUp])
}

// ─── Playground pane ──────────────────────────────────────────────────────────

function PlaygroundPane({ configs }: { configs: PlaygroundCardConfig[] }) {
  return (
    <div className={styles.playgroundPane}>
      {configs.map((cfg, i) =>
        cfg ? <PlaygroundCard key={i} cfg={cfg} item={playgroundContent[i]} /> : null
      )}
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface ContentPanelProps {
  activeZone: Zone | null
  isContentMode: boolean
}

export default function ContentPanel({ activeZone, isContentMode }: ContentPanelProps) {
  const overlayRef        = useRef<HTMLDivElement>(null)
  const isContentModeRef  = useRef(isContentMode)
  // Content stays mounted while camera is mid-travel back to nav, so the exit
  // animation (scale 1→3, fade out) plays out fully before unmounting.
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    isContentModeRef.current = isContentMode
    if (isContentMode) setIsVisible(true)
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
    const tick = () => {
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
      {isVisible && activeZone === 0 && <ProjectsPane />}
      {isVisible && activeZone === 1 && <AboutPane />}
      {isVisible && activeZone === 2 && <PlaygroundPane configs={playgroundConfigs} />}
    </div>
  )
}
