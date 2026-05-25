// Projected vertex sample points — written every frame by Model.tsx.
// ZoneNav reads these to compute the exact silhouette boundary in any direction
// via the convex-hull support function.
const MAX_PTS = 2048 // enough for dense vertex sampling across all meshes

export const silhouetteStore = {
  cx: 0, cy: 0,                          // model screen center (CSS px)
  pts: new Float32Array(MAX_PTS * 2),    // [x0,y0, x1,y1, ...] CSS px
  count: 0,
}
