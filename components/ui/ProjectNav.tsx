'use client'

import type { Ref } from 'react'
import styles from './ProjectNav.module.css'

export interface ProjectNavProps {
  onPrev:  () => void
  onNext:  () => void
  onClose: () => void
}

// The Previous / [X] / Next row shared by every case page (top and bottom) and
// the playground collections. It used to be four copies — one per case page
// plus CampaignCase's — each with its own hardcoded hover colour.
//
// Colours are custom properties set by whatever hosts the row (ContentPanel's
// detail panel, MobilePage's overlay, PlaygroundGallery's .collectionNav), so a
// page never needs to know who its neighbours are:
//   --detail-ink       resting text colour
//   --nav-prev-color   hover on Previous: the previous project's page colour
//   --nav-next-color   hover on Next: the next project's page colour
//   --nav-close-color  hover on [X]: the home view's background
//
// [X] scrolls away with the page rather than pinning to a corner, which is why
// ContentPanel skips its fixed .detailClose for custom layouts.
export default function ProjectNav({ onPrev, onNext, onClose, noun = 'project', className, closeRef }: ProjectNavProps & {
  noun?:      string
  className?: string
  closeRef?:  Ref<HTMLButtonElement>
}) {
  const label = noun[0].toUpperCase() + noun.slice(1)
  return (
    <nav className={`${styles.nav}${className ? ` ${className}` : ''}`} aria-label={`${label} navigation`}>
      <button className={styles.btn} data-dir="prev" onClick={onPrev} aria-label={`Previous ${noun}`}>
        <span className={styles.arrow}>←</span> Previous
      </button>
      <button ref={closeRef} className={`${styles.btn} ${styles.close}`} onClick={onClose} aria-label={noun === 'project' ? 'Close' : `Close ${noun}`}>[X]</button>
      <button className={styles.btn} data-dir="next" onClick={onNext} aria-label={`Next ${noun}`}>
        Next <span className={styles.arrow}>→</span>
      </button>
    </nav>
  )
}
