'use client'

import { useEffect, useRef, useCallback, useReducer } from 'react'
import { paletteStore, subscribePreview, rerollPalette } from '@/lib/paletteStore'
import { zoneStore } from '@/lib/zoneStore'
import { debugStore, subscribeDebug } from '@/lib/debugStore'
import styles from './Byline.module.css'

const PLAIN  = 'THELIFEOF'
const ACCENT = 'PITA'
const TOTAL  = PLAIN.length + ACCENT.length

// Each letter renders as its own inline-block (.letterWrap) so the hover
// color-cycle can animate them independently — but that breaks the font's
// own kerning pairs (kerning only applies within a single shaped text run),
// leaving some pairs visibly loose compared to how they'd set in normal
// text. debugStore.bylineKerning holds one manual margin-right nudge per
// gap between adjacent letters (12 gaps for 13 letters), live-editable from
// the debug menu's "Byline kerning" section so this can be tuned by hand
// with immediate visual feedback instead of guessed at blind.
// Must match Byline.module.css's letterColorCycle duration.
const CYCLE  = 0.5
const STEP   = CYCLE / 4

export default function Byline({ isContentMode = false }: { isContentMode?: boolean }) {
  const rootRef     = useRef<HTMLDivElement>(null)
  const rollTimers  = useRef<number[]>([])
  const [, forceRender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribeDebug(forceRender), [])

  // Paint the upcoming palette's 4 colors onto the hover letter-cycle
  // animation (see Byline.module.css's --pc0.. vars) whenever a fresh
  // preview becomes available — paletteStore always keeps one prefetched,
  // refreshed right after every load/reroll, so hovering previews the exact
  // colors a click would apply next, not stale ones from the current theme.
  // Rolled in one slot at a time (--pc0, then --pc1 a STEP later, ...)
  // instead of all four at once: an instant swap recolors all 13 letters —
  // each sitting at a different phase of the loop — in the same video
  // frame, which reads as a stutter breaking the chase. Spacing the 4
  // updates a STEP apart keeps the rollout itself moving at the same pace
  // as the chase already playing, instead of fighting it.
  const rollInPreview = useCallback(() => {
    const p = paletteStore.preview
    const root = rootRef.current
    if (!p || !root) return
    rollTimers.current.forEach(clearTimeout)
    rollTimers.current = []
    const slots: Array<[string, string]> = [
      ['--pc0', p.white], ['--pc1', p.yellow], ['--pc2', p.red], ['--pc3', p.black],
    ]
    slots.forEach(([name, value], i) => {
      rollTimers.current.push(
        window.setTimeout(() => root.style.setProperty(name, value), i * STEP * 1000)
      )
    })
  }, [])

  useEffect(() => {
    rollInPreview()
    return subscribePreview(rollInPreview)
  }, [rollInPreview])

  useEffect(() => () => { rollTimers.current.forEach(clearTimeout) }, [])

  // The color-cycle preview/reroll is a landing-page-only affordance: away
  // from the landing view the byline is just a way home, so a click only
  // resets and leaves the theme alone (matching the hover cycle, which is
  // suppressed via .inert below).
  const handleClick = useCallback(() => {
    zoneStore.resetToLanding?.()
    if (!isContentMode) rerollPalette()
  }, [isContentMode])

  // Negative animation-delay per letter, offset by one quarter-step (of the
  // animation's 4 color stops) per letter — NOT spread evenly across all 13
  // letters, which would give each color stop enough letters to span (13/4 ≈
  // 3) and read as blocks/groups moving together rather than a true
  // letter-by-letter chase. Stepping mod 4 instead guarantees every letter
  // differs from its immediate neighbor. Indexing by distance from the END
  // (not the letter's own index) makes the chase travel right-to-left.
  const delayFor = (i: number) => `${-((TOTAL - 1 - i) % 4) * STEP}s`

  // Gap index g = the space between global letter g and g+1 across the
  // WHOLE "THELIFEOFPITA" sequence (PLAIN then ACCENT) — applied as
  // margin-right on letter g so it pulls letter g+1 in. The very last
  // letter (final A) has no gap after it, so it gets no adjustment.
  const kernAfter = (globalIndex: number): React.CSSProperties | undefined => {
    if (globalIndex >= TOTAL - 1) return undefined
    const gap = debugStore.bylineKerning[globalIndex]
    return gap ? { marginRight: `${gap}em` } : undefined
  }

  return (
    <div
      ref={rootRef}
      className={`${styles.byline}${isContentMode ? ` ${styles.inert}` : ''}`}
      onClick={handleClick}
      aria-label={isContentMode ? 'THELIFEOFPITA — click to return to the landing view' : 'THELIFEOFPITA — click to change theme colors'}
    >
      <span className={styles.bylineText} aria-hidden="true">
        {PLAIN.split('').map((ch, i) => (
          <span key={`p${i}`} className={styles.letterWrap} style={kernAfter(i)}>
            <span className={styles.letterBase}>{ch}</span>
            <span className={styles.letterCycle} style={{ animationDelay: delayFor(i) }}>{ch}</span>
          </span>
        ))}
        <span className={styles.bylinePita}>
          {ACCENT.split('').map((ch, i) => (
            <span key={`a${i}`} className={styles.letterWrap} style={kernAfter(PLAIN.length + i)}>
              <span className={styles.letterBase}>{ch}</span>
              <span className={styles.letterCycle} style={{ animationDelay: delayFor(PLAIN.length + i) }}>{ch}</span>
            </span>
          ))}
        </span>
      </span>
    </div>
  )
}
