import type { Metadata, Viewport } from 'next'
import './globals.css'
import LazyDebugMenu from '@/components/ui/LazyDebugMenu'
import { paletteSnapshot } from '@/lib/paletteSource'
import { MUTED_RATIO } from '@/lib/paletteVars'

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

// Runs before the first paint, from <head>, so the very first painted frame is
// already in this visit's colours. This used to be `export const dynamic =
// 'force-dynamic'` plus a server-side pickPalette() inlined into the HTML, but
// a static export has no per-request server — and picking after hydration is
// what the inlining existed to avoid: the page painted in the placeholder
// white/near-black defaults and then snapped into the real theme.
//
// All the contrast filtering already happened at build time (see
// paletteSnapshot), so this only picks and writes. It sets window.__PALETTE__
// too, which is the exact handoff lib/paletteStore.ts already expects, so the
// whole client path downstream is unchanged.
const PRE_PAINT_PALETTE = `(function(){
  var P=${JSON.stringify(paletteSnapshot)},M=${MUTED_RATIO};
  var e=P[Math.random()*P.length|0],a=e[2][Math.random()*e[2].length|0];
  var p={white:'#'+a[0],yellow:'#'+a[1],red:'#'+a[2],black:'#'+a[3],bright:'#'+e[3],title:e[0],slug:e[1]};
  function mix(f,t,r){var x=parseInt(f.slice(1),16),y=parseInt(t.slice(1),16),o='#';
    for(var i=16;i>=0;i-=8){var c=Math.round(((x>>i)&255)+(((y>>i)&255)-((x>>i)&255))*r);o+=('0'+c.toString(16)).slice(-2);}return o;}
  window.__PALETTE__=p;
  document.documentElement.style.cssText+=';--bg-color:'+p.white+';--fg-color:'+p.black
    +';--fg-muted:'+mix(p.black,p.white,M)+';--accent-color:'+p.yellow
    +';--accent-base-color:'+p.red+';--hover-color:'+p.red
    +';--text-highlight-color:'+p.yellow+';--palette-white:'+p.bright;
})()`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
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
        {/* This visit's colors, chosen and applied before the first paint.
            Must stay in <head> and stay render-blocking (no defer/async): the
            whole point is that it runs before anything is drawn. */}
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_PALETTE }} />
      </head>
      <body suppressHydrationWarning>
        {children}
        <LazyDebugMenu />
      </body>
    </html>
  )
}
