// Hover-only silhouette glow for in-scene "big" project models — mirrors
// playgroundGlowStore's shape (opacity-only, single shared accent color, no
// rest-state, no color-wipe), not cardGlowStore's (which turned out to be
// dead code — nothing writes to it; every real card glow on this site goes
// through the playgroundGlowStore-style pipeline). PostProcessing.tsx reads
// this every frame and computes a true per-pixel silhouette distance for
// each active entry (see bigModelSilhouetteDist in that file), unlike the
// flat cards' analytic quad-corner distance — this is a real irregular 3D
// shape, not a rectangle.
//
// `radius` (not halfW/halfH) — see bigProjectFootprintStore.ts for why a
// circle, not the DOM slot's own box, is the model's real footprint. Using
// the accurate radius here (rather than the slot's half-width/height) is
// also what keeps the ring-search in bigModelSilhouetteDist from wandering
// into a DIFFERENT, nearby model's own silhouette and bleeding the glow onto
// it — a real bug this used to have when two big-model cards sat close
// together (reported: "the dithered silhouette leaks into the other model").
export interface BigProjectGlowEntry {
  screenCx: number
  screenCy: number
  radius: number
  opacity: number // 0..1, smoothed hover progress
}

export const bigProjectGlowStore: { activeIndex: number | null; entries: Record<number, BigProjectGlowEntry | null> } = {
  activeIndex: null,
  entries: {},
}
