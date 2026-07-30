import type { Zone } from '@/types'

// Single shared source of truth for the sequential zone-transition state
// machine that drives every section's enter/exit — written once per frame by
// ContentPanel.tsx (which already runs a persistent rAF loop regardless of
// content mode) and read by anything else that needs to animate in lockstep
// with "whichever zone is currently displayed," e.g. ProjectCards3D.tsx's 3D
// cards. Before this, the cards ran their own independent fade timer that
// merely happened to use the same duration/easing shape as the DOM panes —
// which looked fine in isolation but drifted out of sync in practice (the
// DOM panes sequence exit-then-enter across zones, while the cards' own
// timer didn't know about that sequencing at all), reported as "the projects
// transition is so much faster than the others." Reading the exact same
// number every frame, instead of two independently-computed-but-similar
// numbers, is what actually guarantees they move together.
export const zoneTransitionStore: {
  displayedZone: Zone | null
  blend: number // 0..1 fade/scale progress for displayedZone
} = {
  displayedZone: null,
  blend: 0,
}