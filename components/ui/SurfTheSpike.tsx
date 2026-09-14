'use client'

import DitherReveal from './DitherReveal'
import ProjectNav, { type ProjectNavProps } from './ProjectNav'
import styles from './SurfTheSpike.module.css'
import LazyLoopVideo from './LazyLoopVideo'

// Content order mirrors the "Surf the Spike" case on ideasfor.sale
// (#c/surf-the-spike). The in-project nav + typography are the same as
// BackInSmoothly. Brand-locked to Gemini blue (#4285F4) with white text,
// independent of the site's light/dark toggle.
const YOUTUBE_ID = 'nf5xLDfsp5k'
const PAGE_COLOR = '#4285F4'

type SurfTheSpikeDetailProps = ProjectNavProps

// Each environmental photo is a tall crop in a 4-up row; object-position keeps
// the campaign artwork (the window poster / the machine branding) in frame.
const PHOTOS = [
  { src: '/projects/proj1/shop1.webp', w: 900, h: 1012, pos: '40% 60%', alt: 'Gas station shop front, the campaign poster in the window' },
  { src: '/projects/proj1/shop2.webp', w: 900, h: 1012, pos: '68% 40%', alt: 'Behind a shop counter, the same campaign poster over the drinks fridge' },
  { src: '/projects/proj1/vend1.webp', w: 900, h: 1011, pos: '45% 50%', alt: 'Campus vending machine wrapped with the campaign' },
  { src: '/projects/proj1/vend2.webp', w: 900, h: 1012, pos: '46% 50%', alt: 'A row of campus vending machines carrying the same wrap' },
]

export default function SurfTheSpikeDetail({ onPrev, onNext, onClose }: SurfTheSpikeDetailProps) {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        <ProjectNav onPrev={onPrev} onNext={onNext} onClose={onClose} />

        <header className={styles.hero}>
          <h1 className={styles.title}>Surf the spike.</h1>
          <p className={styles.subtitle}>
            A solution for college students to take full advantage of their late-night caffeine-filled study sessions.
          </p>
        </header>

        <DitherReveal overlayColor={PAGE_COLOR} className={styles.videoBanner}>
          <iframe
            src={`https://www.youtube.com/embed/${YOUTUBE_ID}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Surf the Spike"
            loading="lazy"
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        </DitherReveal>

        <DitherReveal overlayColor={PAGE_COLOR} className={styles.mediaBlock}>
          {/* Intrinsic dimensions matter here, they aren't decoration: this
              block is styled width:100%/height:auto, so without them the
              browser has no height for it until the file decodes and the
              page grows under the reader mid-scroll. It also starves
              DitherReveal's ResizeObserver, which sizes its SVG mask from
              the measured box. */}
          {/* Desktop keeps the original 3-up composite. Phones get the same
              three handsets cropped apart and stacked, because at ~110px each
              the caffeine labels on their screens are unreadable — CSS decides
              which of the two is shown. */}
          <img
            className={styles.scanImg}
            src="/projects/proj1/scan.webp"
            width={1610}
            height={686}
            loading="lazy"
            decoding="async"
            alt="Three phones scanning a coffee, a tea and an energy shot, each labelled with the caffeine it holds"
          />
          <div className={styles.scanStack} aria-hidden="true">
            {([
              ['/projects/proj1/scan1.webp', 339, 672, 'A phone scanning a mug of coffee, labelled 100 mg of caffeine'],
              ['/projects/proj1/scan2.webp', 335, 679, 'A phone scanning a cup of tea, labelled 70 mg of caffeine'],
              ['/projects/proj1/scan3.webp', 381, 673, 'A phone scanning an energy shot, labelled 230 mg of caffeine'],
            ] as const).map(([src, w, h, alt]) => (
              <img key={src} src={src} width={w} height={h} loading="lazy" decoding="async" alt={alt} />
            ))}
          </div>
        </DitherReveal>

        <DitherReveal overlayColor={PAGE_COLOR} className={styles.mediaBlock}>
          <LazyLoopVideo className={styles.uiVideo} poster="/projects/proj1/ui-poster.webp" src="/projects/proj1/ui.mp4" />
        </DitherReveal>

        <DitherReveal overlayColor={PAGE_COLOR} className={styles.photoRow}>
          {PHOTOS.map(p => (
            <img
              key={p.src}
              className={styles.photoCell}
              src={p.src}
              width={p.w}
              height={p.h}
              loading="lazy"
              decoding="async"
              alt={p.alt}
              style={{ objectPosition: p.pos }}
            />
          ))}
        </DitherReveal>

        <ProjectNav onPrev={onPrev} onNext={onNext} onClose={onClose} />

      </div>
    </div>
  )
}
