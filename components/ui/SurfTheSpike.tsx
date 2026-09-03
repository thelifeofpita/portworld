'use client'

import DitherReveal from './DitherReveal'
import styles from './SurfTheSpike.module.css'

// Content order mirrors the "Surf the Spike" case on ideasfor.sale
// (#c/surf-the-spike). The in-project nav + typography are the same as
// BackInSmoothly, and — like its hero — every section is introduced by a
// subtitle in the same style. Brand-locked to Gemini blue (#4285F4) with
// white text, independent of the site's light/dark toggle.
const YOUTUBE_ID = 'nf5xLDfsp5k'
const PAGE_COLOR = '#4285F4'

interface SurfTheSpikeDetailProps {
  onPrev:  () => void
  onNext:  () => void
  onClose: () => void
}

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

        <section className={styles.section}>
          <p className={styles.sectionSubtitle}>Video case.</p>
          <DitherReveal overlayColor={PAGE_COLOR} className={styles.videoBanner}>
            <iframe
              src={`https://www.youtube.com/embed/${YOUTUBE_ID}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Surf the Spike"
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            />
          </DitherReveal>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionSubtitle}>Scan your caffeine intake.</p>
          <DitherReveal overlayColor={PAGE_COLOR} className={styles.mediaBlock}>
            <img
              className={styles.scanImg}
              src="/projects/proj1/scan.webp"
              alt="Three phones scanning a coffee, a tea and an energy shot, each labelled with the caffeine it holds"
            />
          </DitherReveal>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionSubtitle}>
            Get your specific energy curve tracked, and a study plan that benefits from it.
          </p>
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
        </section>

        <section className={styles.section}>
          <p className={styles.sectionSubtitle}>
            Reached students in gas stations near residences, and in vending machines inside campus.
          </p>
          <DitherReveal overlayColor={PAGE_COLOR} className={styles.photoGrid}>
            <img className={styles.photoCell} src="/projects/proj1/shop1.webp" alt="Gas station shop front, the campaign running on a screen in the window" />
            <img className={styles.photoCell} src="/projects/proj1/shop2.webp" alt="Behind a shop counter, the same campaign on a screen over the drinks fridge" />
            <img className={styles.photoCell} src="/projects/proj1/vend1.webp" alt="Campus vending machine wrapped with the campaign" />
            <img className={styles.photoCell} src="/projects/proj1/vend2.webp" alt="A row of campus vending machines carrying the same wrap" />
          </DitherReveal>
        </section>

        <ProjectNav onPrev={onPrev} onNext={onNext} onClose={onClose} />

      </div>
    </div>
  )
}
