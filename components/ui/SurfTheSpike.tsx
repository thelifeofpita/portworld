'use client'

import DitherReveal from './DitherReveal'
import styles from './SurfTheSpike.module.css'

// Content order mirrors the "Surf the Spike" case on ideasfor.sale
// (#c/surf-the-spike). The in-project nav + typography are the same as
// BackInSmoothly. Brand-locked to Gemini blue (#4285F4) with white text,
// independent of the site's light/dark toggle.
const YOUTUBE_ID = 'nf5xLDfsp5k'
const PAGE_COLOR = '#4285F4'

interface SurfTheSpikeDetailProps {
  onPrev:  () => void
  onNext:  () => void
  onClose: () => void
}

// Each environmental photo is a tall crop in a 4-up row; object-position keeps
// the campaign artwork (the window poster / the machine branding) in frame.
const PHOTOS = [
  { src: '/projects/proj1/shop1.webp', pos: '40% 60%', alt: 'Gas station shop front, the campaign poster in the window' },
  { src: '/projects/proj1/shop2.webp', pos: '68% 40%', alt: 'Behind a shop counter, the same campaign poster over the drinks fridge' },
  { src: '/projects/proj1/vend1.webp', pos: '45% 50%', alt: 'Campus vending machine wrapped with the campaign' },
  { src: '/projects/proj1/vend2.webp', pos: '46% 50%', alt: 'A row of campus vending machines carrying the same wrap' },
]

// Both the top and bottom instance carry their own [X] — this page has no
// separate fixed close button (ContentPanel.tsx skips its usual fixed
// .detailClose for a custom layout), so it scrolls away with the rest of
// this menu instead of hovering the whole time. Identical to BackInSmoothly.
function ProjectNav({ onPrev, onNext, onClose }: SurfTheSpikeDetailProps) {
  return (
    <nav className={styles.projectNav} aria-label="Project navigation">
      <button className={styles.navBtn} onClick={onPrev} aria-label="Previous project">
        <span className={styles.navArrow}>←</span> Previous
      </button>
      <button className={styles.navClose} onClick={onClose} aria-label="Close">[X]</button>
      <button className={styles.navBtn} onClick={onNext} aria-label="Next project">
        Next <span className={styles.navArrow}>→</span>
      </button>
    </nav>
  )
}

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
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        </DitherReveal>

        <DitherReveal overlayColor={PAGE_COLOR} className={styles.mediaBlock}>
          <img
            className={styles.scanImg}
            src="/projects/proj1/scan.webp"
            alt="Three phones scanning a coffee, a tea and an energy shot, each labelled with the caffeine it holds"
          />
        </DitherReveal>

        <DitherReveal overlayColor={PAGE_COLOR} className={styles.mediaBlock}>
          <video
            className={styles.uiVideo}
            autoPlay
            loop
            muted
            playsInline
            poster="/projects/proj1/ui-poster.webp"
          >
            <source src="/projects/proj1/ui.mp4" type="video/mp4" />
          </video>
        </DitherReveal>

        <DitherReveal overlayColor={PAGE_COLOR} className={styles.photoRow}>
          {PHOTOS.map(p => (
            <img
              key={p.src}
              className={styles.photoCell}
              src={p.src}
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
