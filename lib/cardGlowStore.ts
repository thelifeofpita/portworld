// Publishes each visible project card's live screen-space QUAD (its 4 corners,
// after the card's own rotateX/rotateY tilt — not the axis-aligned bounding
// box, which is visibly larger than the tilted card once rotated) + a color,
// so PostProcessing.tsx's outer-glow pass (inside the R3F Canvas) can render a
// dithered halo that hugs the actual tilted shape. ContentPanel.tsx writes an
// entry per card every frame via rAF; PostProcessing reads the whole array
// once per render. Same cross-boundary plain-store pattern as bgStore/fgStore.
export interface Point { x: number; y: number }

export interface CardGlowEntry {
  // Corners in viewport CSS px (DOM top-left origin), winding order
  // top-left, top-right, bottom-right, bottom-left — must stay consistent
  // for PostProcessing's inside/outside winding test.
  corners: [Point, Point, Point, Point]
  color:      string // rest-state color (the project's own accent/brand color)
  hoverColor: string // color the glow wipes toward on hover (site's shared focus/accent color)
  // 0..1, smoothed by ProjectCard's own rAF loop (not an instant hover flag) —
  // PostProcessing uses it to grow a radial wipe outward from the card's
  // center through the glow ring, from `color` to `hoverColor`.
  hoverProgress: number
}

export const cardGlowStore: { entries: (CardGlowEntry | null)[] } = {
  entries: new Array(6).fill(null),
}

const DEG2RAD = Math.PI / 180

// Replicates the browser's own `transform: perspective(d) rotateX(rx) rotateY(ry)`
// (framer-motion's default transform-function order — rotateX before rotateY,
// see the useCardTilt/followCursor comment in ContentPanel.tsx) applied to a
// flat w×h rectangle centered on (cx, cy), so the resulting 4 points are the
// same tilted quad the browser actually renders — not an approximation.
// CSS applies the rightmost transform function to the point first, so rotateY
// happens first here, then rotateX, then the perspective divide — matching
// `perspective(d) rotateX(rx) rotateY(ry)` composed left-to-right into one
// matrix and applied as (P·Rx·Ry)·point.
export function projectCardCorners(
  rxDeg: number, ryDeg: number, w: number, h: number, perspective: number, cx: number, cy: number,
): [Point, Point, Point, Point] {
  const rx = rxDeg * DEG2RAD
  const ry = ryDeg * DEG2RAD
  const cosY = Math.cos(ry), sinY = Math.sin(ry)
  const cosX = Math.cos(rx), sinX = Math.sin(rx)
  const halfW = w / 2, halfH = h / 2

  const local: [number, number][] = [
    [-halfW, -halfH], // top-left
    [ halfW, -halfH], // top-right
    [ halfW,  halfH], // bottom-right
    [-halfW,  halfH], // bottom-left
  ]

  return local.map(([X, Y]) => {
    // rotateY(ry) around the Y axis (Z=0 before rotation)
    const x1 = X * cosY
    const z1 = -X * sinY
    // rotateX(rx) applied to the already-Y-rotated point
    const y2 = Y * cosX - z1 * sinX
    const z2 = Y * sinX + z1 * cosX
    // perspective(d) divide — guard against z passing the camera plane,
    // which never happens at this app's clamped tilt angles but would
    // otherwise blow up/flip the projection.
    const w2 = Math.max(0.001, 1 - z2 / perspective)
    return { x: cx + x1 / w2, y: cy + y2 / w2 }
  }) as [Point, Point, Point, Point]
}
