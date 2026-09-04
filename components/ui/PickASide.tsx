'use client'

import DitherReveal from './DitherReveal'
import styles from './PickASide.module.css'

// Content order mirrors the "Pick a Side" case on pita-salva.com
// (#pick-a-side). The in-project nav + typography are the same as
// BackInSmoothly / SurfTheSpike. Brand-locked to McDonald's yellow (#FFC72C)
// with near-black text — yellow rather than red so the red fries-box mockup
// doesn't vanish against the background.
const YOUTUBE_ID = 'C9xKzRLujqs'
const PAGE_COLOR = '#FFC72C'

interface PickASideDetailProps {
  onPrev:  () => void
  onNext:  () => void
  onClose: () => void
}

// Pre-framed device mockups (animated webp) from the case — shown whole in a
// 2×2 grid, not cropped.
const MOCKS = [
  { src: '/projects/proj6/order.webp',    alt: 'A McDonald’s order kiosk: the Pick a Side menu blocks folding down into a ballot' },
  { src: '/projects/proj6/checkout.webp', alt: 'The kiosk order summary resolving into a red ballot box' },
  { src: '/projects/proj6/reminder.webp', alt: 'A McDonald’s fries carton turning to show an “I PICKED MY SIDE” sticker' },
  { src: '/projects/proj6/app.webp',      alt: 'The McDonald’s app: a Pick a Side section running the election live, state by state' },
]

// Both the top and bottom instance carry their own [X] — this page has no
// separate fixed close button (ContentPanel.tsx skips its usual fixed
// .detailClose for a custom layout), so it scrolls away with the rest of
// this menu instead of hovering the whole time. Identical to BackInSmoothly.
function ProjectNav({ onPrev, onNext, onClose }: PickASideDetailProps) {
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

export default function PickASideDetail({ onPrev, onNext, onClose }: PickASideDetailProps) {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        <ProjectNav onPrev={onPrev} onNext={onNext} onClose={onClose} />

        <header className={styles.hero}>
          <h1 className={styles.title}>Pick a side.</h1>
          <p className={styles.subtitle}>
            For the midterm elections in the United States, McDonald&rsquo;s turned its side menu into a ballot.
          </p>
        </header>

        <DitherReveal overlayColor={PAGE_COLOR} className={styles.videoBanner}>
          <iframe
            src={`https://www.youtube.com/embed/${YOUTUBE_ID}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Pick a Side"
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        </DitherReveal>

        <DitherReveal overlayColor={PAGE_COLOR} className={styles.mockGrid}>
          {MOCKS.map(m => (
            <img key={m.src} className={styles.mockCell} src={m.src} alt={m.alt} />
          ))}
        </DitherReveal>

        <ProjectNav onPrev={onPrev} onNext={onNext} onClose={onClose} />

      </div>
    </div>
  )
}
