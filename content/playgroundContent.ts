// ─── Playground content ───────────────────────────────────────────────────────
//
// Each entry is one card in the Playground section.
// Add or remove entries here — the layout auto-adjusts to the count.
//
// Fields:
//   title   – label shown below the card
//   mp4     – path to your video in /public  (e.g. '/playground/work-1.mp4')
//   webm    – optional WebM version (smaller on Chrome/Firefox, recommended)
//   poster  – optional still thumbnail shown before hover
//             If omitted the browser uses the first video frame automatically.
//
// How to add a piece:
//   1. Drop your file(s) into  public/playground/
//   2. Add an entry below pointing to them  ('/playground/yourfile.mp4')
//   3. Save — the card appears on next page load
//
// Supported workflow:
//   – Export an MP4 (H.264, ≤ 1080p) from any tool
//   – Optionally also export a WebM (VP9) for better compression on modern browsers
//   – If you want a custom still, export one frame as a JPEG/PNG and set `poster`
//
// Example:
//   { title: 'Fluid loop',  mp4: '/playground/fluid.mp4', webm: '/playground/fluid.webm', poster: '/playground/fluid.jpg' },

export interface PlaygroundMediaItem {
  src: string
  previewSrc?: string
  detailSrc?: string
  srcSet?: string
  width?: number
  height?: number
  duration?: number
  playbackId?: string
  type?: 'image' | 'video'
  poster?: string
  alt?: string
  /** Optional display-only crop; source images remain untouched. */
  crop?: { aspectRatio: number; position: string }
}

export interface PlaygroundItem {
  title: string
  mp4?: string
  webm?: string
  poster?: string
  aspectRatio?: number
  media?: PlaygroundMediaItem[]
  previewDuration?: number
  previewIndices?: number[]
  externalUrl?: string
  gameUrl?: string
}

const image = (src: string): PlaygroundMediaItem => ({ src, type: 'image' })
const video = (src: string, poster: string): PlaygroundMediaItem => ({ src, type: 'video', poster })

export const playgroundContent: PlaygroundItem[] = [
  { aspectRatio: 1.788, title: 'L(P)OOP', externalUrl: 'https://thelifeofpita.itch.io/lpoop', gameUrl: 'https://itch.io/embed-upload/14519487?color=101010', media: [1, 2, 3, 4].map(i => ({ src: `/playground/lpoop-${i}.png`, type: 'image', alt: `LPOOP game screenshot ${i}` })) },
  { aspectRatio: 0.8, title: 'Isolation', media: [image('/playground/full-Cqg7PD2oDK1.webp'), image('/playground/full-CqwNm0YtvHl.webp'), image('/playground/full-Cq6chiJobGK.webp'), image('/playground/full-CrlKQNvoV25.webp')] },
  { aspectRatio: 0.72112, title: 'Irl invasions', media: [image('/playground/full-CtmVSNEoEq3.webp'), image('/playground/full-CtuDx8tMPMh.webp'), image('/playground/full-Ct1s7TjoKC3.webp')] },
  { aspectRatio: 0.61466, title: 'Jewelry', media: [video('/playground/ring.mp4', '/playground/ring.webp'), video('/playground/neck-chain.mp4', '/playground/neck-chain.jpg'), video('/playground/bracelet.mp4', '/playground/bracelet.jpg'), video('/playground/earring.mp4', '/playground/earring.webp')] },
  { aspectRatio: 0.71138, title: 'Lofi', media: [video('/playground/berserk.mp4', '/playground/berserk.webp'), video('/playground/wings.mp4', '/playground/wings.jpg'), video('/playground/bassball.mp4', '/playground/bassball.webp')] },
  { aspectRatio: 0.56389, title: 'Weapons', media: [video('/playground/scythe.mp4', '/playground/scythe.webp'), video('/playground/desmodus.mp4', '/playground/desmodus.webp')] },
  { aspectRatio: 0.8, title: 'Se me cayó el bodegón', media: [video('/playground/bodegon.mp4', '/playground/bodegon.webp')] },
  { aspectRatio: 0.56389, title: 'Characters', media: [video('/playground/hanamichi.mp4', '/playground/hanamichi.webp'), video('/playground/char1.mp4', '/playground/char1.webp')] },
  { aspectRatio: 0.5625, title: 'Stickers', media: [video('/playground/stickers-loop.mp4', '/playground/stickers-loop.jpg')] },
  { aspectRatio: 1, title: 'Procedural', media: [video('/playground/animals.mp4', '/playground/animals.webp'), video('/playground/tracking.mp4', '/playground/tracking.webp')] },
  { aspectRatio: 0.70732, title: 'Sorry laces', poster: '/playground/lettersThing.png' },
  { aspectRatio: 1.40705, title: 'Squished', poster: '/playground/outpics.png' },
  { aspectRatio: 1, title: 'Rodman', poster: '/playground/rodman.png' },
  { aspectRatio: 0.66696, title: 'Wild horses', poster: '/playground/wildHorses.png' },
  { aspectRatio: 1, title: 'Music covers', media: [image('/playground/album-cover-1.jpg'), image('/playground/album-cover-2.jpg'), image('/playground/album-cover-3.jpg')] },
  { aspectRatio: 0.6474, title: 'Cooler Venus', previewIndices: [0, 1, 2, 3], media: [image('/playground/cooler_venus/poster1.png'), image('/playground/cooler_venus/manual1.png'), image('/playground/cooler_venus/poster2.png'), image('/playground/cooler_venus/manual2.png'), image('/playground/cooler_venus/golden_disc.png'), image('/playground/cooler_venus/sunscreen.png')] },
  { aspectRatio: 0.70697, title: 'Woodstock 29', previewIndices: [0, 1], media: [
    image('/playground/woodstock29/main_poster.png'),
    image('/playground/woodstock29/alt_poster.png'),
    image('/playground/woodstock29/posters.png'),
    { ...image('/playground/woodstock29/sticker.png'), alt: 'Woodstock sticker on a festival water bottle', crop: { aspectRatio: 1.2, position: '64% 50%' } },
    image('/playground/woodstock29/hydration.png'),
    image('/playground/woodstock29/igpost_1.png'),
    image('/playground/woodstock29/igpost_2.png'),
    { ...image('/playground/woodstock29/cap.png'), alt: 'Embroidered Woodstock cap in the crowd', crop: { aspectRatio: 1.5, position: '40% 50%' } },
    image('/playground/woodstock29/mat.png'),
    { ...image('/playground/woodstock29/wristband.png'), alt: 'Woodstock wristband on a raised arm', crop: { aspectRatio: 1.15, position: '84% 50%' } },
  ] },
]
