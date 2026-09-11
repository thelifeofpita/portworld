// The REAL on-screen footprint of each active "big" in-scene project model —
// published every frame regardless of hover (unlike bigProjectGlowStore,
// which only carries an entry while hovered). PostProcessing.tsx reads this
// to know where each model's real beauty-pass render actually sits on
// screen, so it can show these models' true rendered color/texture there
// instead of the sitewide monochrome ink dithering every other pixel gets —
// these are meant to read as photographic "hero" pieces, not part of the
// humanoid nav model's abstract dot aesthetic.
//
// A circle (screenCx/screenCy/radius), not a box — these models are
// positioned via a world-space bounding-SPHERE fit (see InSceneProjectModel),
// which projects to a circle on screen, not a rectangle matching the DOM
// slot's (possibly very different) aspect ratio. Using the true projected
// radius, rather than the nominal slot rect, is also what fixes a model's
// hover-glow from bleeding onto a different, nearby model — see
// bigProjectGlowStore.ts.
export interface BigProjectFootprint {
  screenCx: number
  screenCy: number
  radius: number
}

export const bigProjectFootprintStore: { entries: Record<number, BigProjectFootprint | null> } = {
  entries: {},
}
