// Randomizes the site's theme once per page load, sourced from Lospec's
// top-100-downloaded exact-4-color palettes (see app/api/palette/route.ts,
// which does the actual Lospec call server-side to avoid CORS).
// white/yellow/red/black are ROLE names (bg / accent-focus / accent-base /
// fg), not lightness ranks — the API randomizes which of the palette's 4 raw
// colors lands in which role (subject to the contrast filter), so sometimes
// the darkest color is `white`, sometimes a mid-tone is `black`, etc. `bright`
// is the one field that IS lightness-based (see getThemeColors/loadPalette
// below for what each field feeds). white/black feed Scene.tsx's
// BackgroundSync (the natural bg/fg lerp target — see getThemeColors below,
// used only for the fade-in from placeholder defaults once the palette
// finishes loading, there's no light/dark toggle anymore); yellow/red are
// applied straight onto debugStore, which is already the single source of
// truth the 3D model ink, ZoneNav and PostProcessing read every frame for
// accent color (see debugStore.ts's DebugColors comment — those fields have
// no separate "natural" source to layer under, so setting them IS the
// natural source now).
import { applyPaletteColors } from './debugStore'
import { mixHex, MUTED_RATIO, type Palette } from './paletteVars'

export type { Palette }

// `preview` is the NEXT palette, already fetched ahead of time so a click can
// apply it instantly (no fetch-then-flash delay) — see rerollPalette below.
// It's also what Byline.tsx reads to paint its hover letter-cycle animation,
// so hovering previews the literal colors a click would produce.
export const paletteStore: { palette: Palette | null; preview: Palette | null } = { palette: null, preview: null }

const listeners = new Set<() => void>()
export function subscribePalette(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const previewListeners = new Set<() => void>()
export function subscribePreview(fn: () => void): () => void {
  previewListeners.add(fn)
  return () => previewListeners.delete(fn)
}

interface BgColorSet { bg: string; fg: string; fgMuted: string }

const DEFAULT_THEME_COLORS: BgColorSet = { bg: '#ffffff', fg: '#0d0d0d', fgMuted: '#999999' }

// The bg/fg/fgMuted target Scene.tsx's BackgroundSync lerps toward. Falls
// back to the original hardcoded white/near-black until a palette has
// loaded, so there's no flash of an invalid color — once it loads, this is
// fixed for the session (no light/dark toggle to lerp between anymore).
export function getThemeColors(): BgColorSet {
  const p = paletteStore.palette
  if (!p) return DEFAULT_THEME_COLORS
  return { bg: p.white, fg: p.black, fgMuted: mixHex(p.black, p.white, MUTED_RATIO) }
}

// Fraction of the way from the bg role toward the fg role the model's chrome
// tint sits at. Deliberately an even 50/50 split, for a reason that isn't
// obvious from the number alone — two failure modes pull in opposite
// directions, and only sitting in the middle avoids both:
//
// 1. PostProcessing's 1-bit dither shader decides how densely to draw "ink"
//    dots by comparing the model's actual RENDERED luminance (this tint,
//    after lighting) against the background's — the closer they are, the
//    sparser the dots (bad: a tint biased toward bg can land close to
//    whatever the randomized bg role's luminance is, producing a
//    sparse/washed-out model that barely reads against the background).
//    That alone would argue for biasing hard toward fg instead, which is
//    what this used to do (mostly fg-colored, 83% of the way there).
// 2. But CHROME_MATERIAL is metalness:1 — the tint acts as an albedo
//    multiplier on every reflection, so a tint biased hard toward a fg
//    that's genuinely dark (common now that fg just needs strong contrast
//    from bg, not any particular lightness) suppresses almost all reflected
//    light, including highlights. The model then renders as ~99% flat dark
//    ink with only tiny, sparse specular hotspots — a different but equally
//    bad failure (reported live: a white bg + near-black fg palette
//    produced a nearly all-black silhouette with barely any highlight
//    variation, even though the dither-density math itself was fine).
//
// A 50/50 mix keeps the tint at a genuine middle luminance regardless of
// where bg and fg individually land, so lighting has room to swing the
// rendered surface both brighter (readable highlights) and darker (readable
// shadows) — while still sitting meaningfully far from bg on average, since
// fg is already guaranteed >=4.5:1 WCAG contrast from bg (see
// app/api/palette/route.ts's MIN_TEXT_CONTRAST), which drags the midpoint
// along with it.
const MODEL_COLOR_RATIO = 0.5

// Default tint for the 3D model's chrome material, and for project cards with
// no accentColor of their own (see content/projectsContent.ts) — the one place
// besides the 4 palette roles that still needs a color, so it's derived from
// the same bg/fg roles rather than left as an independent hardcoded gray.
export function getModelColor(): string {
  const p = paletteStore.palette
  if (!p) return '#d4d4d4'
  return mixHex(p.white, p.black, MODEL_COLOR_RATIO)
}

// Longer than the API route's own 4s-per-upstream-call timeout (those run
// in parallel, but this still needs headroom above the worst case).
function fetchPalette(): Promise<Palette | null> {
  return fetch('/api/palette', { signal: AbortSignal.timeout(6000) })
    .then(res => (res.ok ? (res.json() as Promise<Palette>) : null))
    .catch(() => null)
}

// Actually re-themes the site: paletteStore.palette updates, the accent CSS
// vars update, and every subscriber (Scene.tsx's
// BackgroundSync, for the bg/fg lerp target) re-runs — so this can be called
// after initial load too, to smoothly re-theme everything already on screen.
function applyPalette(palette: Palette) {
  adoptPalette(palette)
  listeners.forEach(fn => fn())
}

// Writes the palette into the stores WITHOUT touching the DOM — used both by
// applyPalette (reroll) and, at module load, by the SSR-inlined palette, where
// <html> already carries the right values from app/layout.tsx's inline <style>
// and mutating it here would race React hydration.
function adoptPalette(palette: Palette) {
  const isSsr = palette === ssrPalette
  paletteStore.palette = palette
  if (typeof document !== 'undefined' && !isSsr) {
    // The objectively brightest of the 4 colors — NOT the `white` role, which
    // can land on any of the 4 regardless of lightness (see the module comment
    // above). Needed by the handful of spots (a forced-light backdrop, a
    // specular card "shine") that must stay genuinely bright no matter which
    // color ended up in which role. Skipped for the SSR palette, whose value
    // is already inlined in the document (see paletteVars.paletteCssVars).
    document.documentElement.style.setProperty('--palette-white', palette.bright)
  }
  // Not updateDebug(): that persists to localStorage, and these four fields
  // are palette-derived, not user settings — persisting them meant the NEXT
  // visit briefly applied the PREVIOUS visit's accents (DebugMenu replays
  // persisted state on mount) before the new palette landed, which read as a
  // color snap during loading.
  applyPaletteColors({
    accentFocusColor:   palette.yellow,
    accentBaseColor:    palette.red,
    hoverColor:         palette.red,
    textHighlightColor: palette.yellow,
  }, !isSsr)
}

// Fetches the NEXT palette in the background and stashes it as `preview`
// without applying it — called after every apply (initial load and every
// reroll) so there's always a ready-to-go palette for the next click, and so
// Byline.tsx's hover animation has real upcoming colors to show, not stale
// ones from the palette already on screen.
function prefetchPreview() {
  fetchPalette().then(preview => {
    paletteStore.preview = preview
    previewListeners.forEach(fn => fn())
  })
}

// app/layout.tsx inlines the palette it picked during SSR here, so the first
// paint is already correctly themed and the client never has to fetch a
// palette it was handed. Adopted at module load (before any component renders)
// so getThemeColors() below already returns the real colors the first time
// Scene.tsx's BackgroundSync asks — otherwise it would start its fade from the
// placeholder defaults and visibly cross into the palette.
declare global { interface Window { __PALETTE__?: Palette } }
const ssrPalette: Palette | null =
  typeof window !== 'undefined' ? (window.__PALETTE__ ?? null) : null
if (ssrPalette) adoptPalette(ssrPalette)

let loadPromise: Promise<Palette | null> | null = null

// Called once, on initial page load — memoized so concurrent callers (e.g.
// React effects re-firing) share the same in-flight request instead of
// double-fetching.
export function loadPalette(): Promise<Palette | null> {
  if (loadPromise) return loadPromise
  // Already themed by SSR — nothing to wait for, just warm the next palette
  // so a byline click/hover has one ready.
  if (ssrPalette) {
    prefetchPreview()
    loadPromise = Promise.resolve(ssrPalette)
    return loadPromise
  }
  loadPromise = fetchPalette().then(palette => {
    if (palette) applyPalette(palette)
    prefetchPreview()
    return palette
  })
  return loadPromise
}

// Re-rolls the theme without a page reload — e.g. clicking the
// "THELIFEOFPITA" byline. Applies the already-prefetched `preview` palette
// instantly (no fetch delay), then kicks off fetching the next preview.
// Falls back to a fresh fetch on the rare chance preview isn't ready yet
// (e.g. a click within the first moment of page load).
export function rerollPalette(): Promise<Palette | null> {
  const preview = paletteStore.preview
  if (preview) {
    paletteStore.preview = null
    applyPalette(preview)
    prefetchPreview()
    return Promise.resolve(preview)
  }
  return fetchPalette().then(palette => {
    if (palette) applyPalette(palette)
    prefetchPreview()
    return palette
  })
}
