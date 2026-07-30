// Live viewport cursor position (CSS px), tracked by a single global listener
// shared by every card that wants the "eyes follow you" ambient tilt (see
// useCardTilt's followCursor option in ContentPanel.tsx) — one listener
// instead of one per card. hasMoved gates consumers so cards sit neutral
// until the user's first real mouse movement, rather than all snapping
// toward the (0,0) default the instant they mount.
export const cursorStore = { x: 0, y: 0, hasMoved: false }

let attached = false

export function ensureCursorTracking() {
  if (attached || typeof window === 'undefined') return
  attached = true
  window.addEventListener('mousemove', (e) => {
    cursorStore.x = e.clientX
    cursorStore.y = e.clientY
    cursorStore.hasMoved = true
  }, { passive: true })
}
