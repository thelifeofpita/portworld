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

export interface PlaygroundItem {
  title:        string
  mp4?:         string   // primary video — H.264 MP4
  webm?:        string   // optional WebM VP9 (smaller, better quality at same bitrate)
  poster?:      string   // still shown before hover; omit to use first video frame
  aspectRatio?: number   // width/height override — auto-detected from poster image if omitted
}

export const playgroundContent: PlaygroundItem[] = [
  { title: 'Desmodus',             mp4: '/playground/desmodus.mp4',  poster: '/playground/desmodus.webp' },
  { title: `Se me cayó el bodegón`, mp4: '/playground/bodegon.mp4',  poster: '/playground/bodegon.webp' },
  { title: 'IDS',                  mp4: '/playground/id.mp4',        poster: '/playground/id.webp' },
  { title: 'Tracking blobs',       mp4: '/playground/tracking.mp4',  poster: '/playground/tracking.webp' },
  { title: 'Glitchy animals',      mp4: '/playground/animals.mp4',   poster: '/playground/animals.webp' },
  { title: 'Badass scythe',        mp4: '/playground/scythe.mp4',    poster: '/playground/scythe.webp' },
  { title: `Pita's coffee`,        mp4: '/playground/coffee.mp4',    poster: '/playground/coffee.webp' },
  { title: `Proto-character`,      mp4: '/playground/char1.mp4',     poster: '/playground/char1.webp' },
  { title: `Hanamichi`,            mp4: '/playground/hanamichi.mp4', poster: '/playground/hanamichi.webp' },
  { title: `Earrings`,             mp4: '/playground/earring.mp4',   poster: '/playground/earring.webp' },
  { title: `Ring`,                 mp4: '/playground/ring.mp4',      poster: '/playground/ring.webp' },
  { title: `Among the pillars`,    poster: '/playground/pillars.webp' },
 // { title: `City invasion`,       poster: '/playground/city.webp' },
  { title: `Chained down`,         poster: '/playground/chain.webp' },
  { title: `Globe`,                poster: '/playground/globe.webp' },
  { title: `Bassball`,             mp4: '/playground/bassball.mp4',  poster: '/playground/bassball.webp' },
  { title: `Swordsman`,            mp4: '/playground/berserk.mp4',   poster: '/playground/berserk.webp' },
]
