'use client'

import { useEffect, useLayoutEffect, useRef, useState, useId } from 'react'
import styles from './DitherReveal.module.css'

// Reveals its children by punching an ordered-dither hole pattern through an
// opaque overlay sitting on top — NOT by masking the children themselves.
// An earlier version applied the mask directly to the content (the video/
// iframe/image), which forces the browser onto a per-frame software
// recomposite path for that masked element (very expensive for a playing
// <video> or a cross-origin <iframe>, since the browser must re-rasterize
// the decoded frame against a changing mask every single frame) — that's
// what caused the severe slowdown/frame-dropping reported live, which in
// turn made the staggered reveal look like an instant one-frame pop instead
// of a dissolve. Masking a plain solid-color overlay div instead is cheap
// regardless of what's underneath, because the video/iframe/image never
// enters the masked/re-rasterized path at all — it just sits there,
// normally composited, the whole time.
//
// The overlay starts fully opaque (solid `overlayColor`, hiding the content)
// and the mask's cells punch through in ordered-dither (bayer) sequence,
// revealing the real content underneath. Always the same bayer-square
// dithering regardless of the 3D model's currently-active shader — the
// ascii/halftone variants read as visually broken on real page content and
// were dropped entirely rather than picked per shader mode.
const GRID = 4
const BAYER = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
]
const STEP_MS = 22 // delay between adjacent bayer steps
const CELL_PX = 2 // fine dithering-grain cell size
const CELL_DURATION_MS = 160
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)' // quintic ease-out

const MAX_DELAY_MS = Math.max(...BAYER) * STEP_MS

interface DitherRevealProps {
  className?: string
  // Solid color painted over the content until it's revealed — must match
  // whatever's actually behind this block (this page's own forced brand
  // yellow), since unlike a real mask this never samples the page itself.
  overlayColor: string
  children: React.ReactNode
}

export default function DitherReveal({ className, overlayColor, children }: DitherRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  // Lazy initializer (not an effect) so a reduced-motion visitor skips
  // straight to 'revealed' without ever mounting the IntersectionObserver.
  const [phase, setPhase] = useState<'hidden' | 'revealing' | 'revealed'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'revealed' : 'hidden'
  )
  // The mask's own covering rect can't use width="100%" height="100%" —
  // percentage units inside an SVG <mask> referenced via CSS mask-image from
  // a plain HTML element don't reliably resolve in this rendering pipeline;
  // verified in isolation: with percentages the mask rect paints as zero
  // size, i.e. the mask is empty (fully transparent) everywhere, so the
  // overlay never appears at all and the content just shows immediately —
  // exactly the "I don't get to see the dither appear" report, not a timing
  // issue. Explicit pixel dimensions render correctly, so the real size is
  // tracked via ResizeObserver instead.
  //
  // A one-shot getBoundingClientRect() in a layout effect isn't enough on
  // its own: the sticker row's <img> children have no aspect-ratio (unlike
  // gifRow's video/phoneBox, which do), so their height is unknown until
  // the browser actually decodes each image — which happens asynchronously,
  // after this component's mount-time layout effect has already run and
  // measured a height of 0. That 0 then got baked into the mask forever,
  // so the mask was empty and the overlay never appeared over those three
  // images specifically — confirmed directly: the stickerRow's mask <rect>
  // had height="0" while every sibling block's mask had its real height.
  // ResizeObserver re-measures whenever the element's real box actually
  // changes (including once each image's decode resolves its layout size),
  // so this self-corrects instead of trusting a single early snapshot.
  const [size, setSize] = useState({ width: 0, height: 0 })
  const maskId = useId()
  const patternId = useId()

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })

    const ro = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0]
      if (box) setSize({ width: box.inlineSize, height: box.blockSize })
      else setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (phase !== 'hidden') return

    const el = ref.current
    if (!el) return

    // This page scrolls inside ContentPanel's own overflow-y:auto div, not
    // the window, so root must be that real scrolling ancestor — leaving it
    // at IntersectionObserver's default (the top-level viewport) means any
    // rootMargin below would silently expand the WRONG boundary while the
    // inner container's own edge, unaffected by that margin, keeps clipping
    // as normal.
    let root: Element | null = null
    let ancestor = el.parentElement
    while (ancestor) {
      const style = getComputedStyle(ancestor)
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') { root = ancestor; break }
      ancestor = ancestor.parentElement
    }

    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      io.disconnect()
      // One tick so the overlay's cells paint in their hidden state first —
      // otherwise the .go class lands in the same frame and the transition
      // has nothing to transition from.
      requestAnimationFrame(() => setPhase('revealing'))
    }, {
      root,
      // No lookahead margin here on purpose — an earlier version fired this
      // ~140-260px before the block was actually visible, meaning to give
      // the reveal a head start. But the removal timer below runs on a
      // fixed wall-clock schedule from the moment THIS fires, with no idea
      // whether the block has actually scrolled into view yet — at a normal
      // (not fast) scroll pace, or if the user pauses, the whole reveal can
      // finish while the block is still off-screen, so by the time it's
      // actually looked at the overlay is already gone and nothing was ever
      // seen. Confirmed directly: froze the cells mid-transition and found
      // the overlay had already been removed while the block was still
      // below the viewport. Triggering only once genuinely visible (any
      // pixel, threshold 0) guarantees the entire timed reveal runs while
      // it's actually on screen.
      threshold: 0,
    })

    io.observe(el)
    return () => io.disconnect()
  }, [phase])

  useEffect(() => {
    if (phase !== 'revealing') return
    const totalMs = MAX_DELAY_MS + CELL_DURATION_MS + 60
    const t = setTimeout(() => setPhase('revealed'), totalMs)
    return () => clearTimeout(t)
  }, [phase])

  const tilePx = CELL_PX * GRID

  // Duration/easing driven from the same constants used for the totalMs
  // timeout above, rather than a separately-authored CSS transition — an
  // earlier version kept these in two places (a JS duration record and a
  // hardcoded CSS transition) and they drifted out of sync.
  const cells = BAYER.map((order, i) => {
    const col = i % GRID
    const row = Math.floor(i / GRID)
    const x = col * CELL_PX
    const y = row * CELL_PX
    // Each cell is a HOLE that fades in — drawn in black over the pattern's
    // white base (see below), so as it appears it punches that much more
    // transparency into the overlay.
    return (
      <rect
        key={i}
        x={x}
        y={y}
        width={CELL_PX}
        height={CELL_PX}
        className={styles.cellRect}
        style={{ transition: `opacity ${CELL_DURATION_MS}ms ${EASE} ${order * STEP_MS}ms` }}
      />
    )
  })

  return (
    <div ref={ref} className={className} style={{ position: 'relative' }}>
      {children}
      {phase !== 'revealed' && (
        <>
          <div
            className={styles.overlay}
            style={{
              backgroundColor: overlayColor,
              WebkitMaskImage: `url(#${maskId})`,
              maskImage: `url(#${maskId})`,
            }}
          />
          <svg className={styles.defs} aria-hidden="true">
            <defs>
              <pattern id={patternId} patternUnits="userSpaceOnUse" width={tilePx} height={tilePx}>
                <rect x="0" y="0" width={tilePx} height={tilePx} fill="#fff" />
                <g className={phase === 'revealing' ? styles.go : undefined}>
                  {cells}
                </g>
              </pattern>
              <mask id={maskId}>
                <rect x="0" y="0" width={size.width} height={size.height} fill={`url(#${patternId})`} />
              </mask>
            </defs>
          </svg>
        </>
      )}
    </div>
  )
}
