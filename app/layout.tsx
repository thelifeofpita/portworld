import type { Metadata, Viewport } from 'next'
import './globals.css'
import LazyDebugMenu from '@/components/ui/LazyDebugMenu'
import { pickPalette } from '@/lib/paletteSource'
import { paletteCssVars } from '@/lib/paletteVars'

export const metadata: Metadata = {
  title: "Pita's goods",
  description: 'Creatively misdirected.',
}

// viewport-fit=cover is what makes env(safe-area-inset-*) resolve to real
// notch/home-indicator clearance instead of 0 — see MobilePage.module.css's
// .mobileFooter/.mobileProjectDetailHeader and PlaygroundGallery.module.css's
// .collectionNav/.toolbar.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
        <link rel="preload" href="/generated/modelSeparated-5ee1a08e9f62.glb" as="fetch" crossOrigin="anonymous" />
        {/* Two probes, one per viewport — see ENV_MAP_DESKTOP/MOBILE in Scene.tsx
            for why mobile can afford the smaller one. The queries mirror
            MOBILE_QUERY in hooks/useIsMobile.ts, which is the source of truth for
            which path actually renders; a portrait tablet resolves to desktop and
            simply misses the hint rather than loading the wrong map. */}
        <link rel="preload" href="/env/studio_small_03_512.hdr" as="fetch" crossOrigin="anonymous" media="(max-width: 768px), (max-height: 768px) and (pointer: coarse)" />
        <link rel="preload" href="/env/studio_small_03_1k.hdr" as="fetch" crossOrigin="anonymous" media="(min-width: 769px) and (pointer: fine)" />
        <link rel="preload" href="/fonts/FuturaPT-Demi.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/FuturaPT-Bold.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        {/* The first project model and the Draco decoder are both on the loader's
            critical path but discovered late — the model only once the Scene chunk
            has parsed, the decoder only at the first Draco parse. Both models are
            Draco-compressed now, so the decoder is needed for the navigation model
            too, i.e. on every single visit. */}
        {/* Desktop-gated: mobile's Projects grid uses static captured images and
            never renders this model, so preloading it there would just steal
            bandwidth from the Playground previews mobile DOES wait on. A tablet
            that resolves to the desktop path merely misses the hint. */}
        <link rel="preload" href="/generated/surfthespike-phone-b4b8dc867e5e.glb" as="fetch" crossOrigin="anonymous" media="(min-width: 769px) and (pointer: fine)" />
        <link rel="preload" href="/draco/draco_wasm_wrapper.js" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/draco/draco_decoder.wasm" as="fetch" crossOrigin="anonymous" />
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
        <LazyDebugMenu />
      </body>
    </html>
  )
}
