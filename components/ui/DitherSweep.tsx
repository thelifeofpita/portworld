'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { BAYER, CELL_PX, GRID } from './DitherReveal'

// One-shot colour change for Previous/Next between case pages. A flat sheet in
// the outgoing project's colour covers the incoming page, then dissolves in the
// same 4×4 Bayer order and 2px grain DitherReveal uses for content — except each
// cell's turn is also set by where it sits across the screen, so the dissolve
// travels as a front in the direction of navigation instead of happening
// everywhere at once. Next clears right-to-left (the new page arrives from the
// right, where the Next button is); Previous mirrors it.
//
// Canvas rather than DitherReveal's SVG <mask>: a repeating 8px <pattern> can't
// give its cells different timings across the viewport, and ImageData paints the
// same pixels in Chrome and WebKit (where the CSS-mask route silently failed).
// One canvas pixel is one 2px cell, upscaled with image-rendering: pixelated.

const DURATION_MS = 450
// Width of the dissolving front, as a fraction of the screen. 0 would be a hard
// edge wiping across; 1 would dissolve the whole screen at once.
const BAND = 0.4

// One Previous/Next step as the project views track it: where it came from
// (whose colour to dissolve), which way it went, and a counter so every step
// remounts the sweep — even bouncing back and forth between the same two pages.
export interface PageStep {
  from: number
  dir:  1 | -1
  seq:  number
}

interface DitherSweepProps {
  // Any colour a canvas can parse — the project page colours are plain hex.
  color:   string
  dir:     1 | -1
  zIndex?: number
}

export default function DitherSweep({ color, dir, zIndex = 10 }: DitherSweepProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Lazy initializer, not an effect, so a reduced-motion visitor never mounts
  // the canvas at all and just gets the instant swap.
  const [done, setDone] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  // Layout effect so the first, fully covering frame is painted before the
  // browser ever shows the incoming page underneath it.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const w = Math.ceil(window.innerWidth / CELL_PX)
    const h = Math.ceil(window.innerHeight / CELL_PX)
    canvas.width = w
    canvas.height = h
    // Exact integer upscale, rather than stretching to 100% of a viewport that
    // isn't a multiple of CELL_PX.
    canvas.style.width = `${w * CELL_PX}px`
    canvas.style.height = `${h * CELL_PX}px`

    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    const image = ctx.getImageData(0, 0, w, h)
    const alpha = image.data

    // When the front reaches each column, from 0 (the leading edge) to 1 - BAND
    // (the trailing edge), so the last column still gets a full BAND to clear.
    const arrival = new Float32Array(w)
    const span = Math.max(1, w - 1)
    for (let x = 0; x < w; x++) {
      const along = dir > 0 ? 1 - x / span : x / span
      arrival[x] = along * (1 - BAND)
    }

    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / DURATION_MS)
      const p = 1 - Math.pow(1 - t, 3) // cubic ease-out
      for (let y = 0; y < h; y++) {
        const row = (y % GRID) * GRID
        const offset = y * w
        for (let x = 0; x < w; x++) {
          // Past its column's arrival, a cell clears once the local progress
          // through the band beats its Bayer rank — the same ordered pattern
          // DitherReveal steps through in time.
          if ((p - arrival[x]) / BAND > (BAYER[row + (x % GRID)] + 0.5) / 16) {
            alpha[(offset + x) * 4 + 3] = 0
          }
        }
      }
      ctx.putImageData(image, 0, 0)
      if (t < 1) frame = requestAnimationFrame(tick)
      else setDone(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [color, dir])

  if (done) return null
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', imageRendering: 'pixelated', zIndex }}
    />
  )
}
