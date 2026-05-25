'use client'

import { useState, useRef, useEffect, useCallback, RefObject } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { AnimatePresence, motion, useAnimationFrame } from 'framer-motion'
import { posStore } from '@/lib/posStore'
import { zoneStore } from '@/lib/zoneStore'
import { bgStore } from '@/lib/bgStore'
import { aboutContent } from '@/content/aboutContent'
import { projectsContent, type ProjectItem } from '@/content/projectsContent'
import { playgroundContent } from '@/content/playgroundContent'
import type { Zone } from '@/types'
import styles from './MobilePage.module.css'

const Scene = dynamic(() => import('@/components/canvas/Scene'), { ssr: false })

// ─── Shared constants ─────────────────────────────────────────────────────────

const COLOR_BASE  = [242,  12, 31] as const
const COLOR_FOCUS = [242, 223, 12] as const
const ACCENT_SMOOTH = 0.16

// Must match .mobileCanvasArea height in CSS
const CANVAS_VH = 0.45

const EASE_OUT = [0.22, 1, 0.36, 1] as const

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

      // Sync nav label color with bg transition (dark on light, light on dark)
      const fgVal = Math.round(13 + 227 * (1 - bgStore.luminance))
      box.style.color = `rgb(${fgVal},${fgVal},${fgVal})`
    })
  })

  return (
    <div ref={containerRef} className={styles.mobileZoneNavContainer}>
      <svg ref={svgRef} className={styles.mobileZoneNavSvg} aria-hidden="true">
        <line ref={line0} strokeWidth="1.5" stroke="#F20C1F" />
        <line ref={line1} strokeWidth="1.5" stroke="#F20C1F" />
        <line ref={line2} strokeWidth="1.5" stroke="#F20C1F" />
        <circle ref={dot0} r="3" fill="#F20C1F" />
        <circle ref={dot1} r="3" fill="#F20C1F" />
        <circle ref={dot2} r="3" fill="#F20C1F" />
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

function MobilePlayground() {
  const itemRefs  = useRef<(HTMLDivElement | null)[]>([])
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  useEffect(() => {
    const pick = () => {
      const vpCY = window.innerHeight / 2
      let best = 0, bestDist = Infinity
      itemRefs.current.forEach((el, i) => {
        if (!el) return
        const r    = el.getBoundingClientRect()
        const dist = Math.abs(r.top + r.height / 2 - vpCY)
        if (dist < bestDist) { bestDist = dist; best = i }
      })
      setSelectedIndex(best)
    }
    pick()
    window.addEventListener('scroll', pick, { passive: true })
    return () => window.removeEventListener('scroll', pick)
  }, [])

  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return
      if (i === selectedIndex) v.play().catch(() => {})
      else { v.pause(); v.currentTime = 0 }
    })
  }, [selectedIndex])

  // Two separate column arrays for seamless masonry — no row-height equalization
  const leftItems  = playgroundContent.filter((_, i) => i % 2 === 0)
  const rightItems = playgroundContent.filter((_, i) => i % 2 === 1)

  return (
    <div className={styles.mobilePlaygroundGrid}>
      <div className={styles.mobilePlaygroundCol}>
        {leftItems.map((item, col) => {
          const idx = col * 2
          return (
            <MobilePlaygroundItem
              key={idx}
              index={idx}
              item={item}
              isSelected={idx === selectedIndex}
              onRef={el  => { itemRefs.current[idx]  = el }}
              onVideoRef={el => { videoRefs.current[idx] = el }}
            />
          )
        })}
      </div>
      <div className={styles.mobilePlaygroundCol}>
        {rightItems.map((item, col) => {
          const idx = col * 2 + 1
          return (
            <MobilePlaygroundItem
              key={idx}
              index={idx}
              item={item}
              isSelected={idx === selectedIndex}
              onRef={el  => { itemRefs.current[idx]  = el }}
              onVideoRef={el => { videoRefs.current[idx] = el }}
            />
          )
        })}
      </div>
    </div>
  )
}

interface PlaygroundItemProps {
  index:      number
  item:       typeof playgroundContent[number]
  isSelected: boolean
  onRef:      (el: HTMLDivElement | null) => void
  onVideoRef: (el: HTMLVideoElement | null) => void
}

function MobilePlaygroundItem({ item, isSelected, onRef, onVideoRef }: PlaygroundItemProps) {
  const [ar, setAr] = useState(item.aspectRatio ?? 1)

  return (
    <div
      ref={onRef}
      className={`${styles.mobilePlaygroundItem}${isSelected ? ` ${styles.mobilePlaygroundSelected}` : ''}`}
    >
      <div className={styles.mobilePlaygroundThumb} style={{ aspectRatio: String(ar) }}>
        {(item.mp4 || item.webm) && (
          <video
            ref={onVideoRef}
            muted loop playsInline preload="metadata"
            onLoadedMetadata={e => {
              const v = e.currentTarget
              if (v.videoWidth && v.videoHeight) setAr(v.videoWidth / v.videoHeight)
            }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          >
            {item.webm && <source src={item.webm} type="video/webm" />}
            {item.mp4  && <source src={item.mp4}  type="video/mp4"  />}
          </video>
        )}
        {item.poster && (
          <img
            src={item.poster} alt=""
            className={styles.mobilePlaygroundPoster}
            style={{ opacity: isSelected && (item.mp4 || item.webm) ? 0 : 1 }}
            onLoad={e => {
              if (item.mp4 || item.webm) return
              const img = e.currentTarget
              if (img.naturalWidth && img.naturalHeight) setAr(img.naturalWidth / img.naturalHeight)
            }}
          />
        )}
      </div>
      <p className={styles.mobilePlaygroundTitle}>{item.title}</p>
    </div>
  )
}

// ─── Projects ─────────────────────────────────────────────────────────────────

function MobileProjectCard({
  item, isOpen, onToggle,
}: { item: ProjectItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className={styles.mobileProjectCard}>

      <div className={styles.mobileProjectHeader} onClick={onToggle}>
        <AnimatePresence mode="wait" initial={false}>
          {!isOpen ? (
            <motion.div
              key="thumb"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className={styles.mobileProjectThumbWrap}
            >
              {item.thumb && (
                <Image src={item.thumb} alt={item.title} fill style={{ objectFit: 'cover' }} sizes="100vw" />
              )}
              {item.icon && (
                <img src={item.icon} alt="" className={styles.mobileProjectIconOverlay} />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="title"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className={styles.mobileProjectTitleArea}
            >
              <h2 className={styles.mobileProjectTitle}>{item.title}</h2>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.38, ease: EASE_OUT }}
            style={{ overflow: 'hidden' }}
          >
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
                <Image src={item.images[0]} alt="" fill style={{ objectFit: 'cover' }} sizes="100vw" />
              </div>
            )}
            {item.images[1] && (
              <div className={styles.mobileProjectImageWrap}>
                <Image src={item.images[1]} alt="" fill style={{ objectFit: 'cover' }} sizes="100vw" />
              </div>
            )}

            <p className={styles.mobileProjectDesc}>{item.description}</p>

            {item.icon && (
              <div className={styles.mobileProjectIconGroup}>
                <img src={item.icon} alt="" className={styles.mobileProjectIconDetail} />
                {item.iconLabel && (
                  <span className={styles.mobileProjectIconLabel}>{item.iconLabel}</span>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MobileProjects() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const handleToggle = useCallback((i: number) => {
    setOpenIndex(prev => (prev === i ? null : i))
  }, [])

  return (
    <div className={styles.mobileProjects}>
      {projectsContent.map((item, i) => (
        <MobileProjectCard
          key={i}
          item={item}
          isOpen={openIndex === i}
          onToggle={() => handleToggle(i)}
        />
      ))}
    </div>
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
        <a href="/JOSE_PITA_EN.pdf" download className={styles.mobileCvDownload}>
          ▾ Download Full CV
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
  onLoad:       () => void
}

export default function MobilePage({ activeZone, onZoneChange, onZoneReset, onLoad }: MobilePageProps) {
  const canvasAreaRef = useRef<HTMLDivElement>(null)

  return (
    <>
      {/* Full-page fixed canvas — provides background everywhere, no seam against HTML */}
      <Scene
        onZoneChange={onZoneChange}
        onZoneReset={onZoneReset}
        onLoad={onLoad}
      />

      <main className={styles.mobileMain}>
        {/* Spacer — height reference for ZoneNav SVG line calculations */}
        <div ref={canvasAreaRef} className={styles.mobileCanvasArea} />

        {/* Zone nav — right below canvas, SVG lines overflow upward */}
        <MobileZoneNav activeZone={activeZone} canvasAreaRef={canvasAreaRef} />

      {/* Only the active section is rendered — no long scroll */}
      <AnimatePresence mode="wait">
        {activeZone === 0 && (
          <motion.section
            key="projects"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={styles.mobileSection}
          >
            <MobileProjects />
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
        {activeZone === 2 && (
          <motion.section
            key="playground"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={styles.mobileSection}
          >
            <MobilePlayground />
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
            {aboutContent.linkedin && (
              <a href={aboutContent.linkedin} target="_blank" rel="noopener noreferrer" className={styles.mobileContactLink}>
                LinkedIn
              </a>
            )}
            {aboutContent.email && (
              <a href={`mailto:${aboutContent.email}`} className={styles.mobileContactLink}>
                {aboutContent.email}
              </a>
            )}
            {aboutContent.instagram && (
              <a href={aboutContent.instagram} target="_blank" rel="noopener noreferrer" className={styles.mobileContactLink}>
                Instagram
              </a>
            )}
          </motion.footer>
        )}
      </AnimatePresence>
    </main>
    </>
  )
}
