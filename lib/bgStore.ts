// Current background luminance, lerped by BackgroundSync and read by PostProcessing.
// Plain object — no React re-renders.
export const bgStore = {
  luminance: 1.0, // 1 = white, 0 = black
}
