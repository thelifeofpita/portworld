// Debug menu state — triggered by pressing "D" three times quickly (see DebugMenu.tsx).
// Plain mutable object (same pattern as the other lib/*Store.ts files) so the R3F
// render loop (Model, PostProcessing, ZoneNav) can read it every frame with no
// React re-renders, while DebugMenu itself subscribes for its own UI updates.

export const FONT_OPTIONS = {
  inter:      { label: 'Inter',                family: "'Inter', sans-serif" },
  altGothic:  { label: 'Alt Gothic ATF Black',  family: "'Alt Gothic ATF Black', sans-serif" },
  youngSerif: { label: 'Young Serif',           family: "'Young Serif', serif" },
  heming:     { label: 'Heming',                family: "'Heming', sans-serif" },
  newRodin:   { label: 'New Rodin Pro',         family: "'New Rodin Pro', sans-serif" },
  ranade:     { label: 'Ranade',                family: "'Ranade', sans-serif" },
  futuraPT:     { label: 'Futura PT',           family: "'Futura PT', sans-serif" },
  futuraPTCond: { label: 'Futura PT Condensed', family: "'Futura PT Condensed', sans-serif" },
} as const

// Weight range offered by the debug menu's sliders. Fonts with discrete static
// weights (New Rodin's 300/500/600/700/800/900, Alt Gothic/Young Serif's single
// weight) just resolve to their nearest available file — standard CSS font
// matching — rather than every step being a distinct real weight.
export const FONT_WEIGHT_MIN  = 100
export const FONT_WEIGHT_MAX  = 900
export const FONT_WEIGHT_STEP = 100

// Size multipliers — different fonts draw at very different apparent sizes for
// the same declared font-size (e.g. New Rodin reads much larger than Inter),
// so these compensate independently of each other.
export const FONT_SCALE_MIN  = 0.5
export const FONT_SCALE_MAX  = 2
export const FONT_SCALE_STEP = 0.05

// Tracking (letter-spacing) — an em offset ADDED on top of each element's own
// hand-tuned letter-spacing (see the `calc(<base>em + var(--tracking))` sites
// across the CSS modules), not a replacement, so headings that start at 0
// still visibly react instead of staying inert.
export const TRACKING_MIN  = -0.05
export const TRACKING_MAX  = 0.2
export const TRACKING_STEP = 0.005

export type FontKey   = keyof typeof FONT_OPTIONS

// Colors that have no "natural" runtime source — the debug value is always
// authoritative and defaults match the values that were previously hardcoded.
interface DebugColors {
  accentBaseColor:     string  // unfocused model/nav accent — was #F20C1F
  accentFocusColor:    string  // focused model/nav accent   — was #F2DF0C
  hoverColor:           string  // link/button hover accent   — was #e01010 / red
  textHighlightColor:   string  // text ::selection color
}

// Colors that DO have a natural runtime source (BackgroundSync's white/black
// lerp, the chrome material default). null = "auto", follow the natural value.
interface DebugOverrides {
  bgColor:    string | null
  fgColor:    string | null
  fgMutedColor: string | null
  modelColor: string | null
}

// "THELIFEOFPITA" is 13 letters, each its own inline-block (see Byline.tsx),
// which breaks the font's natural kerning pairs. bylineKerning holds one
// manual adjustment (em, added to margin-right) per gap BETWEEN adjacent
// letters — 12 gaps for 13 letters — so those pairs can be tightened back up
// by hand instead of guessed at. Index i = the gap between letter i and i+1
// in "THELIFEOFPITA" (T-H, H-E, E-L, ... T-A).
export const BYLINE_LETTERS = 'THELIFEOFPITA'
export const BYLINE_GAP_COUNT = BYLINE_LETTERS.length - 1

export interface DebugState extends DebugColors, DebugOverrides {
  fontPrimary: FontKey
  fontDisplay: FontKey
  fontPrimaryWeight: number
  fontDisplayWeight: number
  fontPrimaryScale: number
  fontDisplayScale: number
  tracking:    number // em, added on top of each element's own letter-spacing
  bylineKerning: number[] // em, length BYLINE_GAP_COUNT — see comment above
  menuOpen:    boolean
}

// Hand-tuned via the debug menu's live kerning tool, then exported and baked
// in here as the new default — see the index comment above for how these map
// to letter pairs across "THELIFEOFPITA".
const DEFAULT_BYLINE_KERNING = [0.03, -0.04, -0.03, 0, -0.05, 0, -0.01, -0.03, -0.01, 0, 0, -0.04]

const DEFAULTS: DebugState = {
  bgColor:      null,
  fgColor:      null,
  fgMutedColor: null,
  modelColor:   null,
  accentBaseColor:   '#55ff55',
  accentFocusColor:  '#ffff55',
  hoverColor:         '#55ff55',
  textHighlightColor: '#ffff55',
  fontPrimary: 'futuraPT',
  fontDisplay: 'futuraPT',
  fontPrimaryWeight: 500,
  fontDisplayWeight: 700,
  fontPrimaryScale: 1.15,
  fontDisplayScale: 1,
  tracking:    -0.01,
  bylineKerning: DEFAULT_BYLINE_KERNING,
  menuOpen:    false,
}

const STORAGE_KEY = 'portworld-debug-state'

function loadPersisted(): Partial<DebugState> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export const debugStore: DebugState = { ...DEFAULTS, ...loadPersisted(), menuOpen: false }

const listeners = new Set<() => void>()

// Every persisted field (everything but the menu's own open/closed state,
// which isn't a "setting" — it's UI state). Shared by persist() (localStorage)
// and exportSettings() (DebugMenu's "Export settings" button) so the two
// can never drift into saving/exporting different shapes of the same state.
function getPersistableState(): Partial<DebugState> {
  const toSave: Partial<DebugState> = { ...debugStore }
  delete toSave.menuOpen
  return toSave
}

function persist() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistableState()))
  } catch {
    // ignore quota/private-mode errors — debug prefs just won't persist
  }
}

// Serializes the current debug settings (colors/fonts/tracking — everything
// the debug menu controls) as pretty JSON, for the "Export settings" button:
// copy this, send it back, and it becomes the new hardcoded DEFAULTS above.
export function exportSettingsJSON(): string {
  return JSON.stringify(getPersistableState(), null, 2)
}

export function applyCssVars() {
  if (typeof window === 'undefined') return
  const root = document.documentElement.style
  const set = (name: string, value: string | null) => {
    if (value) root.setProperty(name, value)
    else root.removeProperty(name)
  }
  // bg/fg/fgMuted are special: unlike every other var below, they have a
  // second writer — Scene.tsx's BackgroundSync sets them directly on
  // document.documentElement.style every frame, for the "auto" (no debug
  // override) case. This function only needs to WRITE them when there's an
  // active override; it must NOT removeProperty() them back to the :root
  // stylesheet default when there isn't one, or it fights BackgroundSync:
  // this call happens on every updateDebug() — including totally unrelated
  // ones like toggling the menu open/closed — so with an unconditional
  // set() here, just opening the debug menu would erase BackgroundSync's
  // inline override back to the hardcoded white/#0d0d0d default, and it
  // would STAY there, because BackgroundSync's own "did this change" check
  // compares against its last-written value (unaware anything else touched
  // the property) and so never notices it needs to re-write.
  if (debugStore.bgColor)      root.setProperty('--bg-color', debugStore.bgColor)
  if (debugStore.fgColor)      root.setProperty('--fg-color', debugStore.fgColor)
  if (debugStore.fgMutedColor) root.setProperty('--fg-muted', debugStore.fgMutedColor)
  set('--accent-color',      debugStore.accentFocusColor)
  set('--accent-base-color', debugStore.accentBaseColor)
  set('--hover-color',         debugStore.hoverColor)
  set('--text-highlight-color', debugStore.textHighlightColor)
  set('--font-primary', FONT_OPTIONS[debugStore.fontPrimary].family)
  set('--font-display', FONT_OPTIONS[debugStore.fontDisplay].family)
  set('--font-primary-weight', String(debugStore.fontPrimaryWeight))
  set('--font-display-weight', String(debugStore.fontDisplayWeight))
  set('--font-primary-scale', String(debugStore.fontPrimaryScale))
  set('--font-display-scale', String(debugStore.fontDisplayScale))
  set('--tracking', `${debugStore.tracking}em`)
}

// Note: deliberately NOT applied at module load — mutating document.documentElement
// here would race with React hydration (the server-rendered <html> never has these
// inline styles) and trigger a hydration mismatch. DebugMenu applies persisted state
// once, from a mount effect, after hydration has settled.

export function updateDebug<K extends keyof DebugState>(key: K, value: DebugState[K]) {
  debugStore[key] = value
  applyCssVars()
  persist()
  listeners.forEach(fn => fn())
}

export function resetDebug() {
  Object.assign(debugStore, DEFAULTS, { menuOpen: debugStore.menuOpen })
  applyCssVars()
  persist()
  listeners.forEach(fn => fn())
}

export function subscribeDebug(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ─── Color helpers — hex → normalised RGB, used by shader uniforms / canvas math ──

export function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function hexToRgb255(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
