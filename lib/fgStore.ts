// Current foreground (text/ink) color, resolved by BackgroundSync — the fg
// counterpart to bgStore. Lets non-React per-frame code (MobilePage's nav
// label color) read the live palette-driven fg color instead of re-deriving
// a synthetic grayscale from luminance, which breaks once fg can be any hue.
export const fgStore = {
  r: 0.05, g: 0.05, b: 0.05,
}
