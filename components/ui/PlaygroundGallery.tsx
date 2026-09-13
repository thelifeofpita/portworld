'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { registerMedia, initializeMediaClock } from '@/lib/mediaPlayback'
import { subscribeFrame } from '@/lib/frameScheduler'
import { observeLayout } from '@/lib/layoutMeasurement'
import { createPortal } from 'react-dom'
import { playgroundContent, type PlaygroundItem, type PlaygroundMediaItem } from '@/content/playgroundContent'
import { pieces } from '@/lib/playgroundMedia'
import styles from './PlaygroundGallery.module.css'
import projectNavStyles from './SurfTheSpike.module.css'
import { motion, useMotionValue, useSpring } from 'framer-motion'
import { EASE_OUT } from '@/lib/motionEasing'
import { fitOrbit } from '@/lib/fitOrbit'
import { cursorStore, ensureCursorTracking } from '@/lib/cursorStore'
import { projectCardCorners } from '@/lib/cardGlowStore'
import { playgroundGlowStore } from '@/lib/playgroundGlowStore'
import { lockScroll } from '@/lib/scrollLock'
import { reportLoadProgress } from '@/lib/loadProgressStore'

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

function Media({ piece, visible = true, active = visible, load = active, detail = false, deferPoster = false, onRatio, onReady, onDecoded }: {
  piece: PlaygroundMediaItem; visible?: boolean; active?: boolean; load?: boolean; detail?: boolean; deferPoster?: boolean;
  onRatio: (src: string, ratio: number) => void; onReady?: () => void; onDecoded?: () => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (piece.type === 'video') initializeMediaClock(piece.playbackId ?? piece.src) }, [piece.type, piece.playbackId, piece.src])
  const controller = useRef<ReturnType<typeof registerMedia> | null>(null)
  // `load` (does this piece even get a src) and `active` (should it actually
  // play/cycle) are deliberately separate — mobile's scroll-focus gating only
  // pauses the non-focused cards, it must not un-load them back to nothing.
  // Without the split, a card that's never been the focused one would never
  // request its poster at all (the old single `active` flag latched both).
  const [requested, setRequested] = useState(load)
  useEffect(() => { if (load) setRequested(true) }, [load])
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
    // A poster is what shows BEFORE the first frame decodes — but during the
    // "Behold." warm-up nothing is on screen at all, and the card's own gate is
    // that very decode (onLoadedData below), so the poster is fetched, never
    // seen, and then superseded. On a phone that was several hundred KB of
    // pure waste sitting on a bandwidth-saturated critical path. It comes back
    // the moment warming ends, off the critical path, where it does its real
    // job for reloads and re-entry.
    ? <video ref={ref} src={src} data-playback-id={piece.playbackId ?? piece.src} poster={deferPoster ? undefined : piece.poster} muted loop playsInline preload={load ? 'auto' : 'none'} width={piece.width} height={piece.height} className={styles.media} style={style}
        onError={() => onReady?.()}
        onLoadedData={() => onDecoded?.()}
        onLoadedMetadata={e => { if (!piece.width) onRatio(piece.src, e.currentTarget.videoWidth / e.currentTarget.videoHeight) }}
        onPlaying={e => { const video = e.currentTarget; if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => onReady?.()); else onReady?.() }} />
    : <img src={src} srcSet={requested ? piece.srcSet : undefined} sizes={detail ? '(max-width: 768px) 80vw, 45vw' : '(max-width: 768px) 45vw, 25vw'} width={piece.width} height={piece.height} alt={piece.alt ?? ''} className={styles.media} style={style} draggable={false} onError={() => onReady?.()} onLoad={e => { if (!piece.width) onRatio(piece.src, e.currentTarget.naturalWidth / e.currentTarget.naturalHeight); void e.currentTarget.decode().catch(() => {}).then(() => onReady?.()) }} />
}

function Preview({ item, covered, onRatio, warming = false, mobile = false, onPrepared }: { item: PlaygroundItem; covered: boolean; warming?: boolean; mobile?: boolean; onPrepared?: () => void; onRatio: (src: string, ratio: number) => void }) {
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
  // Phones warm ONE piece per card instead of two. Measured on a 5Mbps/4x-CPU
  // phone profile, the network is saturated for essentially the entire gate
  // (12300ms of a 12307ms window), so the loading screen's length is just
  // bytes ÷ bandwidth — and second pieces were roughly half of them. A second
  // piece is not on screen when the loader lifts: the card shows piece 0 and
  // only cuts to piece 1 after previewDuration (750ms default), by which point
  // mobileWarmup has already prefetched it. If it somehow isn't ready the cycle
  // below simply holds on piece 0 until it is (see the `ready.current.has`
  // guard), so the failure mode is a slightly longer dwell, never a blank cut.
  // Desktop keeps both pieces — it is not bandwidth-bound and has no equivalent
  // post-reveal prefetch.
  const warmPieces = mobile && warming ? 1 : 2
  const markReady = (i: number) => {
    ready.current.add(i)
    if (indices.slice(0, warmPieces).every(index => ready.current.has(index))) onPrepared?.()
  }
  // `warming` force-loads the next piece on desktop only; on mobile that is
  // exactly the download being deferred, and leaving it in would keep the bytes
  // on the critical path while no longer gating on them — saving nothing.
  const preloadNext = prepare || (warming && !mobile)
  return <>{all.map((piece, i) => <Media key={piece.src} piece={piece} visible={i === indices[frame]}
    // Loaded regardless of `covered` — a "paused" (not focused, on mobile)
    // card must still show its resting frame, not a never-requested blank.
    // Only playback/cycling actually stops when covered (see `active`).
    load={i === indices[frame] || i === previous || (preloadNext && i === indices[(frame + 1) % indices.length])}
    active={!covered && (i === indices[frame] || i === previous || (preloadNext && i === indices[(frame + 1) % indices.length]))}
    deferPoster={mobile && warming}
    onDecoded={warming ? () => markReady(i) : undefined}
    onReady={() => markReady(i)} onRatio={onRatio} />)}</>
}

function Cover({ children, mobile, disabled, isFocused = false }: { children: React.ReactNode; mobile: boolean; disabled: boolean; isFocused?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const rx = useMotionValue(0), ry = useMotionValue(0)
  const x = useSpring(rx, { stiffness: 260, damping: 22 }), y = useSpring(ry, { stiffness: 260, damping: 22 })
  // Mirrors isFocused for the rAF loop below without restarting it on every
  // scroll-driven focus change (same pattern as MobilePage's card glows).
  const isFocusedRef = useRef(isFocused)
  useEffect(() => { isFocusedRef.current = isFocused }, [isFocused])
  useEffect(() => {
    if (disabled) return
    if (!mobile) ensureCursorTracking()
    let slot = -1, progress = 0, last = performance.now()
    const anchor = ref.current?.parentElement
    if (!anchor) return
    // Section entrances move ancestors without resizing the card itself.
    const measurement = observeLayout(anchor)
    const tick = (now: number) => {
      const el = ref.current, anchor = el?.parentElement
      if (el && anchor && measurement.rect) {
        const r = measurement.rect, cx = r.left+r.width/2, cy = r.top+r.height/2
        // No ambient cursor to look toward on mobile — the card stays flat;
        // only the glow ring below responds, driven by scroll focus instead.
        if (!mobile && cursorStore.hasMoved) {
          ry.set((cursorStore.x-cx)/(innerWidth/2)*1.15*16)
          rx.set(-(cursorStore.y-cy)/(innerHeight/2)*1.15*16)
        }
        const hovered = mobile ? isFocusedRef.current : (!disabled && (anchor.matches(':hover') || anchor.matches(':focus-visible')))
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
    // Not `body.style.overflow = 'hidden'` — on mobile the viewport is the
    // scroller, so that only makes body its own scroll box and the gallery
    // keeps scrolling behind this overlay. See lib/scrollLock.ts. (It's a
    // no-op on desktop, where html/body are pinned already.)
    const unlock = lockScroll()
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
    return () => { document.removeEventListener('keydown', key); unlock(); previous?.focus() }
  }, [close, navigate, visible])
  // Animated the same way MobileProjectDetail (MobilePage.tsx) opens/closes
  // — opacity+y, 0.3s, shared EASE_OUT — instead of the instant display:none
  // snap this used to be. Driven by `visible` (not mount/unmount) because a
  // game item (gameUrl set) stays permanently mounted once opened so its
  // iframe never reloads — `inert` keeps it out of the tab order/a11y tree
  // and pointerEvents:none keeps it non-interactive while hidden, without
  // needing to actually remove it from the DOM.
  return createPortal(<motion.div className={styles.dialog}
    initial={{ opacity: 0, y: 24 }}
    animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 24 }}
    transition={{ duration: 0.3, ease: EASE_OUT }}
    style={{ pointerEvents: visible ? 'auto' : 'none' }}
    inert={!visible}
    role="dialog" aria-modal="true" aria-label={item.title}>
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
  </motion.div>, document.body)
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
  // Drives the loading screen's fill sweep — 17 cards is the finest-grained signal
  // the gate has, so this is what keeps the bar moving continuously rather than
  // stepping between the two coarse 3D milestones. See lib/loadProgressStore.ts.
  useEffect(() => {
    if (warming) reportLoadProgress('playground', preparedCount / playgroundContent.length)
  }, [warming, preparedCount])
  useEffect(() => {
    if (!warming || !width || !height || preparedCount !== playgroundContent.length) return
    // Let the measured layout and decoded previews paint before releasing Behold.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => onPrepared?.()) })
    return () => cancelAnimationFrame(frame)
  }, [warming, width, height, preparedCount, onPrepared])

  // Mobile: only the card nearest the viewport center is "in motion" (its
  // multi-piece preview cycles, its video plays) and carries the highlight
  // ring — the pre-PlaygroundGallery mobile behavior (see the deleted
  // MobilePlaygroundItem), restored here rather than every card animating
  // at once. Desktop is untouched: every visible card always animates,
  // hover alone drives the glow.
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  useEffect(() => {
    if (!mobile || !active) return
    const pick = () => {
      const vpCenter = window.innerHeight / 2
      let best: number | null = null, bestDist = Infinity
      itemRefs.current.forEach((el, i) => {
        if (!el) return
        const r  = el.getBoundingClientRect()
        const d  = Math.abs(r.top + r.height / 2 - vpCenter)
        if (d < bestDist) { bestDist = d; best = i }
      })
      setFocusedIndex(best)
    }
    pick()
    window.addEventListener('scroll', pick, { passive: true })
    window.addEventListener('resize', pick)
    return () => {
      window.removeEventListener('scroll', pick)
      window.removeEventListener('resize', pick)
      // Fires when `active` goes false too (zone switched away) — without
      // this the last-focused card would keep animating/glowing forever
      // while the whole gallery sits hidden off-screen.
      setFocusedIndex(null)
    }
  }, [mobile, active])

  const [ratios, setRatios] = useState<Record<string, number>>({})
  const [open, setOpen] = useState<number | null>(null)
  // Every item ever opened stays mounted afterward (like the old game-only
  // `games` Set this replaces) — Collection now animates its own open/close
  // via the `visible` prop (see Collection above), and that only produces a
  // real fade-out if the element is still there to animate rather than being
  // torn out of the tree the instant `open` changes. Also lets Prev/Next
  // cross-fade between two already-mounted instances instead of a fresh
  // element replacing the old one.
  const [opened, setOpened] = useState<Set<number>>(new Set())
  useEffect(() => { if (open !== null) setOpened(old => old.has(open) ? old : new Set([...old, open])) }, [open])
  const onRatio = useCallback((src: string, ratio: number) => {
    if (!(ratio > 0)) return
    setRatios(previous => previous[src] === ratio ? previous : { ...previous, [src]: ratio })
  }, [])
  const close = useCallback(() => setOpen(null), [])
  // One fresh layout seed per mount: the orbit arrangement is scrambled (shape-
  // aware) on every visit, but stays put for the life of this view.
  const [seed] = useState(() => 1 + Math.floor(Math.random() * 2_000_000_000))
  // Reading/DOM order of the cards themselves — independent of the desktop
  // scatter (that's already randomized per mount via `seed`, but purely as
  // absolute-position `rects[i]`, so its underlying array order never
  // actually showed). This is what mobile's two-column list renders in, and
  // what Collection's prev/next arrows step through, so both stay in sync
  // with whatever order the user is actually looking at. Same "fresh per
  // mount, stays put for the life of this view" convention as `seed`.
  const [order] = useState<number[]>(() => {
    const indices = playgroundContent.map((_, i) => i)
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[indices[i], indices[j]] = [indices[j], indices[i]]
    }
    return indices
  })
  // Steps through `order` (the on-screen sequence), not raw content index —
  // otherwise Next/Previous would jump around relative to what's displayed.
  const navigate = useCallback((dir: number) => setOpen(i => {
    if (i === null) return null
    const pos = order.indexOf(i)
    return order[(pos + dir + order.length) % order.length]
  }), [order])
  // Mobile's two columns share one width, so each card's rendered height is
  // proportional to 1/aspectRatio (+ a rough constant for the caption line
  // and .card's own margin-bottom, which don't scale with aspect ratio).
  // Splitting `order` by position parity assumed a roughly even mix of
  // tall/wide cards landing in alternating slots — true for the old fixed
  // order, but a random run of several tall cards in a row (now possible)
  // stacks them all in the same column and leaves the other short.
  //
  // Deciding column membership by walking `order` greedily (drop each card
  // into whichever column is currently shorter, in shuffle order) still left
  // a visible gap fairly often: a couple of tall cards can land back-to-back
  // before the running totals correct for it. Deciding in tallest-first (LPT)
  // order instead keeps both columns close no matter what — the big pieces
  // get first pick of columns, and small ones settle the remainder. The
  // *visual* order within each column still follows the original shuffle
  // (filtering `order`, not the tallest-first list), so it doesn't read as
  // "sorted by size" top-to-bottom — only which side each card lands on.
  const [mobileCol1, mobileCol2] = useMemo(() => {
    const heights = order.map(i => 1 / (playgroundContent[i].aspectRatio ?? 1) + 0.15)
    const tallestFirst = order.map((i, pos) => pos).sort((a, b) => heights[b] - heights[a])
    let h1 = 0, h2 = 0
    const side = new Map<number, 1 | 2>()
    for (const pos of tallestFirst) {
      if (h1 <= h2) { side.set(order[pos], 1); h1 += heights[pos] }
      else { side.set(order[pos], 2); h2 += heights[pos] }
    }
    return [order.filter(i => side.get(i) === 1), order.filter(i => side.get(i) === 2)]
  }, [order])
  // Desktop only — a free scatter absolutely positioned via fitOrbit. Mobile
  // renders two plain CSS-flex columns instead (below): always exactly two,
  // always spanning the full width, each card sized by its own authored
  // aspectRatio — fitMasonry's "pick whatever column count maximizes area
  // under a height ceiling" search could land on 1, 3, or narrower-than-full-
  // width columns depending on content, which isn't what a fixed two-column
  // wall wants. This also drops the need to size the container in JS: two
  // flex columns are exactly as tall as their own content, same as
  // Projects/About, so the page just scrolls past them.
  const rects = useMemo(() => {
    const coverRatios = playgroundContent.map(item => item.aspectRatio ?? 1)
    return fitOrbit(coverRatios, width, height, false, seed)
  }, [width, height, seed])

  const renderCard = (item: PlaygroundItem, i: number) => {
    // Warming must still bring every card's own preview through its
    // decode/ready cycle (that's what releases Behold) — the focus gate
    // only applies once the gallery is actually being viewed.
    const isFocused = mobile && !warming && focusedIndex === i
    const covered    = !active || open !== null || (mobile && !warming && focusedIndex !== i)
    return (
      <button
        key={item.title}
        ref={el => { if (mobile) itemRefs.current[i] = el }}
        className={styles.card}
        style={mobile ? { aspectRatio: String(item.aspectRatio ?? 1) } : rects[i]}
        onClick={() => setOpen(i)}
        aria-label={`Open ${item.title}`}
      >
        <Cover mobile={mobile} disabled={!active || open !== null} isFocused={isFocused}><Preview item={item} covered={covered} warming={warming} mobile={mobile} onPrepared={() => prepareCard(i)} onRatio={onRatio} /></Cover>
        <span className={styles.caption}>{item.title}</span>
      </button>
    )
  }

  return <>
    {mobile ? (
      <div ref={ref} className={`${styles.gallery} ${styles.mobile}`} aria-label="Playground">
        <div className={styles.mobileCol}>{mobileCol1.map(i => renderCard(playgroundContent[i], i))}</div>
        <div className={styles.mobileCol}>{mobileCol2.map(i => renderCard(playgroundContent[i], i))}</div>
      </div>
    ) : (
      <div ref={ref} className={styles.gallery} aria-label="Playground">
        {order.map(i => renderCard(playgroundContent[i], i))}
      </div>
    )}
    {[...opened].map(index => <Collection key={index} visible={active && open === index} item={playgroundContent[index]} ratios={ratios} onRatio={onRatio} close={close} navigate={navigate} />)}
  </>
}
