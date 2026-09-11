'use client'

import { useState, useRef, useEffect, useCallback, RefObject } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { AnimatePresence, motion, useAnimationFrame } from 'framer-motion'
import { posStore } from '@/lib/posStore'
import { zoneStore } from '@/lib/zoneStore'
import { zoneTransitionStore } from '@/lib/zoneTransitionStore'
import { fgStore } from '@/lib/fgStore'
import { rerollPalette } from '@/lib/paletteStore'
import { debugStore, hexToRgb255 } from '@/lib/debugStore'
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

      // Sync nav label color with the live palette-driven fg color (not
      // necessarily grayscale, so this reads fgStore directly rather than
      // re-deriving a gray from luminance).
      box.style.color = `rgb(${Math.round(fgStore.r * 255)},${Math.round(fgStore.g * 255)},${Math.round(fgStore.b * 255)})`
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

function MobileProjectCard({
  item, isOpen, onToggle, onPrev, onNext,
}: { item: ProjectItem; isOpen: boolean; onToggle: () => void; onPrev: () => void; onNext: () => void }) {
  const CustomLayout = item.customLayout ? CUSTOM_LAYOUTS[item.customLayout] : null
  return (
    <div className={`${styles.mobileProjectCard}${isOpen ? ` ${styles.mobileProjectCardOpen} ${styles.mobileProjectCardFullBleed}` : ''}`}>

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
                <Image src={item.thumb} alt={item.title} fill quality={90} loading="eager" style={{ objectFit: 'cover', transform: item.thumbScale && item.thumbScale !== 1 ? `scale(${item.thumbScale})` : undefined }} sizes="100vw" />
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
            {CustomLayout ? (
              <CustomLayout onPrev={onPrev} onNext={onNext} onClose={onToggle} />
            ) : (
              <>
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

  const n = projectsContent.length

  return (
    <div className={styles.mobileProjects}>
      {projectsContent.map((item, i) => (
        <MobileProjectCard
          key={i}
          item={item}
          isOpen={openIndex === i}
          onToggle={() => handleToggle(i)}
          onPrev={() => setOpenIndex((i - 1 + n) % n)}
          onNext={() => setOpenIndex((i + 1) % n)}
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
  // this just snaps blend to 1 the instant a zone is active.
  useEffect(() => {
    zoneTransitionStore.displayedZone = activeZone
    zoneTransitionStore.blend = activeZone !== null ? 1 : 0
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

      <main className={`${styles.mobileMain} ${activeZone === 2 ? styles.playgroundMode : ''}`}>
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
