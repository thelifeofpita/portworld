// Cross-boundary bridge for a "big" in-scene project model (see
// InSceneProjectModel.tsx) — ContentPanel.tsx still owns the DOM layout
// (an invisible spacer element sized/positioned exactly like the old visible
// version was), and publishes its live rect + the same cursor-tilt spring
// values every other card uses, so the 3D component just reads CSS pixels
// each frame rather than reimplementing the CSS layout formulas in JS.
export interface BigProjectSlot {
  top: number
  left: number
  width: number
  height: number
  tiltXDeg: number
  tiltYDeg: number
  // Screen-plane roll (rotation around the view axis, applied AFTER outer's
  // lookAt) — optional, desktop never sets it. tiltYDeg turns the model to
  // face a different direction in 3D (foreshortening only, easy to read as
  // "not actually rotated" on a small/flat object); this is what actually
  // reads as a tilted puzzle piece on screen, the same way rotating a flat
  // photo does. See MobilePage.tsx's MOBILE_PROJECT_LAYOUT.
  rollDeg?: number
}

export const bigProjectSlotStore: Record<number, BigProjectSlot | null> = {}
