'use client'

import media from '@/content/back-in-smoothly-media.json'
import DitherReveal from './DitherReveal'
import styles from './BackInSmoothly.module.css'

const YOUTUBE_ID = 'ZOVg5GCUxqs'
const PLAY_URL = 'https://thelifeofpita.github.io/backingame/'

interface BackInSmoothlyDetailProps {
  onPrev:  () => void
  onNext:  () => void
  onClose: () => void
}

// Both the top and bottom instance carry their own [X] — this page has no
// separate fixed close button, so it scrolls away with the rest of this menu
// instead of hovering over the page the whole time (see ContentPanel.tsx,
// which skips its usual fixed .detailClose for this custom layout).
function ProjectNav({ onPrev, onNext, onClose }: BackInSmoothlyDetailProps) {
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

export default function BackInSmoothlyDetail({ onPrev, onNext, onClose }: BackInSmoothlyDetailProps) {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        <ProjectNav onPrev={onPrev} onNext={onNext} onClose={onClose} />

        <header className={styles.hero}>
          <h1 className={styles.title}>Back in smoothly.</h1>
          <p className={styles.subtitle}>
            Platanomelón takes over rear view cameras and situations where you go back to promote their relaxant lubricant.
          </p>
        </header>

        <DitherReveal overlayColor="#FFE500" className={styles.videoBanner}>
          <iframe
            src={`https://www.youtube.com/embed/${YOUTUBE_ID}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Back in smoothly"
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        </DitherReveal>

        <DitherReveal overlayColor="#FFE500" className={styles.gifRow}>
          <video className={styles.gifBox} autoPlay loop muted playsInline poster="/projects/proj5/gif1-poster.webp">
            <source src="/projects/proj5/gif1.mp4" type="video/mp4" />
          </video>
          <video className={styles.gifBox} autoPlay loop muted playsInline poster="/projects/proj5/gif2-poster.webp">
            <source src="/projects/proj5/gif2.mp4" type="video/mp4" />
          </video>
        </DitherReveal>

        {/* Each sticker carries its real pixel dimensions. These are the
            images DitherReveal's own comment calls out by name: styled
            width:100%/height:auto with no intrinsic ratio, their height was
            unknown until decode, so the mask <rect> measured height="0" and
            the reveal never played — and the page grew under the reader as
            they loaded. */}
        <DitherReveal overlayColor="#FFE500" className={styles.stickerRow}>
          {([
            ['/projects/proj5/sticker1.webp', 517, 555],
            ['/projects/proj5/sticker2.webp', 514, 515],
            ['/projects/proj5/sticker3.webp', 537, 546],
          ] as const).map(([src, w, h]) => (
            <img key={src} className={styles.sticker} src={src} width={w} height={h}
              loading="lazy" decoding="async"
              alt="Back in smoothly — easier with our relaxant lubricant" />
          ))}
        </DitherReveal>

        <DitherReveal overlayColor="#FFE500" className={styles.ctaRow}>
          <img className={styles.phoneBox} src={media['gif3.transparent'].src} width={608} height={1080}
            alt="Back in smoothly — updated mobile game demo 1" />

          <div className={styles.ctaCenter}>
            <a className={styles.ctaBadge} href={PLAY_URL} target="_blank" rel="noopener noreferrer">
              <span className={styles.ctaBadgeLine}>Tap to</span>
              <span className={styles.ctaBadgeLine}>Play now!</span>
            </a>
            <p className={styles.ctaCaption}>Best played on mobile.</p>
            <img className={styles.qr} src={media['qr.svg'].src}
              width={media['qr.svg'].width} height={media['qr.svg'].height}
              alt="Scan to play Back in smoothly on your phone" />
          </div>

          <img className={styles.phoneBox} src={media['gif4.transparent'].src} width={608} height={1080}
            alt="Back in smoothly — updated mobile game demo 2" />
        </DitherReveal>

        <DitherReveal overlayColor="#FFE500" className={styles.mockupRow}>
          {(['park1.webp', 'park2.webp', 'park3.webp'] as const).map((name, i) => (
            <img key={name} src={media[name].src} width={media[name].width} height={media[name].height}
              alt={`Back in smoothly — ${['star', 'flower', 'burst'][i]} sticker seen through a parking garage rear-view camera`} />
          ))}
        </DitherReveal>

        <ProjectNav onPrev={onPrev} onNext={onNext} onClose={onClose} />

      </div>
    </div>
  )
}
