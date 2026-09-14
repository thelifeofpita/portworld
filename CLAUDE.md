# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Jose Pita's portfolio (thelifeofpita.com). There's no nav bar: a draggable chrome 3D model is the menu. The design brief lives in `../CLAUDE.md` (parent `portworld/` folder), but parts of it are **out of date**. Where the brief and the code disagree, trust the code:
- Hosting is **GitHub Pages** (static export), not Netlify.
- The default typeface is **Futura PT** (`--font-primary`/`--font-display` in `app/globals.css`). Young Serif, Inter and the other faces only show up as options in the debug menu.
- Zone 2 is **Playground** (`types/index.ts`), and zone detection uses both X and Y rotation, not just horizontal.
- Colours are not fixed. Every visit picks a random 4-colour Lospec palette (see "Palette" below).

`AGENTS.md` applies: this is Next 16 with breaking changes. Check `node_modules/next/dist/docs/` before relying on Next APIs from memory.

## Commands

```bash
npm run dev            # next dev (Turbopack), localhost:3000
npm run build          # static export → ./out  (this is what CI deploys)
npm run lint           # eslint (flat config, next core-web-vitals + typescript)
npx tsc --noEmit       # typecheck (no separate script)
npm run check-model -- public/models/foo.glb   # sanity-check a Blender .glb export (catches untextured → flat-white materials)
npm run cv             # regenerate public/JOSE_PITA_EN.pdf from content/aboutContent.ts
```

There's no test runner. `scripts/` holds one-off Node/Playwright check, measure and asset-pipeline scripts, run directly with `node scripts/<name>.mjs`:
- **Browser checks** (`check-*.mjs`, `measure-*.mjs`, `audit-*.mjs`) drive the system Chrome (`channel: 'chrome'`) against a running server. Most default to `http://localhost:3001` and some to `:3000`; override with `TEST_BASE_URL`. To start a production server on 3001, build and then serve `./out` statically. (`next start` doesn't work with `output: "export"`, even though some script comments still say to use it.) `PERF_DIST_DIR` sends the build to a different dist dir (`.next-performance`, `.next-campaign`) so it doesn't collide with a running `next dev`. `PERF_ENGINE=webkit` and `PERF_LABEL` are also used; results go to `reports/`.
- **Pure unit test**: `node scripts/test-performance-controllers.mjs` covers `lib/renderQuality.ts` and `lib/mediaPlayback.ts` with no browser. It imports `.ts` directly, so it needs Node's native TS type-stripping.
- **Asset pipeline**: `optimize-media.mjs` (sharp + ffmpeg/ffprobe) writes content-hashed derivatives to `public/generated/` and records them in `content/media-manifest.json`. `generate-model-fit.mjs` writes `content/model-fit.json`. The `prepare-*`, `capture-*` and `process-*` scripts produce the other `content/*.json` manifests. The `.py` scripts are Blender/ffmpeg export helpers. Originals are never overwritten, and components read the manifests instead of the raw files.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci` → `npm run build` → `touch out/.nojekyll` (otherwise Jekyll drops `_next/`) → assert `out/CNAME` exists → publish to Pages. Anything that needs a server won't work: no API routes, middleware, per-request rendering, or response headers. `headers()` in `next.config.ts` has no effect and is only kept as documentation. `images.unoptimized` is deliberately on, because the dev image optimizer hangs; images are pre-optimized `.webp`.

## Architecture

**Single route.** `app/page.tsx` is the whole site. `useIsMobile` (`hooks/useIsMobile.ts`; its `MOBILE_QUERY` is the source of truth and is mirrored in `<link media>` preloads in `app/layout.tsx`) picks one of two separate trees:
- **Desktop**: `<Scene>` (full-screen R3F canvas) + `<ContentPanel>` (DOM overlay for the active zone) + `<ZoneNav>` + `<Byline>` + `<Loader>`.
- **Mobile**: `<MobilePage>`, a scrolling layout that embeds its own `Scene`. Mobile Projects shows static captured thumbnails (`mobileThumb*` fields) instead of live 3D models.

The loader stays up until three things are ready: the model has loaded, the palette is ready, and sections report `onPrepared`. Projects/Playground are pre-mounted in a `warming` state behind the loader so the first zone entry doesn't jank.

**Zones.** `components/canvas/Model.tsx` handles drag rotation, finds the nearest target with `getZone()` in `hooks/useZone.ts` (`ZONE_TARGETS`, as X/Y degree pairs), and snaps to it. Selecting a zone enters "content mode": the camera pulls back, the model shrinks, and the work appears. Clicking the small model calls `resetToLanding`.

**Mutable stores, not React state, for per-frame data.** `lib/*Store.ts` modules are plain exported mutable objects, sometimes with a `subscribe` set. They carry data between the R3F render loop and DOM siblings without re-renders or prop drilling. Examples: `zoneStore` (Model registers `snapToZone`/`resetToLanding` so `ZoneNav` can call them), `rotationStore`, `cameraStore`, `posStore`, `cursorStore`, and the glow/slot stores that let DOM cards and in-scene 3D models line up. `debugStore` is the single per-frame source for accent/ink colours and typography. When a canvas component and a DOM component need to share something, follow this pattern. DOM-side per-frame work should go through `lib/frameScheduler.ts` (`subscribeFrame`, reads before writes) rather than separate rAF loops.

**Palette.** `content/palette-pool.json` is contrast-filtered at build time by `lib/paletteSource.ts` into `paletteSnapshot`. The inline `PRE_PAINT_PALETTE` script in `app/layout.tsx` picks one before first paint, sets CSS vars (`--bg-color`, `--fg-color`, `--accent-color`, `--accent-base-color`, …) and `window.__PALETTE__`, and `lib/paletteStore.ts` takes over on the client (clicking the byline on the landing view rerolls). Some comments still mention a server-side `app/api/palette` route that no longer exists. Style with the CSS vars and never hard-code colours.

**Rendering.** `Scene.tsx` sets up the environment map (1k HDR on desktop, 512 on mobile), Draco-compressed GLBs (decoder in `public/draco/`), and lazy `InSceneProjectModel`s for projects with `bigModel`. `PostProcessing.tsx` does the dither/shader pass. `lib/renderQuality.ts` adjusts DPR/shadow tiers based on frame time. Critical assets are preloaded by hard-coded hashed filename in `layout.tsx`, so **if you regenerate a hashed asset (e.g. `modelSeparated-*.glb`), update that preload too**.

**Content.** All copy and media paths live in `content/projectsContent.ts`, `aboutContent.ts` and `playgroundContent.ts` (the field docs are at the top of each file). Projects can set `customLayout` to use a bespoke case-study page: build the component, register it in `components/ui/customLayouts.ts`, and widen the `customLayout` union. `ContentPanel` (desktop) and `MobilePage` (mobile) both resolve through that map. `content/aboutContent.ts` also feeds the CV PDF, so rerun `npm run cv` after editing it.

**Styling.** CSS Modules next to each component, plus `app/globals.css` for tokens and `@font-face`. Tailwind/PostCSS is installed but not used by components. Animations use Framer Motion with the shared easing from `lib/motionEasing.ts`.

**Debug menu.** `components/ui/DebugMenu.tsx` (lazy-loaded) has live font, colour and shader tweaks. Its triple-`D` keyboard shortcut is currently **disabled** so the menu can't be reached on the live site; set `TRIPLE_D_ENABLED` to `true` in that file to turn it back on.
