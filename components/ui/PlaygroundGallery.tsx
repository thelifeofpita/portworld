'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mediaManifest from '@/content/media-manifest.json'
import { registerMedia, initializeMediaClock } from '@/lib/mediaPlayback'
import { subscribeFrame } from '@/lib/frameScheduler'
import { observeLayout } from '@/lib/layoutMeasurement'
import { createPortal } from 'react-dom'
import { playgroundContent, type PlaygroundItem, type PlaygroundMediaItem } from '@/content/playgroundContent'
import { fitMasonry } from '@/lib/fitMasonry'
import styles from './PlaygroundGallery.module.css'
import projectNavStyles from './SurfTheSpike.module.css'
import { motion, useMotionValue, useSpring } from 'framer-motion'
import { fitOrbit } from '@/lib/fitOrbit'
import { cursorStore, ensureCursorTracking } from '@/lib/cursorStore'
import { projectCardCorners } from '@/lib/cardGlowStore'
import { playgroundGlowStore } from '@/lib/playgroundGlowStore'

const metadata = mediaManifest as Record<string, Partial<PlaygroundMediaItem>>
function pieces(item: PlaygroundItem): PlaygroundMediaItem[] {
  const all = item.media ?? (item.mp4 || item.webm
    ? [{ src: item.mp4 ?? item.webm!, type: 'video' as const, poster: item.poster }]
    : [{ src: item.poster!, type: 'image' as const }])
  return all.map(piece => ({ ...metadata[piece.src], ...piece }))
}

function useSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return { ref, ...size }
}

function Media({ piece, visible = true, active = visible, detail = false, onRatio, onReady, onDecoded }: {
  piece: PlaygroundMediaItem; visible?: boolean; active?: boolean; detail?: boolean;
  onRatio: (src: string, ratio: number) => void; onReady?: () => void; onDecoded?: () => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (piece.type === 'video') initializeMediaClock(piece.playbackId ?? piece.src) }, [piece.type, piece.playbackId, piece.src])
  const controller = useRef<ReturnType<typeof registerMedia> | null>(null)
  const [requested, setRequested] = useState(active)
  useEffect(() => { if (active) setRequested(true) }, [active])
  const src = requested ? (detail ? piece.detailSrc : piece.previewSrc) ?? piece.src : undefined
  useEffect(() => {
    const video = ref.current
    if (!video || !src) return
    const registered = registerMedia(video, piece.playbackId ?? piece.src, active, piece.duration)
    controller.current = registered
    return () => { registered.dispose(); controller.current = null }
  }, [src, piece.playbackId, piece.src, piece.duration]) // visibility updates the existing decoder below
  useEffect(() => controller.current?.setActive(active), [active])
  const style = { opacity: visible ? 1 : 0, ...(detail && piece.crop ? { objectFit: 'cover' as const, objectPosition: piece.crop.position } : {}) }
  return piece.type === 'video'
    ? <video ref={ref} src={src} data-playback-id={piece.playbackId ?? piece.src} poster={piece.poster} muted loop playsInline preload={active ? 'auto' : 'none'} width={piece.width} height={piece.height} className={styles.media} style={style}
        onError={() => onReady?.()}
        onLoadedData={() => onDecoded?.()}
        onLoadedMetadata={e => { if (!piece.width) onRatio(piece.src, e.currentTarget.videoWidth / e.currentTarget.videoHeight) }}
        onPlaying={e => { const video = e.currentTarget; if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => onReady?.()); else onReady?.() }} />
    : <img src={src} srcSet={requested ? piece.srcSet : undefined} sizes={detail ? '(max-width: 768px) 80vw, 45vw' : '(max-width: 768px) 45vw, 25vw'} width={piece.width} height={piece.height} alt={piece.alt ?? ''} className={styles.media} style={style} draggable={false} onError={() => onReady?.()} onLoad={e => { if (!piece.width) onRatio(piece.src, e.currentTarget.naturalWidth / e.currentTarget.naturalHeight); void e.currentTarget.decode().catch(() => {}).then(() => onReady?.()) }} />
}

function Preview({ item, covered, onRatio, warming = false, onPrepared }: { item: PlaygroundItem; covered: boolean; warming?: boolean; onPrepared?: () => void; onRatio: (src: string, ratio: number) => void }) {
  const all = useMemo(() => pieces(item), [item])
  const indices = useMemo(() => item.previewIndices ?? all.map((_, i) => i), [item, all])
  const [frame, setFrame] = useState(0)
  const [prepare, setPrepare] = useState(false)
  const [previous, setPrevious] = useState(-1)
  const ready = useRef(new Set<number>())
  const deadline = useRef(0)
  const prepared = useRef(false)
  useEffect(() => {
    if (covered || warming || indices.length < 2) return
    deadline.current = performance.now() + (item.previewDuration ?? 750)
    return subscribeFrame(now => {
      if (now >= deadline.current - 200 && !prepared.current) {
        const next = indices[(frame + 1) % indices.length]
        if (all[next].type === 'video') ready.current.delete(next)
        prepared.current = true; setPrepare(true)
      }
      if (now >= deadline.current && ready.current.has(indices[(frame + 1) % indices.length])) {
        prepared.current = false; setPrevious(indices[frame]); setFrame(f => (f + 1) % indices.length); setPrepare(false)
        deadline.current = Infinity
      }
    })
  }, [covered, warming, frame, indices, item.previewDuration, all])
  useEffect(() => { if (previous < 0) return; const timer = setTimeout(() => setPrevious(-1), 40); return () => clearTimeout(timer) }, [previous])
  return <>{all.map((piece, i) => <Media key={piece.src} piece={piece} visible={i === indices[frame]}
    active={!covered && (i === indices[frame] || i === previous || ((prepare || warming) && i === indices[(frame + 1) % indices.length]))}
    onDecoded={warming ? () => { ready.current.add(i); if (indices.slice(0, 2).every(index => ready.current.has(index))) onPrepared?.() } : undefined}
    onReady={() => { ready.current.add(i); if (indices.slice(0, 2).every(index => ready.current.has(index))) onPrepared?.() }} onRatio={onRatio} />)}</>
}

function Cover({ children, mobile, disabled }: { children: React.ReactNode; mobile: boolean; disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const rx = useMotionValue(0), ry = useMotionValue(0)
  const x = useSpring(rx, { stiffness: 260, damping: 22 }), y = useSpring(ry, { stiffness: 260, damping: 22 })
  useEffect(() => {
    if (mobile || disabled) return
    ensureCursorTracking()
    let slot = -1, progress = 0, last = performance.now()
    const anchor = ref.current?.parentElement
    if (!anchor) return
    // Section entrances move ancestors without resizing the card itself.
    const measurement = observeLayout(anchor)
    const tick = (now: number) => {
      const el = ref.current, anchor = el?.parentElement
      if (el && anchor && measurement.rect) {
        const r = measurement.rect, cx = r.left+r.width/2, cy = r.top+r.height/2
        if (cursorStore.hasMoved) {
          ry.set((cursorStore.x-cx)/(innerWidth/2)*1.15*16)
          rx.set(-(cursorStore.y-cy)/(innerHeight/2)*1.15*16)
        }
        const hovered = !disabled && (anchor.matches(':hover') || anchor.matches(':focus-visible'))
        progress += ((hovered ? 1 : 0)-progress)*(1-Math.pow(.86,Math.min(now-last,100)/1000*60))
        if (progress > .001) {
          if (slot < 0) slot = playgroundGlowStore.entries.findIndex(e => e === null)
          if (slot >= 0) playgroundGlowStore.entries[slot] = { corners: projectCardCorners(x.get(),y.get(),r.width,r.height,900,cx,cy), opacity: progress }
        } else if (slot >= 0) { playgroundGlowStore.entries[slot]=null; slot=-1 }
      }
      last=now
    }
    const stop = subscribeFrame(tick, measurement.read)
    return () => { stop(); measurement.dispose(); if(slot>=0) playgroundGlowStore.entries[slot]=null }
  }, [mobile,disabled,rx,ry,x,y])
  return <motion.div ref={ref} className={styles.art} data-tilt style={{ rotateX:x, rotateY:y, transformPerspective:900 }}>{children}</motion.div>
}

function Collection({ item, ratios, onRatio, close, navigate, visible = true }: {
  visible?: boolean; item: PlaygroundItem; ratios: Record<string, number>; onRatio: (src: string, ratio: number) => void; close: () => void; navigate: (dir: number) => void
}) {
  const { ref, width, height } = useSize()
  const all = pieces(item)
  const rects = useMemo(() => fitOrbit(pieces(item).map(p => p.crop?.aspectRatio ?? (p.width && p.height ? p.width / p.height : ratios[p.src]) ?? 1), width, height, true), [item,ratios,width,height])

  const [showScreenshots, setShowScreenshots] = useState(false)
  const gameRef = useRef<HTMLIFrameElement>(null)
  const playing = Boolean(item.gameUrl) && !showScreenshots
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!visible) return
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') navigate(1)
      if (e.key === 'ArrowLeft') navigate(-1)
      if (e.key === 'Tab') {
        const buttons = closeRef.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLElement>('button, a[href], iframe')
        if (!buttons?.length) return
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; previous?.focus() }
  }, [close, navigate, visible])
  return createPortal(<div className={styles.dialog} style={{ display: visible ? undefined : 'none' }} role="dialog" aria-modal="true" aria-label={item.title}>
    <nav className={`${projectNavStyles.projectNav} ${styles.collectionNav}`} aria-label="Collection navigation">
      <button className={projectNavStyles.navBtn} onClick={() => navigate(-1)} aria-label="Previous collection">← Previous</button>
      <button className={projectNavStyles.navClose} ref={closeRef} onClick={close} aria-label="Close collection">[X]</button>
      <button className={projectNavStyles.navBtn} onClick={() => navigate(1)} aria-label="Next collection">Next →</button>
    </nav>
    {item.gameUrl && <div className={styles.toolbar}>
      {item.gameUrl && <button onClick={() => setShowScreenshots(value => !value)}>{playing ? 'Screenshots' : 'Play game'}</button>}
      {playing && <button onClick={() => { void gameRef.current?.requestFullscreen().catch(() => {}) }} aria-label="Fullscreen game">⛶</button>}
      {item.externalUrl && <a href={item.externalUrl} target="_blank" rel="noopener noreferrer" className={styles.playLink}>itch.io ↗</a>}
    </div>}
    <div ref={ref} className={styles.collection} onClick={e => { if (e.target === e.currentTarget) close() }}>
      {item.gameUrl && <div className={styles.gameStage} style={{ display: playing ? undefined : 'none' }}>
        <iframe ref={gameRef} className={styles.gameFrame} title={`${item.title} playable game`} src={item.gameUrl} allow="autoplay; fullscreen; gamepad" allowFullScreen style={{ width: 960, height: 680, transform: `scale(${Math.min(width / 960, height / 680)})` }} />
      </div>}
      {!playing && all.map((piece, i) => <div key={piece.src} className={styles.piece} style={rects[i]}><Media piece={piece} detail active={visible} onRatio={onRatio} /></div>)}
    </div>
  </div>, document.body)
}

export default function PlaygroundGallery({ mobile = false, active = true, warming = false, onPrepared }: { mobile?: boolean; active?: boolean; warming?: boolean; onPrepared?: () => void }) {
  const { ref, width, height } = useSize()
  const preparedCards = useRef(new Set<number>())
  const [preparedCount, setPreparedCount] = useState(0)
  const prepareCard = useCallback((index: number) => {
    if (preparedCards.current.has(index)) return
    preparedCards.current.add(index)
    setPreparedCount(preparedCards.current.size)
  }, [])
  useEffect(() => {
    if (!warming || !width || !height || preparedCount !== playgroundContent.length) return
    // Let the measured layout and decoded previews paint before releasing Behold.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => onPrepared?.()) })
    return () => cancelAnimationFrame(frame)
  }, [warming, width, height, preparedCount, onPrepared])

  const [ratios, setRatios] = useState<Record<string, number>>({})
  const [open, setOpen] = useState<number | null>(null)
  const [games, setGames] = useState<Set<number>>(new Set())
  useEffect(() => { if (open !== null && playgroundContent[open].gameUrl) setGames(old => old.has(open) ? old : new Set([...old, open])) }, [open])
  const onRatio = useCallback((src: string, ratio: number) => {
    if (!(ratio > 0)) return
    setRatios(previous => previous[src] === ratio ? previous : { ...previous, [src]: ratio })
  }, [])
  const close = useCallback(() => setOpen(null), [])
  const navigate = useCallback((dir: number) => setOpen(i => i === null ? null : (i + dir + playgroundContent.length) % playgroundContent.length), [])
  // One fresh layout seed per mount: the orbit arrangement is scrambled (shape-
  // aware) on every visit, but stays put for the life of this view.
  const [seed] = useState(() => 1 + Math.floor(Math.random() * 2_000_000_000))
  // These cover ratios are the geometric mean of the preview assets' native
  // ratios, recorded in content. Loading or cutting to a piece cannot resize
  // a card; only a viewport resize can reflow the surrounding layout.
  const rects = useMemo(() => {
    const coverRatios = playgroundContent.map(item => item.aspectRatio ?? 1)
    return mobile ? fitMasonry(coverRatios,width,Math.max(0,height-24),28) : fitOrbit(coverRatios,width,height,false,seed)
  }, [mobile,width,height,seed])
  return <>
    <div ref={ref} className={`${styles.gallery} ${mobile ? styles.mobile : ''}`} aria-label="Playground">
      {playgroundContent.map((item, i) => <button key={item.title} className={styles.card} style={rects[i]} onClick={() => setOpen(i)} aria-label={`Open ${item.title}`}>
        <Cover mobile={mobile} disabled={!active || open !== null}><Preview item={item} covered={!active || open !== null} warming={warming} onPrepared={() => prepareCard(i)} onRatio={onRatio} /></Cover>
        <span className={styles.caption}>{item.title}</span>
      </button>)}
    </div>
    {[...games].map(index => <Collection key={index} visible={active && open === index} item={playgroundContent[index]} ratios={ratios} onRatio={onRatio} close={close} navigate={navigate} />)}
    {open !== null && !playgroundContent[open].gameUrl && <Collection key={playgroundContent[open].title} visible={active} item={playgroundContent[open]} ratios={ratios} onRatio={onRatio} close={close} navigate={navigate} />}
  </>
}
