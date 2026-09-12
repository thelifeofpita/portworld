import mediaManifest from '@/content/media-manifest.json'
import type { PlaygroundItem, PlaygroundMediaItem } from '@/content/playgroundContent'

const metadata = mediaManifest as Record<string, Partial<PlaygroundMediaItem>>

// Normalizes every PlaygroundItem shape (media[] / mp4+webm / poster-only)
// into one media list, manifest-merged. Lives here (not in
// PlaygroundGallery.tsx) so lib/mobileWarmup.ts can reuse it without pulling
// PlaygroundGallery's component code — framer-motion, DOM/layout logic, etc.
// — into its import graph, which would defeat MobilePage.tsx's deliberate
// `dynamic(() => import('./PlaygroundGallery'))` code-split.
export function pieces(item: PlaygroundItem): PlaygroundMediaItem[] {
  const all = item.media ?? (item.mp4 || item.webm
    ? [{ src: item.mp4 ?? item.webm!, type: 'video' as const, poster: item.poster }]
    : [{ src: item.poster!, type: 'image' as const }])
  return all.map(piece => ({ ...metadata[piece.src], ...piece }))
}
