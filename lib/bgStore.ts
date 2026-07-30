// Current background color, lerped/resolved by BackgroundSync and read by
// PostProcessing. This is the single source of truth for "what color is the
// background right now" (natural white/black lerp, OR the debug menu's
// override) — both scene.background (the actual rendered pixels) and the
// shader's uBgColor uniform read from here, so they never disagree about
// what counts as "background" in the dither threshold math.
// Plain object — no React re-renders.
export const bgStore = {
  luminance: 1.0, // perceptual luminance of r/g/b below — 1 = white, 0 = black
  r: 1, g: 1, b: 1,
}
