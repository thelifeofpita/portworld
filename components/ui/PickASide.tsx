'use client'

import type { CSSProperties } from 'react'

import DitherReveal from './DitherReveal'
import styles from './PickASide.module.css'
import LazyLoopVideo from './LazyLoopVideo'

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

// Pre-framed device mockups from the case — shown whole in a 2×2 grid, not
// cropped. The sources carry alpha; mp4 does not, so they are encoded
// composited over this page's #FFC72C rather than mp4's default black.
//
// These are mp4 now, not animated webp. They always were video in an image
// container: app was 371 frames and reminder 208, and the four together came
// to 9MB — enough that on a phone the grid rendered as empty coloured boxes
// while they downloaded, which is what made this page look broken. The same
// frames as h264 come to 1.8MB (-80%), and every other case page on the site
// already uses mp4 + poster for its loops (BackInSmoothly's gifRow,
// SurfTheSpike's uiVideo, CampaignLoop), so this follows the house pattern
// rather than inventing one.
const MOCKS = [
  { src: '/projects/proj6/order.mp4',    w: 560, h: 922, alt: 'A McDonald’s order kiosk: the Pick a Side menu blocks folding down into a ballot' },
  { src: '/projects/proj6/checkout.mp4', w: 560, h: 898, alt: 'The kiosk order summary resolving into a red ballot box' },
  { src: '/projects/proj6/reminder.mp4', w: 560, h: 626, alt: 'A McDonald’s fries carton turning to show an “I PICKED MY SIDE” sticker' },
  { src: '/projects/proj6/app.mp4',      w: 460, h: 990, alt: 'The McDonald’s app: a Pick a Side section running the election live, state by state' },
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
            loading="lazy"
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        </DitherReveal>

        <DitherReveal overlayColor={PAGE_COLOR} className={styles.mockGrid}>
          {MOCKS.map(m => (
            <LazyLoopVideo
              key={m.src}
              className={styles.mockCell}
              width={m.w}
              height={m.h}
              // A <video> does NOT derive an aspect ratio from its width/height
              // attributes the way an <img> does — the height attribute just
              // becomes the box height. So a 100%-wide video with no CSS height
              // got a 898px-tall box with the frame letterboxed inside it.
              // The mobile rule consumes this; desktop keeps its own 3:4 cell.
              style={{ '--mock-aspect': `${m.w} / ${m.h}` } as CSSProperties}
              poster={m.src.replace('.mp4', '-poster.jpg')}
              src={m.src}
              aria-label={m.alt}
            />
          ))}
        </DitherReveal>

        <ProjectNav onPrev={onPrev} onNext={onNext} onClose={onClose} />

      </div>
    </div>
  )
}
