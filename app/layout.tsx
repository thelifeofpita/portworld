import type { Metadata } from 'next'
import './globals.css'
import { projectsContent } from '@/content/projectsContent'
import DebugMenu from '@/components/ui/DebugMenu'
import { pickPalette } from '@/lib/paletteSource'
import { paletteCssVars } from '@/lib/paletteVars'

export const metadata: Metadata = {
  title: "Pita's goods",
  description: 'Creatively misdirected.',
}

// The theme is randomized per visit, so the HTML itself can never be cached.
export const dynamic = 'force-dynamic'

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Picked on the server and inlined below, rather than fetched from
  // /api/palette after hydration. Two things used to be visible because of
  // that round-trip: the page painted in the placeholder white/near-black
  // defaults and then snapped/faded into the real palette, and the loading
  // screen was held open the whole time the request was in flight. Inlining
  // makes the very first painted frame correct, and lets the loader wait on
  // the 3D model alone.
  const palette = await pickPalette()

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Start fetching the model and the fonts actually used at first
            paint as early as possible. Only the two default faces are
            preloaded (Futura PT Demi = --font-primary at weight 500, Bold =
            --font-display at 700); every other family is debug-menu-only, so
            preloading them just competed for bandwidth with the model. */}
        <link rel="preload" href="/models/modelSeparated.glb" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/env/studio_small_03_1k.hdr" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/FuturaPT-Demi.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/FuturaPT-Bold.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        {/* Preload project thumbnails so they're ready before the user rotates to zone 0 */}
        {projectsContent.map(p => p.thumb
          ? <link key={p.thumb} rel="preload" as="image" href={p.thumb} />
          : null
        )}
        {/* This session's colors, before any JS runs. */}
        <style>{`:root{${paletteCssVars(palette)}}`}</style>
        {/* Same palette handed to the client so paletteStore can adopt it
            synchronously instead of re-fetching what the server already knows. */}
        <script
          dangerouslySetInnerHTML={{ __html: `window.__PALETTE__=${JSON.stringify(palette)}` }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <DebugMenu />
      </body>
    </html>
  )
}
