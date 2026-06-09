'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useAnimation, useMotionValue, useTransform, useMotionValueEvent, animate as fmAnimate } from 'framer-motion'
import type { Zone } from '@/types'
import { playgroundContent, type PlaygroundItem } from '@/content/playgroundContent'
import { projectsContent, type ProjectItem } from '@/content/projectsContent'
import { aboutContent } from '@/content/aboutContent'
import styles from './ContentPanel.module.css'

// ─── Project card variants ────────────────────────────────────────────────────

const projectsContainer = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0 } },
  exit:    { transition: { staggerChildren: 0.03 } },
}

// Matches ACCENT_SMOOTH = 0.16 lerp (≈26 frames / 0.45 s to 99%)
const SLIDE_TRANSITION = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const }
const SLIDE_EXIT       = { duration: 0.30, ease: [0.4,  0, 1,  1]   as const }

// Snappy panel open/close — same feel as the accent color snap
const PANEL_TRANSITION = { duration: 0.22, ease: [0.2, 0, 0, 1] as const }
const PANEL_EXIT       = { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const }

// Function variants — Framer Motion calls these with the `custom` value at animation time.
// custom = { direction: 'left' | 'right', wasDragged: boolean }
// exitX is computed from window.innerWidth so the card always fully clears the viewport.
// Left column centre ≈ 20 % vw; right edge ≈ 20 % vw + half-card ≈ 370–500 px.
// We add 200 px buffer so even at 2560 px wide the trailing edge exits before unmount.
type CardCustom = { direction: 'left' | 'right'; wasDragged: boolean }

const cardVariants = {
  hidden:  ({ direction }: CardCustom) => ({
    x: direction === 'left' ? -200 : 200,
    opacity: 0,
  }),
  visible: { x: 0, opacity: 1, transition: SLIDE_TRANSITION },
  exit: ({ direction, wasDragged }: CardCustom) =>
    wasDragged
      ? { opacity: 0, transition: { duration: 0.3 } }
      : {
          x: direction === 'left'
            ? -(Math.round(window.innerWidth * 0.22 + 200))
            :   Math.round(window.innerWidth * 0.22 + 200),
          transition: SLIDE_EXIT,
        },
}

// ─── About pane variants ──────────────────────────────────────────────────────

const aboutContainer = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0 } },
  exit:    { transition: { staggerChildren: 0 } },
}

const slideFromLeft = {
  hidden:  { x: '-100%' },
  visible: { x: 0,       transition: SLIDE_TRANSITION },
  exit:    { x: '-100%', transition: SLIDE_EXIT },
}

const slideFromRight = {
  hidden:  { x: '100%' },
  visible: { x: 0,      transition: SLIDE_TRANSITION },
  exit:    { x: '100%', transition: SLIDE_EXIT },
}

// ─── Single card ─────────────────────────────────────────────────────────────

type CardRect = { top: number; left: number; width: number; height: number }

interface CardProps {
  n: number
  floatDelay: number
  direction: 'left' | 'right'
  onExpand: (rect: CardRect) => void
  thumb?: string
  icon?: string
  isOpen: boolean      // portal is fully open — card hides so they don't overlap
  isExpanded: boolean  // portal is open OR closing — float stays frozen
  xShift?: number      // extra horizontal offset in vw — positive = right
  thumbScale?: number  // CSS scale applied to the thumbnail image
}

function ProjectCard({ n, floatDelay, direction, onExpand, thumb, icon, isOpen, isExpanded, xShift = 0, thumbScale = 1 }: CardProps) {
  const controls        = useAnimation()
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const liveRef         = useRef(false)
  const shellRef        = useRef<HTMLDivElement>(null)
  const thumbRef        = useRef<HTMLDivElement>(null)
  const wasExpandedRef  = useRef(false)   // tracks if card was ever expanded so we can restart float on close
  const dragBlockRef    = useRef(false)   // true from drag-start until after onTap fires
  const [wasDragged, setWasDragged] = useState(false)

  const stopFloat = useCallback(() => {
    liveRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    controls.stop()
  }, [controls])

  const startFloat = useCallback(() => {
    liveRef.current = true
    const step = () => {
      if (!liveRef.current) return
      const y   = -(Math.random() * 18 + 6)
      const dur = Math.random() * 1.5 + 2.0
      try {
        controls.start({ y, transition: { duration: dur, ease: 'easeInOut' } })
      } catch { liveRef.current = false; return }
      timerRef.current = setTimeout(step, dur * 1000)
    }
    step()
  }, [controls])

  useEffect(() => {
    timerRef.current = setTimeout(startFloat, (0.65 + floatDelay) * 1000)
    return stopFloat
  }, [startFloat, stopFloat, floatDelay])

  useEffect(() => {
    if (isExpanded) {
      stopFloat()
      wasExpandedRef.current = true
    } else if (wasExpandedRef.current) {
      // isExpanded only becomes false after the portal has fully unmounted
      // (onExitComplete → closingIndex cleared). The card is already visible
      // at this point, so start floating almost immediately.
      const t = setTimeout(startFloat, 80)
      return () => clearTimeout(t)
    }
  }, [isExpanded, stopFloat, startFloat])

  return (
    <motion.li
      variants={cardVariants}
      custom={{ direction, wasDragged }}
      className={styles.projectCard}
      drag
      dragElastic={0}
      dragMomentum={false}
      whileDrag={{ scale: 1.05, zIndex: 20 }}
      onDragStart={() => { setWasDragged(true); dragBlockRef.current = true; stopFloat() }}
      onDragEnd={() => {
        timerRef.current = setTimeout(startFloat, 650)
        // Reset after onTap can fire — setTimeout(0) runs after all synchronous
        // pointer-up handlers in the same frame, so the block is still true when
        // onTap checks it, then clears before the next interaction.
        setTimeout(() => { dragBlockRef.current = false }, 0)
      }}
      onAnimationStart={(def) => { if (def === 'exit') stopFloat() }}
      onTap={() => {
        if (dragBlockRef.current) return
        // Stop float before measuring so the position is stable — the thumb div
        // is inside the float-animated div, so getBoundingClientRect() includes
        // the y-offset and returns the true visual position of the thumbnail.
        stopFloat()
        const r = thumbRef.current?.getBoundingClientRect()
        if (r) onExpand({ top: r.top, left: r.left, width: r.width, height: r.height })
      }}
      style={{ cursor: 'grab', marginLeft: xShift ? `${xShift}vw` : undefined }}
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
          ref={shellRef}
          className={styles.projectCardInner}
          animate={controls}
          style={{ transformOrigin: 'center bottom', pointerEvents: 'none' }}
        >
          <div className={styles.projectCardRow}>
            {icon && direction === 'left'  && <img src={icon} alt="" className={styles.projectIconLeft} />}
            <div ref={thumbRef} className={styles.projectThumb}>
              {thumb && <Image src={thumb} alt="" fill priority quality={90} style={{ objectFit: 'cover', transform: thumbScale !== 1 ? `scale(${thumbScale})` : undefined }} sizes="30vw" />}
            </div>
            {icon && direction === 'right' && <img src={icon} alt="" className={styles.projectIconRight} />}
          </div>
        </motion.div>
      </motion.div>
    </motion.li>
  )
}

// ─── Project detail overlay ───────────────────────────────────────────────────

type MediaSlot = 'video' | 'img0' | 'img1'
const ALL_SLOTS: MediaSlot[] = ['video', 'img0', 'img1']

function MediaContent({ slot, item, isFeatured }: { slot: MediaSlot; item: ProjectItem; isFeatured: boolean }) {
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
  // Featured slot spans the full right column (~65vw at typical desktop heights).
  // Non-featured slots are half that (~32vw). Using accurate sizes prevents
  // Next.js from serving an undersized image that gets upscaled and looks blurry.
  const sizes = isFeatured
    ? '100vw'
    : '(max-width: 768px) 100vw, 32vw'
  return src
    ? <Image src={src} alt="" fill quality={90} style={{ objectFit: 'cover' }} sizes={sizes} />
    : <div style={{ width: '100%', height: '100%', background: '#f0ece8' }} />
}

const MEDIA_SWAP = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const }

function ProjectDetail({ item, cardRect, onClose }: { item: ProjectItem; cardRect: CardRect; onClose: () => void }) {
  const [featured, setFeatured] = useState<MediaSlot>(item.defaultFeatured ?? 'video')
  const bottomSlots = ALL_SLOTS.filter(s => s !== featured)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Final panel bounds — computed once at mount so they're stable across the animation.
  const final = useRef({
    top:    window.innerHeight * 0.05,
    left:   window.innerWidth  * 0.05,
    width:  window.innerWidth  * 0.90,
    height: window.innerHeight * 0.90,
  }).current

  return createPortal(
    <>
      {/* Invisible hit area — covers viewport behind the panel, closes on outside click */}
      <motion.div
        style={{ position: 'fixed', inset: 0, zIndex: 50 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Panel — starts at thumbnail rect (pixel-perfect match with the card thumbnail),
          grows to full size. borderRadius stays at 0 (sharp corners). */}
      <motion.div
        className={styles.detailPanel}
        initial={{ ...cardRect, borderRadius: 0 }}
        animate={{ ...final, borderRadius: 0, transition: PANEL_TRANSITION }}
        exit={{ ...cardRect, borderRadius: 0, transition: PANEL_EXIT }}
        role="dialog"
        aria-modal="true"
      >
        {/* Thumbnail layer — covers the panel at card size so it matches the card.
            Fades out as the panel expands; fades back in as it collapses on close. */}
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0, transition: { delay: 0.08, duration: 0.12 } }}
          exit={{ opacity: 1, transition: { delay: 0.04, duration: 0.10 } }}
          style={{
            position: 'absolute', inset: 0,
            background: '#f0ece8',
            zIndex: 1,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {item.thumb && (
            <Image src={item.thumb} alt="" fill quality={90} style={{ objectFit: 'cover' }} sizes="90vw" />
          )}
        </motion.div>

        {/* Content — pinned to final dimensions so layout never reflows as the clip grows.
            Fades in after the thumbnail has cleared; fades out immediately on close. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.16, duration: 0.10 } }}
          exit={{ opacity: 0, transition: { duration: 0.04 } }}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: final.width, height: final.height,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            zIndex: 2,
          }}
        >
          <button className={styles.detailClose} onClick={onClose} aria-label="Close">×</button>

          <div className={styles.detailInner}>

            {/* Left — title */}
            <div className={styles.detailLeft}>
              <h2 className={styles.detailTitle}>{item.title}</h2>
            </div>

            {/* Right — media grid; click any bottom item to swap it to the top */}
            <div className={styles.detailRight}>
              <div className={styles.detailMediaGrid}>
                {ALL_SLOTS.map(slot => {
                  const isFeatured = slot === featured
                  const gridStyle = isFeatured
                    ? { gridColumn: '1 / span 2', gridRow: '1' }
                    : { gridColumn: String(bottomSlots.indexOf(slot) + 1), gridRow: '2' }
                  return (
                    <motion.div
                      key={slot}
                      layout
                      transition={MEDIA_SWAP}
                      className={styles.detailMediaItem}
                      style={{ ...gridStyle, position: 'relative', cursor: isFeatured ? 'default' : 'pointer' }}
                    >
                      <MediaContent slot={slot} item={item} isFeatured={isFeatured} />
                      {/* Overlay on bottom slots — intercepts iframe clicks and shows
                          the accent outline on hover. */}
                      {!isFeatured && (
                        <div
                          className={styles.detailMediaOverlay}
                          onClick={() => setFeatured(slot)}
                        />
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </div>

          </div>

          <p className={styles.detailDesc}>{item.description}</p>

          {item.icon && (
            <div className={styles.detailIconGroup}>
              <img src={item.icon} alt="" className={styles.detailIcon} />
              {item.iconLabel && <span className={styles.detailIconLabel}>{item.iconLabel}</span>}
            </div>
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
  // Rect is captured at tap time and held until the exit animation completes.
  const [expandedRect, setExpandedRect] = useState<CardRect | null>(null)
  // closingIndex tracks which card's portal is still in its exit animation.
  // The card stays opacity:0 until onExitComplete fires, preventing any overlap
  // between the shrinking portal and the re-appearing thumbnail.
  const [closingIndex, setClosingIndex] = useState<number | null>(null)

  const handleExpand = useCallback((index: number, rect: CardRect) => {
    setClosingIndex(null)   // clear any in-progress close so its card doesn't stay hidden
    setExpandedRect(rect)
    setExpandedIndex(index)
  }, [])

  const handleClose = useCallback(() => {
    setClosingIndex(expandedIndex)
    setExpandedIndex(null)
  }, [expandedIndex])

  // isOpen: portal is fully open — card hides so it doesn't show through the portal.
  // isExpanded: portal is open OR closing — float stays frozen until exit completes.
  const isOpen     = useCallback((n: number) => expandedIndex === n, [expandedIndex])
  const isHidden   = useCallback(
    (n: number) => expandedIndex === n || closingIndex === n,
    [expandedIndex, closingIndex]
  )

  return (
    <>
      <motion.div
        className={styles.projectsPane}
        style={{ overflow: 'hidden' }}
        variants={projectsContainer}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <ul className={styles.projectsList}>
          <ProjectCard n={1} floatDelay={0}    direction="left"  xShift={ 0.8} onExpand={(r) => handleExpand(0, r)} thumb={projectsContent[0].thumb} icon={projectsContent[0].icon} isOpen={isOpen(0)} isExpanded={isHidden(0)} />
          <ProjectCard n={2} floatDelay={0.55} direction="left"  xShift={-2}   onExpand={(r) => handleExpand(1, r)} thumb={projectsContent[1].thumb} icon={projectsContent[1].icon} isOpen={isOpen(1)} isExpanded={isHidden(1)} />
          <ProjectCard n={3} floatDelay={1.00} direction="left"  xShift={ 0.8} onExpand={(r) => handleExpand(2, r)} thumb={projectsContent[2].thumb} icon={projectsContent[2].icon} isOpen={isOpen(2)} isExpanded={isHidden(2)} />
        </ul>
        <ul className={styles.projectsList}>
          <ProjectCard n={4} floatDelay={0.28} direction="right" xShift={-0.8} onExpand={(r) => handleExpand(3, r)} thumb={projectsContent[3].thumb} icon={projectsContent[3].icon} isOpen={isOpen(3)} isExpanded={isHidden(3)} />
          <ProjectCard n={5} floatDelay={0.85} direction="right" xShift={ 2}   onExpand={(r) => handleExpand(4, r)} thumb={projectsContent[4].thumb} icon={projectsContent[4].icon} isOpen={isOpen(4)} isExpanded={isHidden(4)} thumbScale={projectsContent[4].thumbScale} />
          <ProjectCard n={6} floatDelay={1.30} direction="right" xShift={-0.8} onExpand={(r) => handleExpand(5, r)} thumb={projectsContent[5].thumb} icon={projectsContent[5].icon} isOpen={isOpen(5)} isExpanded={isHidden(5)} />
        </ul>
      </motion.div>

      {/* Detail overlay — portal so it escapes the overlay stacking context.
          onExitComplete clears closingIndex, unfreezing the card's float. */}
      <AnimatePresence onExitComplete={() => setClosingIndex(null)}>
        {expandedIndex !== null && expandedRect !== null && (
          <ProjectDetail
            key="detail"
            item={projectsContent[expandedIndex]}
            cardRect={expandedRect}
            onClose={handleClose}
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

  return (
    <motion.div
      className={styles.aboutPane}
      style={{ overflow: 'hidden' }}
      variants={aboutContainer}
      initial="hidden"
      animate="visible"
      exit="exit"
    >

      {/* ── Left: photo · bio · contact ── */}
      <motion.div className={styles.aboutPanelLeft} variants={slideFromLeft}>

        <div className={styles.aboutPanelInner}>
          <motion.div
            className={styles.aboutPhoto}
            aria-hidden="true"
            drag
            dragElastic={0}
            dragMomentum={false}
            whileDrag={{ scale: 1.03, zIndex: 20 }}
            style={{ cursor: 'grab', overflow: 'hidden', position: 'relative' }}
            onHoverStart={() => setPhotoHovered(true)}
            onHoverEnd={() => setPhotoHovered(false)}
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
          </motion.div>
          <p className={styles.bio}>{aboutContent.bio}</p>
        </div>
      </motion.div>

      {/* ── Right: CV ── */}
      <motion.div className={styles.aboutPanelRight} variants={slideFromRight}>
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
      </motion.div>

    </motion.div>
  )
}

// ─── Playground content ───────────────────────────────────────────────────────

interface PlaygroundCardConfig {
  x: number         // left anchor as % of containing block width (0–100)
  y: number         // top anchor as % of containing block height (0–100)
  thumbW: number    // sqrt(area × ar) — for placement
  thumbH: number    // sqrt(area / ar) — for placement
  floatDelay: number
  aspectRatio: number  // estimated ar — refined from video metadata at runtime
}

// 8 cards on each side (left zone / right zone), computed at mount from real
// pixel dimensions so all constraints are in consistent pixel units.
//
// Edge clearance: card centre is kept ≥ W_MAX from each viewport edge so that
// the 2× hover scale (which expands the card to 2 × thumbW wide) never clips.
//
// Centre clearance: a dead zone of 18 % of vw (13 % on viewports < 1200 px)
// each side of centre keeps cards clear of the 3D model and nav labels.
//
// Best-candidate placement: generate MAX_CANDIDATES random positions per card,
// pick the one that maximises the minimum edge-to-edge gap to all placed cards.
// Two-phase: phase 1 only accepts candidates with gap ≥ MIN_EDGE_GAP; if none
// qualify, phase 2 falls back to the unconstrained best (prevents clustering at
// very small viewport sizes while still guaranteeing no overlap in practice).
// Verified clip-free and overlap-free at 1280×800, 1366×768, 1440×900, 1920×1080.
function buildConfigs(vw: number, vh: number, items: PlaygroundItem[]): PlaygroundCardConfig[] {
  const count = items.length
  const MIN_EDGE_GAP   = 55    // min gap between card edges — large enough to absorb
  //                             the float animation (up to 24 px/card) and the difference
  //                             between initial aspect-ratio estimates and actual video ratios.
  const MAX_CANDIDATES = 1000  // larger pool needed for dense packing

  // Minimum gap between card edge and viewport edge at rest.
  // 50px horizontal gives visual breathing room from left/right borders.
  // 70px vertical clears the fixed byline (top: 4rem ≈ 64px) and footer (bottom: 4rem).
  const hoverClearX = 50
  const hoverClearY = 70

  // Tighter centre dead zone gives more room per side for larger cards.
  const centerClear = vw * (vw < 1200 ? 0.10 : 0.12)

  // Card area: viewport-relative baseline, capped so the worst-case zone
  // (the one with more cards) stays below TARGET_PACK packing density.
  // Formula: each card's effective exclusion footprint is (sqrt(area)+MIN_EDGE_GAP)².
  // Solving for area: area ≤ (sqrt(TARGET_PACK × spacePerCard) − MIN_EDGE_GAP)²
  const viewportArea   = vw * vh
  const zoneW          = vw * 0.50 - centerClear - hoverClearX
  const zoneH          = vh - 2 * hoverClearY
  const maxCardsInZone = Math.ceil(count / 2)
  const spacePerCard   = (zoneW * zoneH) / maxCardsInZone
  const TARGET_PACK    = 0.72  // keep below this packing ratio for reliable gap-compliant placement
  const areaFromPack   = Math.pow(Math.max(0, Math.sqrt(TARGET_PACK * spacePerCard) - MIN_EDGE_GAP), 2)
  const AREA_MAX       = Math.min(viewportArea * 0.0152, areaFromPack)
  const AREA_MIN       = Math.min(viewportArea * 0.0124, AREA_MAX * 0.82)

  const leftCount  = Math.ceil(count / 2)
  const rightCount = count - leftCount

  const zones = [
    { xMin: hoverClearX,              xMax: vw * 0.50 - centerClear, cards: leftCount  },
    { xMin: vw * 0.50 + centerClear,  xMax: vw - hoverClearX,        cards: rightCount },
  ]

  // Signed edge-to-edge gap between candidate (tx,ty,tw,th) and a placed card.
  // Negative means overlap on that axis. The 2-D gap is:
  //   – If boxes overlap on one axis → min of the two signed gaps (most negative wins)
  //   – Otherwise → min of the two positive clearances
  function edgeGap(
    tx: number, ty: number, tw: number, th: number,
    p: { cx: number; cy: number; w: number; h: number }
  ) {
    const gx = Math.abs(tx - p.cx) - (tw + p.w) / 2
    const gy = Math.abs(ty - p.cy) - (th + p.h) / 2
    if (gx < 0 && gy < 0) return Math.min(gx, gy)   // overlap — negative
    if (gx < 0) return gy
    if (gy < 0) return gx
    return Math.min(gx, gy)
  }

  function minGapToPlaced(
    tx: number, ty: number, tw: number, th: number,
    placed: { cx: number; cy: number; w: number; h: number }[]
  ) {
    let mg = Infinity
    for (const p of placed) {
      const g = edgeGap(tx, ty, tw, th, p)
      if (g < mg) mg = g
    }
    return mg
  }

  const placed: { cx: number; cy: number; w: number; h: number }[] = []
  const configs: PlaygroundCardConfig[] = []
  let gi = 0

  for (const zone of zones) {
    for (let j = 0; j < zone.cards; j++) {
      const i      = gi++
      const item   = items[i]
      // Use explicit aspectRatio if provided (required for image-only items).
      // For video items default to 1 (square) — actual ratio is refined later
      // via onLoadedMetadata. For other items without explicit ratio, fall back 4:3.
      const ar     = item?.aspectRatio ?? ((item?.mp4 || item?.webm) ? 1 : (4 / 3))
      const area   = AREA_MIN + Math.random() * (AREA_MAX - AREA_MIN)
      const thumbW = Math.round(Math.sqrt(area * ar))
      const thumbH = Math.round(Math.sqrt(area / ar))
      const cardH  = thumbH + 16
      const hw = thumbW / 2, hh = cardH / 2

      // Keep card centre inside zone (accounting for its own half-size)
      const cxMin = zone.xMin + hw
      const cxMax = zone.xMax - hw
      const cyMin = hoverClearY + hh
      const cyMax = vh - hoverClearY - hh

      // Evenly-spread fallback — only reached when the zone is very cramped
      let cx = (cxMin + cxMax) / 2
      let cy = cyMin + (cyMax - cyMin) * j / Math.max(zone.cards - 1, 1)

      let bestGap  = -Infinity
      let bestGapP1 = -Infinity   // phase-1 best (gap ≥ MIN_EDGE_GAP)
      let bxP1 = cx, byP1 = cy   // phase-1 winner coords
      let bxP2 = cx, byP2 = cy   // phase-2 winner coords (unconstrained)

      for (let a = 0; a < MAX_CANDIDATES; a++) {
        const tx = cxMin + Math.random() * (cxMax - cxMin)
        const ty = cyMin + Math.random() * (cyMax - cyMin)
        const g  = placed.length === 0 ? Infinity : minGapToPlaced(tx, ty, thumbW, cardH, placed)

        if (g >= MIN_EDGE_GAP && g > bestGapP1) { bestGapP1 = g; bxP1 = tx; byP1 = ty }
        if (g > bestGap)                         { bestGap   = g; bxP2 = tx; byP2 = ty }
      }

      // Prefer phase-1 (gap ≥ MIN_EDGE_GAP) if any candidate qualified
      if (bestGapP1 > -Infinity) { cx = bxP1; cy = byP1 }
      else                        { cx = bxP2; cy = byP2 }

      placed.push({ cx, cy, w: thumbW, h: cardH })
      configs.push({
        x: cx / vw * 100,
        y: cy / vh * 100,
        thumbW,
        thumbH,
        floatDelay: Math.random() * 2.0,
        aspectRatio: ar,
      })
    }
  }

  return configs
}

// ─── Playground card ──────────────────────────────────────────────────────────

const HOVER_SCALE   = 3
const CARD_LABEL_H  = 22   // flex gap (8px) + title line-height (≈14px)
const CORR_MARGIN   = 16   // min px from viewport edge when expanded (hovered card)

interface PlaygroundCardProps {
  index:            number
  cfg:              PlaygroundCardConfig
  item:             PlaygroundItem
  targetScale:      number
  onHoverStart:     (index: number) => void
  onHoverEnd:       (index: number) => void
  collapseCallbacks: React.MutableRefObject<Map<number, () => void>>
}

function PlaygroundCard({ index, cfg, item, targetScale, onHoverStart, onHoverEnd, collapseCallbacks }: PlaygroundCardProps) {
  const controls   = useAnimation()
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const liveRef    = useRef(false)
  const mountedRef = useRef(false)
  const videoRef   = useRef<HTMLVideoElement>(null)
  const cardRef    = useRef<HTMLDivElement>(null)
  const thumbRef   = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered]     = useState(false)
  const [aspectRatio, setAspectRatio] = useState(cfg.aspectRatio)
  const [displayWidth, setDisplayWidth] = useState(cfg.thumbW)

  const scaleValue     = useMotionValue(1)
  const borderPadding  = useTransform(scaleValue, s => 2 / s)
  const offsetX        = useMotionValue(0)
  const offsetY        = useMotionValue(0)
  const distScaleValue = useMotionValue(targetScale)
  const combinedScale  = useTransform([scaleValue, distScaleValue], ([s, d]: number[]) => s * d)

  useEffect(() => {
    fmAnimate(distScaleValue, targetScale, { duration: 0.35, ease: [0.22, 1, 0.36, 1] })
  }, [targetScale, distScaleValue])

  // ── Float animation ─────────────────────────────────────────────────────────

  const stopFloat = useCallback(() => {
    liveRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    controls.stop()
  }, [controls])

  const startFloat = useCallback(() => {
    liveRef.current = true
    const step = () => {
      if (!liveRef.current || !mountedRef.current) return
      const y   = -(Math.random() * 18 + 6)
      const rot = (Math.random() - 0.5) * 6
      const dur = Math.random() * 1.5 + 2.0
      try { controls.start({ y, rotate: rot, transition: { duration: dur, ease: 'easeInOut' } }) }
      catch { liveRef.current = false; return }
      timerRef.current = setTimeout(step, dur * 1000)
    }
    step()
  }, [controls])

  // ── Hover collapse ──────────────────────────────────────────────────────────

  const isPointerOverCard = useCallback((cx: number, cy: number) => {
    const r = thumbRef.current?.getBoundingClientRect()
    return !!r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom
  }, [])

  const collapseHover = useCallback(() => {
    setIsHovered(false)
    onHoverEnd(index)
    const v = videoRef.current
    if (v) { v.pause(); v.currentTime = 0 }
    fmAnimate(scaleValue, 1,   { duration: 0.25, ease: [0.22, 1, 0.36, 1] })
    // Animate this card's offset back immediately — other cards return via the
    // targetOffset effect once PlaygroundPane clears hoveredInfo (32 ms later).
    fmAnimate(offsetX,    0,   { duration: 0.35, ease: [0.22, 1, 0.36, 1] })
    fmAnimate(offsetY,    0,   { duration: 0.35, ease: [0.22, 1, 0.36, 1] })
    timerRef.current = setTimeout(startFloat, 400)
  }, [scaleValue, offsetX, offsetY, startFloat, onHoverEnd, index])

  useEffect(() => {
    mountedRef.current = true
    timerRef.current   = setTimeout(startFloat, (0.65 + cfg.floatDelay) * 1000)
    const onMove = (e: MouseEvent) => {
      if (!isHovered) return
      if (!isPointerOverCard(e.clientX, e.clientY)) collapseHover()
    }
    window.addEventListener('mousemove', onMove)
    return () => { mountedRef.current = false; stopFloat(); window.removeEventListener('mousemove', onMove) }
  }, [startFloat, stopFloat, cfg.floatDelay, isHovered, collapseHover, isPointerOverCard])

  // Register this card's collapse function so PlaygroundPane can force-collapse it
  // when a different card starts hovering (prevents dual-hover).
  useEffect(() => {
    collapseCallbacks.current.set(index, collapseHover)
    return () => { collapseCallbacks.current.delete(index) }
  }, [collapseCallbacks, index, collapseHover])

  // ── Slide direction (left / right zone) ────────────────────────────────────

  const slideX = cfg.x < 50 ? -window.innerWidth : window.innerWidth

  return (
    <motion.div
      style={{ position: 'absolute', left: `${cfg.x}%`, top: `${cfg.y}%`, pointerEvents: 'none', zIndex: isHovered ? 100 : 'auto' }}
      initial={{ x: slideX }}
      animate={{ x: 0,      transition: SLIDE_TRANSITION }}
      exit={{    x: slideX, transition: SLIDE_EXIT }}
    >
      <div className={styles.playgroundCardAnchor}>
        <motion.div style={{ x: offsetX, y: offsetY, pointerEvents: 'none' }}>
          <motion.div
            ref={cardRef}
            className={styles.playgroundCard}
            style={{ width: displayWidth, cursor: 'grab', scale: combinedScale }}
            drag
            dragElastic={0}
            dragMomentum={false}
            onHoverStart={() => {
              stopFloat()
              const rect     = thumbRef.current?.getBoundingClientRect()
              const cardRect = cardRef.current?.getBoundingClientRect()
              const vw = window.innerWidth, vh = window.innerHeight
              let corrX = 0, corrY = 0
              if (rect && cardRect) {
                const S = HOVER_SCALE
                // Strip in-progress correction offset so a stale offsetX/Y from a
                // previous hover doesn't shift the computed card center. This also
                // makes drag work correctly: drag is inside the offset div, so its
                // displacement is preserved in cardRect but the stale correction isn't.
                const cx = cardRect.left + cardRect.width  / 2 - offsetX.get()
                const cy = cardRect.top  + cardRect.height / 2 - offsetY.get()
                // Normalize thumb center relative to card center, then undo the
                // distScaleValue so we get the natural (d=1) offset. offsetX/Y
                // appears in both centers and cancels, so we skip subtracting it here.
                const d  = Math.max(distScaleValue.get(), 0.05)
                const dx = (rect.left + rect.width  / 2 - cardRect.left - cardRect.width  / 2) / d
                const dy = (rect.top  + rect.height / 2 - cardRect.top  - cardRect.height / 2) / d
                // Use display dimensions instead of the distorted rect dimensions.
                const tw = displayWidth, th = displayWidth / aspectRatio
                const natLeft   = cx + dx - tw / 2
                const natRight  = cx + dx + tw / 2
                const natTop    = cy + dy - th / 2
                const natBottom = cy + dy + th / 2
                const scaledLeft   = S * natLeft   - (S - 1) * cx
                const scaledRight  = S * natRight  - (S - 1) * cx
                const scaledTop    = S * natTop    - (S - 1) * cy
                const scaledBottom = S * natBottom - (S - 1) * cy + CARD_LABEL_H
                if      (scaledLeft   < CORR_MARGIN)      corrX = CORR_MARGIN - scaledLeft
                else if (scaledRight  > vw - CORR_MARGIN) corrX = (vw - CORR_MARGIN) - scaledRight
                if      (scaledTop    < CORR_MARGIN)      corrY = CORR_MARGIN - scaledTop
                else if (scaledBottom > vh - CORR_MARGIN) corrY = (vh - CORR_MARGIN) - scaledBottom
              }
              setIsHovered(true)
              videoRef.current?.play().catch(() => {})
              fmAnimate(offsetX, corrX, { duration: 0.25, ease: [0.22, 1, 0.36, 1] })
              fmAnimate(offsetY, corrY, { duration: 0.25, ease: [0.22, 1, 0.36, 1] })
              fmAnimate(scaleValue, HOVER_SCALE, { duration: 0.25, ease: [0.22, 1, 0.36, 1] })
              onHoverStart(index)
            }}
            onHoverEnd={(e) => {
              const pe = e as unknown as PointerEvent | null
              if (pe && isPointerOverCard(pe.clientX, pe.clientY)) return
              collapseHover()
            }}
            onDragStart={() => {
              stopFloat()
              if (isHovered) fmAnimate(scaleValue, HOVER_SCALE, { duration: 0.15, ease: [0.22, 1, 0.36, 1] })
            }}
            onDragEnd={(e) => {
              timerRef.current = setTimeout(startFloat, 650)
              const ev = ('clientX' in e ? e : (e as TouchEvent).changedTouches?.[0]) as MouseEvent | undefined
              if (ev && isPointerOverCard(ev.clientX, ev.clientY)) {
                setIsHovered(true)
                videoRef.current?.play().catch(() => {})
                fmAnimate(scaleValue, HOVER_SCALE, { duration: 0.25, ease: [0.22, 1, 0.36, 1] })
                onHoverStart(index)
              } else {
                collapseHover()
              }
            }}
          >
            {/* Inner div carries float — fully decoupled from scale and offset */}
            <motion.div
              className={styles.playgroundCardInner}
              animate={controls}
              style={{ transformOrigin: 'center 42%', pointerEvents: 'none' }}
            >
              <motion.div
                ref={thumbRef}
                className={styles.playgroundThumb}
                style={{
                  aspectRatio: String(aspectRatio),
                  padding: borderPadding,
                  backgroundColor: isHovered ? 'var(--accent-color)' : 'var(--fg-color)',
                  transition: 'background-color 0.25s cubic-bezier(0.22,1,0.36,1)',
                  boxSizing: 'border-box',
                }}
              >
                <div className={styles.playgroundThumbInner}>
                  {(item.mp4 || item.webm) && (
                    <video
                      ref={videoRef}
                      className={styles.playgroundVideo}
                      muted loop playsInline preload="metadata"
                      onLoadedMetadata={() => {
                        const v = videoRef.current
                        if (!v || !v.videoWidth || !v.videoHeight) return
                        const actualAr = v.videoWidth / v.videoHeight
                        setAspectRatio(actualAr)
                        setDisplayWidth(Math.round(Math.sqrt(cfg.thumbW * cfg.thumbH * actualAr)))
                        if (!item.poster) v.currentTime = 0
                      }}
                    >
                      {item.webm && <source src={item.webm} type="video/webm" />}
                      {item.mp4  && <source src={item.mp4}  type="video/mp4"  />}
                    </video>
                  )}
                  {item.poster && (
                    <img
                      src={item.poster} alt=""
                      className={styles.playgroundPoster}
                      style={{ opacity: (isHovered && (item.mp4 || item.webm)) ? 0 : 1 }}
                      onLoad={(e) => {
                        if (item.mp4 || item.webm) return
                        const img = e.currentTarget
                        if (!img.naturalWidth || !img.naturalHeight) return
                        const actualAr = img.naturalWidth / img.naturalHeight
                        setAspectRatio(actualAr)
                        setDisplayWidth(Math.round(Math.sqrt(cfg.thumbW * cfg.thumbH * actualAr)))
                      }}
                    />
                  )}
                </div>
              </motion.div>
              <motion.p
                className={styles.playgroundCardTitle}
                style={{ originX: 0, originY: 0 }}
                animate={{
                  scale:     isHovered ? 1 / HOVER_SCALE : 1,
                  marginTop: isHovered ? -(16 / HOVER_SCALE) : 0,
                }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >{item.title}</motion.p>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const hoveredRef        = useRef<number | null>(null)
  const clearRef          = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collapseCallbacks = useRef<Map<number, () => void>>(new Map())

  const handleHoverStart = useCallback((index: number) => {
    if (clearRef.current) { clearTimeout(clearRef.current); clearRef.current = null }
    const prev = hoveredRef.current
    hoveredRef.current = index
    setHoveredIndex(index)
    // Force-collapse any previously hovered card so two cards can't appear hovered
    // simultaneously when the pointer moves quickly between them.
    if (prev !== null && prev !== index) {
      collapseCallbacks.current.get(prev)?.()
    }
  }, [])

  const handleHoverEnd = useCallback((index: number) => {
    if (clearRef.current) clearTimeout(clearRef.current)
    clearRef.current = setTimeout(() => {
      if (hoveredRef.current === index) {
        hoveredRef.current = null
        setHoveredIndex(null)
      }
      clearRef.current = null
    }, 50)
  }, [])

  const getTargetScale = useCallback((i: number) => {
    if (hoveredIndex === null || hoveredIndex === i) return 1
    const hc = configs[hoveredIndex]
    const tc = configs[i]
    const vw = window.innerWidth
    const vh = window.innerHeight
    const dx = (tc.x - hc.x) / 100 * vw
    const dy = (tc.y - hc.y) / 100 * vh
    const dist = Math.sqrt(dx * dx + dy * dy)
    const t = Math.min(dist / (vw * 1.0), 1)
    return 1 - (t * t) * 0.9
  }, [hoveredIndex, configs])

  return (
    <motion.div className={styles.playgroundPane} exit={{}}>
      {configs.map((cfg, i) => (
        <PlaygroundCard
          key={i} index={i} cfg={cfg}
          item={playgroundContent[i]}
          targetScale={getTargetScale(i)}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
          collapseCallbacks={collapseCallbacks}
        />
      ))}
    </motion.div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface ContentPanelProps {
  activeZone: Zone | null
}

export default function ContentPanel({ activeZone }: ContentPanelProps) {
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

  return (
    <div className={styles.overlay} aria-live="polite">

      {/* Projects — full-viewport flanking cards */}
      <AnimatePresence>
        {activeZone === 0 && <ProjectsPane key="projects" />}
      </AnimatePresence>

      {/* About — full-viewport side panels */}
      <AnimatePresence>
        {activeZone === 1 && <AboutPane key="about" />}
      </AnimatePresence>

      {/* Misc — orbital cards; configs held here so layout is stable across visits */}
      <AnimatePresence>
        {activeZone === 2 && <PlaygroundPane key="misc" configs={playgroundConfigs} />}
      </AnimatePresence>

    </div>
  )
}
