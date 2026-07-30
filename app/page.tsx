'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Loader from '@/components/ui/Loader'
import ContentPanel from '@/components/ui/ContentPanel'
import ZoneNav from '@/components/ui/ZoneNav'
import MobilePage from '@/components/ui/MobilePage'
import Byline from '@/components/ui/Byline'
import { useIsMobile } from '@/hooks/useIsMobile'
import { zoneStore } from '@/lib/zoneStore'
import { loadPalette } from '@/lib/paletteStore'
import { aboutContent } from '@/content/aboutContent'
import type { Zone } from '@/types'
import styles from './page.module.css'

const CENTER_ENTER_RADIUS = 110  // px — reveal nav lines/titles when cursor enters the small model
const CENTER_EXIT_RADIUS  = 300  // px — keep nav lines visible until cursor clears the section titles

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
  // A random Lospec palette is fetched fresh on every visit (see paletteStore) —
  // kicked off here, in parallel with the 3D model loading, so the loading
  // screen never lets the site reveal itself in the wrong colors.
  const [paletteReady,     setPaletteReady]     = useState(false)
  useEffect(() => { loadPalette().finally(() => setPaletteReady(true)) }, [])
  // Hover near the small model only reveals the nav lines/titles — it never
  // grows the model or hides the work. Only an explicit click does that (see
  // handleModelClick), and that click fully deselects back to the landing view.
  const [isHoveringCenter, setIsHoveringCenter] = useState(false)
  const isDraggingRef    = useRef(false)
  const dragReleasedAt   = useRef(0)

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

  // Content mode (small model, camera pulled back, work visible) lasts as long
  // as a section is selected — hover never leaves it, only a model click does
  // (handleModelClick fully deselects, which clears activeZone).
  const isContentMode = activeZone !== null

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

  // Nav lines/titles are visible at landing (no content) — plus whenever the
  // cursor is hovering the small model while content is showing.
  const navVisible = !isContentMode || isHoveringCenter

  const handleLoad       = useCallback(() => setLoaded(true), [])
  const handleZoneChange = useCallback((zone: Zone) => {
    setActiveZone(zone)
  }, [])
  const handleZoneReset  = useCallback(() => {
    setActiveZone(null)
    setIsHoveringCenter(false)
  }, [])
  // Click on the small model while viewing content — deselects the section
  // entirely and returns to the landing view (model grows, work leaves).
  const handleModelClick = useCallback(() => { zoneStore.resetToLanding?.() }, [])

  if (isMobile) {
    return (
      <>
        <MobilePage
          activeZone={activeZone}
          onZoneChange={handleZoneChange}
          onZoneReset={handleZoneReset}
          onLoad={handleLoad}
        />
        <Loader visible={!loaded || !paletteReady} />
      </>
    )
  }

  return (
    <main className={styles.main}>
      <Scene
        onZoneChange={handleZoneChange}
        onZoneReset={handleZoneReset}
        onModelClick={handleModelClick}
        onLoad={handleLoad}
        isContentMode={isContentMode}
      />
      <ContentPanel activeZone={activeZone} isContentMode={isContentMode} />
      <ZoneNav isContentMode={!navVisible} />

      {/* Visual reference zone over the small model — entry detection is via global mousemove */}
      {activeZone !== null && <div className={styles.centerNav} />}

      <Byline />
      <div className={styles.contactFooter}>
        {aboutContent.linkedin && (
          <a href={aboutContent.linkedin} className={styles.contactLink} target="_blank" rel="noopener noreferrer">LinkedIn</a>
        )}
        {aboutContent.instagram && (
          <a href={aboutContent.instagram} className={styles.contactLink} target="_blank" rel="noopener noreferrer">Instagram</a>
        )}
      </div>
      <CursorHint visible={loaded && !isContentMode} />
      <Loader visible={!loaded || !paletteReady} />
    </main>
  )
}
