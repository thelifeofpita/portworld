import type { Point } from './cardGlowStore'

// Hover-only glow for Playground cards AND the About Me photo — unlike
// cardGlowStore.ts (Projects, always-on per project's own brand color, one
// fixed slot per project), these have no per-item brand color and Playground
// can have far more items than fit in a handful of uniform slots (see
// playgroundContent.ts — "the layout auto-adjusts to the count"). So instead
// of one slot per item, this is a small dynamic POOL: only a card that's
// actually hovered/fading claims a slot (see ContentPanel.tsx's
// PlaygroundCard and AboutPane), and releases it once fully faded out.
// Shared safely between About (zone 1) and Playground (zone 2) since
// ContentPanel never displays both at once — see PostProcessing.tsx's
// uPgGlowOpacity gating. MAX_POOL only needs to cover how many cards can be
// simultaneously mid-transition — realistically 1 (hovered) plus maybe 1
// more (previous card still fading out as the pointer moves to a new one) —
// sized with headroom above that.
export interface PlaygroundGlowEntry {
  corners: [Point, Point, Point, Point]
  opacity: number // 0..1 smoothed hover progress — also the glow's own density multiplier
}

export const MAX_PLAYGROUND_GLOW = 4

export const playgroundGlowStore: { entries: (PlaygroundGlowEntry | null)[] } = {
  entries: new Array(MAX_PLAYGROUND_GLOW).fill(null),
}
