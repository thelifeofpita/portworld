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

const CENTER_ENTER_RADIUS = 110  // px — enter nav mode when cursor enters the small model
const CENTER_EXIT_RADIUS  = 300  // px — stay in nav mode until cursor clears the section titles

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
  const [activeZone,       setActiveZone]       = useState<Zone | null>(null)
  const [loaded,           setLoaded]           = useState(false)
  const [isHoveringCenter, setIsHoveringCenter] = useState(false)
  const isDraggingRef    = useRef(false)
  const dragReleasedAt   = useRef(0)
  const activeZoneRef    = useRef<Zone | null>(null)  // mirror of activeZone for stable callbacks

  // Track pointer drag state globally — block center-exit during an active drag
  // so the camera doesn't pull back mid-drag when cursor leaves the center zone.
  useEffect(() => {
    const onDown = () => { isDraggingRef.current = true }
    const onUp   = () => {
      isDraggingRef.current  = false
      dragReleasedAt.current = Date.now()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup',   onUp)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup',   onUp)
    }
  }, [])

  // Exit detection: active only while in hover/nav mode.
  // EXIT_RADIUS is much larger than ENTER_RADIUS so the user can comfortably
  // move the cursor to any nav label without losing nav mode.
  useEffect(() => {
    if (!isHoveringCenter) return
    const onMove = (e: MouseEvent) => {
      if (isDraggingRef.current) return
      const dist = Math.hypot(e.clientX - window.innerWidth / 2, e.clientY - window.innerHeight / 2)
      if (dist > CENTER_EXIT_RADIUS) setIsHoveringCenter(false)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [isHoveringCenter])

  // Reset hover state when zone clears
  useEffect(() => {
    if (activeZone === null) setIsHoveringCenter(false)
  }, [activeZone])

  const isContentMode = activeZone !== null && !isHoveringCenter

  // Keep store in sync so ZoneNav can read it per-frame (non-React path)
  zoneStore.isContentMode = isContentMode

  // Entry detection: mousemove-only so stationary cursors don't re-trigger.
  // Also suppresses for 350ms after any drag release — works even when
  // isContentMode was already true before the drag started (zone switch),
  // which is why a closure-based suppress on effect activation isn't enough.
  useEffect(() => {
    if (!isContentMode) return
    const onMove = (e: MouseEvent) => {
      if (isDraggingRef.current) return
      if (Date.now() - dragReleasedAt.current < 350) return
      const dist = Math.hypot(e.clientX - window.innerWidth / 2, e.clientY - window.innerHeight / 2)
      if (dist <= CENTER_ENTER_RADIUS) setIsHoveringCenter(true)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [isContentMode])

  const handleLoad       = useCallback(() => setLoaded(true), [])
  const handleZoneChange = useCallback((zone: Zone) => {
    activeZoneRef.current = zone
    setActiveZone(zone)
    if (!isDraggingRef.current) setIsHoveringCenter(false)
  }, [])
  const handleZoneReset  = useCallback(() => {
    activeZoneRef.current = null
    setActiveZone(null)
    setIsHoveringCenter(false)
  }, [])
  // Called by Model as soon as the drag-release snap target is known.
  // Same zone → clear hover now (content won't change, camera can pull back).
  // Different zone → do nothing; handleZoneChange fires once the model arrives
  // and clears hover then, so the pull-back and content switch happen together.
  const handleSnapStart = useCallback((zone: Zone) => {
    if (zone === activeZoneRef.current) setIsHoveringCenter(false)
  }, [])
  // ZoneNav title clicks
  const handleSnap = useCallback((zone: number) => {
    if (zone === activeZoneRef.current) setIsHoveringCenter(false)
  }, [])

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
      <Scene
        onZoneChange={handleZoneChange}
        onZoneReset={handleZoneReset}
        onSnapStart={handleSnapStart}
        onLoad={handleLoad}
        isContentMode={isContentMode}
      />
      <ContentPanel activeZone={activeZone} isContentMode={isContentMode} />
      <ZoneNav isContentMode={isContentMode} onSnap={handleSnap} />

      {/* Visual reference zone over the small model — entry detection is via global mousemove */}
      {activeZone !== null && <div className={styles.centerNav} />}

      <div className={styles.byline} onClick={() => { handleSnap(1); zoneStore.snapToZone?.(1) }}>
        <span className={styles.bylineText}>THELIFEOF<span className={styles.bylinePita}>PITA</span></span>
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
      <CursorHint visible={loaded && !isContentMode} />
      <Loader visible={!loaded} />
    </main>
  )
}
