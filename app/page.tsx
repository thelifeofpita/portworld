'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Loader from '@/components/ui/Loader'
import ContentPanel from '@/components/ui/ContentPanel'
import ZoneNav from '@/components/ui/ZoneNav'
import MobilePage from '@/components/ui/MobilePage'
import { useIsMobile } from '@/hooks/useIsMobile'
import { zoneStore } from '@/lib/zoneStore'
import { aboutContent } from '@/content/aboutContent'
import type { Zone } from '@/types'
import styles from './page.module.css'

const Scene = dynamic(() => import('@/components/canvas/Scene'), { ssr: false })

export default function Home() {
  const isMobile = useIsMobile()
  const [activeZone, setActiveZone] = useState<Zone | null>(null)
  const [loaded,     setLoaded]     = useState(false)

  const handleLoad       = useCallback(() => setLoaded(true), [])
  const handleZoneChange = useCallback((zone: Zone) => setActiveZone(zone), [])
  const handleZoneReset  = useCallback(() => setActiveZone(null), [])

  if (isMobile) {
    return (
      <>
        <MobilePage
          activeZone={activeZone}
          onZoneChange={handleZoneChange}
          onZoneReset={handleZoneReset}
          onLoad={handleLoad}
        />
        <Loader visible={!loaded} />
      </>
    )
  }

  return (
    <main className={styles.main}>
      {/* Scene inside main — restores original stacking / pointer-event behaviour */}
      <Scene onZoneChange={handleZoneChange} onZoneReset={handleZoneReset} onLoad={handleLoad} />
      <ContentPanel activeZone={activeZone} />
      <ZoneNav />
      <span className={styles.byline} onClick={() => zoneStore.snapToZone?.(1)}>thelifeofpita</span>
      <div className={styles.contactFooter}>
        {aboutContent.linkedin && (
          <a href={aboutContent.linkedin} className={styles.contactLink} target="_blank" rel="noopener noreferrer">LinkedIn</a>
        )}
        {aboutContent.email && (
          <a href={`mailto:${aboutContent.email}`} className={styles.contactLink}>{aboutContent.email}</a>
        )}
        {aboutContent.instagram && (
          <a href={aboutContent.instagram} className={styles.contactLink} target="_blank" rel="noopener noreferrer">Instagram</a>
        )}
      </div>
      <Loader visible={!loaded} />
    </main>
  )
}
