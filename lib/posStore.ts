// Screen-space (CSS px) positions of the three accent mesh centers.
// Written every frame by Model.tsx, read every frame by ZoneNav.tsx.
export const posStore: Record<0 | 1 | 2, { x: number; y: number }> = {
  0: { x: 0, y: 0 }, // leftHand  → Projects
  1: { x: 0, y: 0 }, // rightFoot → About Me
  2: { x: 0, y: 0 }, // head      → Playground
}
