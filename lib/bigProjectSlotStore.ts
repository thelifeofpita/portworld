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
}

export const bigProjectSlotStore: Record<number, BigProjectSlot | null> = {}
