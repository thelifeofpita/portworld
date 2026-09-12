'use client'

// Freezes the page behind a full-screen overlay, and puts the reader back
// exactly where they were when it closes.
//
// `document.body.style.overflow = 'hidden'` is NOT enough and is the thing this
// replaces. On mobile the VIEWPORT is the scroller (see the @media block in
// globals.css), so making <body> overflow-hidden only turns body into its own
// scroll box — the document behind keeps scrolling, and you come back to the
// grid somewhere other than where you left it. Pinning body with its scroll
// offset baked into `top` is the one form that actually holds, on iOS Safari as
// well as Chrome Android.
//
// Returns the unlock function. Safe to call when there is nothing to lock
// (desktop pins html/body outright, so the document never scrolls there) — it
// detects that and does nothing rather than pinning a body that isn't moving.
export function lockScroll(): () => void {
  if (typeof document === 'undefined') return () => {}

  const body = document.body
  const scrollable = document.documentElement.scrollHeight > window.innerHeight
  if (!scrollable) return () => {}

  const scrollY = window.scrollY
  const prev = {
    position: body.style.position,
    top:      body.style.top,
    width:    body.style.width,
    overflow: body.style.overflow,
  }

  body.style.position = 'fixed'
  body.style.top      = `-${scrollY}px`
  body.style.width    = '100%'
  body.style.overflow = 'hidden'

  return () => {
    body.style.position = prev.position
    body.style.top      = prev.top
    body.style.width    = prev.width
    body.style.overflow = prev.overflow
    // Restoring the styles alone drops the page back to offset 0.
    window.scrollTo(0, scrollY)
  }
}
