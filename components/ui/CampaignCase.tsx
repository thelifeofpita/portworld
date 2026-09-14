'use client'

import type { CSSProperties, ReactNode } from 'react'
import media from '@/content/campaign-page-media.json'
import { projectsContent } from '@/content/projectsContent'
import DitherReveal from './DitherReveal'
import styles from './CampaignCase.module.css'

export interface CampaignNavigation {
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

function Navigation({ onPrev, onNext, onClose }: CampaignNavigation) {
  return <nav className={styles.navigation} aria-label="Project navigation">
    <button className={styles.navBtn} onClick={onPrev} aria-label="Previous project"><span className={styles.navArrow}>←</span> Previous</button>
    <button className={styles.close} onClick={onClose} aria-label="Close">[X]</button>
    <button className={styles.navBtn} onClick={onNext} aria-label="Next project">Next <span className={styles.navArrow}>→</span></button>
  </nav>
}

export function CampaignImage({ id, sizes = '(min-width: 1600px) 1404px, 90vw', className }: {
  id: keyof typeof media
  sizes?: string
  className?: string
}) {
  const asset = media[id]
  // Assets are pre-sized and immutable; avoid a second optimizer request.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`${styles.image} ${className || ''}`} src={asset.src}
    srcSet={asset.srcSet} sizes={sizes} width={asset.width} height={asset.height}
    alt={asset.alt} loading="lazy" decoding="async" />
}

export function CampaignSection({ color, className, children }: {
  color: string
  className?: string
  children: ReactNode
}) {
  return <DitherReveal overlayColor={color} className={className}>{children}</DitherReveal>
}

export default function CampaignCase({ title, introduction, projectIndex, color, ink = '#0d0d0d', accent, children, ...navigation }: CampaignNavigation & {
  title: string
  introduction: string
  projectIndex: number
  color: string
  ink?: string
  accent: string
  children: ReactNode
}) {
  const project = projectsContent[projectIndex]
  const theme = { '--case-color': color, '--case-ink': ink, '--case-accent': accent } as CSSProperties
  return <div className={styles.page} style={theme} data-campaign={project.customLayout}>
    <div className={styles.inner}>
      <Navigation {...navigation} />
      <header className={styles.hero}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{introduction}</p>
      </header>
      <CampaignSection color={color} className={styles.film}>
        <iframe src={`https://www.youtube.com/embed/${project.youtubeId}`} title={`${title} — case film`} loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen />
      </CampaignSection>
      {children}
      <Navigation {...navigation} />
    </div>
  </div>
}
