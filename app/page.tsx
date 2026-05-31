'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
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

function CursorHint({ visible }: { visible: boolean }) {
  const ref        = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const visibleRef = useRef(visible)

  // Sync visible prop → ref and update opacity
  useEffect(() => {
    visibleRef.current = visible
    if (ref.current)
      ref.current.style.opacity = (visible && !isDragging.current) ? '1' : '0'
  }, [visible])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const sync = () => {
      el.style.opacity = (visibleRef.current && !isDragging.current) ? '1' : '0'
    }
    const onMove = (e: MouseEvent) => {
      el.style.left = e.clientX + 'px'
      el.style.top  = e.clientY + 'px'
    }
    const onDown = () => { isDragging.current = true;  sync() }
    const onUp   = () => { isDragging.current = false; sync() }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [])

  return (
    <div ref={ref} className={styles.cursorHint}>
      <span>drag</span>
      <span>click</span>
    </div>
  )
}

export default function Home() {
  const isMobile = useIsMobile()
  const [activeZone, setActiveZone] = useState<Zone | null>(null)
  const [loaded,     setLoaded]     = useState(false)
  const [pitaFontSize, setPitaFontSize] = useState('')

  const bylineNameRef = useCallback((node: HTMLSpanElement | null) => {
    if (!node) return
    const SHARED_STYLE = 'position:absolute;top:-9999px;visibility:hidden;white-space:nowrap;font-size:1rem;letter-spacing:-0.01em;font-family:inherit;pointer-events:none'
    const measure = () => {
      const parent = node.parentElement!
      const tName = document.createElement('span')
      tName.style.cssText = SHARED_STYLE
      tName.textContent = 'Jose David'
      const tPita = document.createElement('span')
      tPita.style.cssText = SHARED_STYLE
      tPita.textContent = 'Pita'
      parent.appendChild(tName)
      parent.appendChild(tPita)
      const nameW = tName.getBoundingClientRect().width
      const pitaW = tPita.getBoundingClientRect().width
      tName.remove()
      tPita.remove()
      if (nameW > 0 && pitaW > 0) setPitaFontSize(`${(nameW / pitaW).toFixed(4)}rem`)
    }
    measure()
    document.fonts.ready.then(measure)
  }, [])

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
      <div className={styles.byline} onClick={() => zoneStore.snapToZone?.(1)}>
        <span ref={bylineNameRef} className={styles.bylineName}>Jose David</span>
        <span className={styles.bylineLast} style={{ fontSize: pitaFontSize || undefined }}>Pita</span>
      </div>
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
      <CursorHint visible={loaded && activeZone === null} />
      <Loader visible={!loaded} />
    </main>
  )
}
