// <Canvas> is its own independent React reconciler root, so a component
// mounted inside Scene.tsx's Canvas can't receive the onExpand callback as a
// normal prop from ContentPanel.tsx (which owns the detail-panel state) —
// same constraint that already forces zoneStore.snapToZone to exist as a
// plain-object bridge between Model.tsx and ZoneNav.tsx. This mirrors that
// exact pattern for click-to-expand.
export interface BigProjectExpandRect {
  top: number
  left: number
  width: number
  height: number
}

export const bigProjectExpandStore: {
  onExpand: ((index: number, rect: BigProjectExpandRect) => void) | null
} = {
  onExpand: null,
}
