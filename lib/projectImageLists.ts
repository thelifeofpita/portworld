// Plain static image lists for the three custom-layout projects that don't
// have every image manifest-backed (SurfTheSpike.tsx, PickASide.tsx,
// BackInSmoothly.tsx each also define their own local, richer versions of
// these — PHOTOS/MOCKS with alt text/positioning — for actually rendering
// the page). This file exists ONLY so lib/mobileWarmup.ts can prefetch the
// sources without importing those component files: each is a 'use client'
// page component pulling in DitherReveal, its own CSS module, etc., so a
// static import purely to read one small array would drag all of that into
// whatever imports mobileWarmup.ts — in particular MobilePage.tsx's already
// performance-sensitive mobile bundle. Keep in sync with the src values in
// SurfTheSpike.tsx's PHOTOS, PickASide.tsx's MOCKS, and BackInSmoothly.tsx's
// inline <img> sources if those ever change.
export const SURF_THE_SPIKE_IMAGES = [
  '/projects/proj1/shop1.webp',
  '/projects/proj1/shop2.webp',
  '/projects/proj1/vend1.webp',
  '/projects/proj1/vend2.webp',
  '/projects/proj1/scan.webp',
  // Mobile swaps the 3-up composite for these three stacked crops.
  '/projects/proj1/scan1.webp',
  '/projects/proj1/scan2.webp',
  '/projects/proj1/scan3.webp',
  '/projects/proj1/ui-poster.webp',
]

// Posters, not the loops themselves. The four mockups are mp4 now (see
// PickASide.tsx), and priming a video with new Image() does nothing — the
// poster is what actually shows before playback starts.
export const PICK_A_SIDE_IMAGES = [
  '/projects/proj6/order-poster.jpg',
  '/projects/proj6/checkout-poster.jpg',
  '/projects/proj6/reminder-poster.jpg',
  '/projects/proj6/app-poster.jpg',
]

export const BACK_IN_SMOOTHLY_IMAGES = [
  '/projects/proj5/gif1-poster.webp',
  '/projects/proj5/gif2-poster.webp',
  '/projects/proj5/sticker1.webp',
  '/projects/proj5/sticker2.webp',
  '/projects/proj5/sticker3.webp',
]
