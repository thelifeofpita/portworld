'use client'

import { useEffect, useState } from 'react'

// Plain width (first clause) is kept exactly as it always was — narrowing a
// desktop browser window still flips to the mobile layout regardless of
// pointer type, which is relied on for quickly previewing mobile by hand.
// The second clause only RESCUES a case the first one gets wrong: a large
// phone rotated to landscape (e.g. a Pro-Max-class device's landscape width
// ~930px exceeds 768, which used to flip a real touchscreen phone into the
// desktop mouse-hover/drag path the instant it rotated sideways). Gating
// that clause on `pointer: coarse` (the PRIMARY input's precision, per spec)
// means it only fires for genuine touch-primary devices — a touchscreen
// laptop window happening to be short stays `pointer: fine` (mouse is
// primary) and is unaffected.
const MOBILE_QUERY =
  '(max-width: 768px), (max-height: 768px) and (pointer: coarse)'

export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}
