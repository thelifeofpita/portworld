import { NextResponse } from 'next/server'

// Lospec's palette-list AJAX endpoint (same one lospec.com/palette-list uses
// client-side) — 10 palettes per page, no auth/CORS headers needed since this
// runs server-side. colorNumberFilterType=exact + colorNumber=4 restricts to
// palettes with exactly 4 colors; sortingType=downloads ranks by popularity.
const LOSPEC_URL = 'https://lospec.com/palette-list/load'
const PAGE_SIZE  = 10
const PAGES      = 20 // 20 x 10 = top 200 by downloads

interface LospecPalette {
  title:  string
  slug:   string
  colors: string[]
}

export interface Palette {
  white:  string
  yellow: string
  red:    string
  black:  string
  // The objectively brightest of the 4 raw colors — NOT necessarily the same
  // as `white` above, since role assignment is randomized independent of
  // lightness (see validRoleAssignments). Used only for the couple of spots
  // that need to stay genuinely bright regardless of which color landed in
  // the bg/fg/accent roles (a glossy card-shine highlight, a forced-light
  // backdrop) — see lib/paletteStore.ts's --palette-white.
  bright: string
  title:  string
  slug:   string
}

// Used only if Lospec is unreachable, so the site always has a valid theme.
// All 4 already clear the contrast filter below on their own — no point
// falling back to a palette that would itself get filtered out.
const FALLBACK_PALETTES: LospecPalette[] = [
  { title: 'SpaceHaze',    slug: 'spacehaze',     colors: ['f8e3c4', 'cc3495', '6b1fb1', '0b0630'] },
  { title: 'Arq4',         slug: 'arq4',          colors: ['ffffff', '6772a9', '3a3277', '000000'] },
  { title: '2 Bit Matrix', slug: '2-bit-matrix',  colors: ['f2fff2', 'add9bc', '5b8c7c', '0d1a1a'] },
  { title: 'Bicycle',      slug: 'bicycle',       colors: ['161616', 'ab4646', '8f9bf6', 'f0f0f0'] },
]

// Simple weighted luma — matches the perceptual-luminance formula used
// elsewhere in this codebase (e.g. lib/bgStore.ts). Only used as a last-resort
// fallback below; NOT accurate enough for the contrast-ratio math either way.
function luma(hex: string): number {
  const n = parseInt(hex, 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return r * 0.299 + g * 0.587 + b * 0.114
}

// ─── WCAG contrast filter ──────────────────────────────────────────────────
// Rejects role assignments where the theme's readability/legibility would
// actually suffer — NOT every pairwise combination of the 4 colors (curated
// palettes almost always have at least one close pair, e.g. two mid-tones —
// that's normal palette design, not a defect). Only the roles that matter:
//   - bg vs fg (white vs black slot): real body text, held to WCAG AA 4.5:1 —
//     this is the binding constraint for text, so it's kept at the official bar.
//   - bg vs each accent (yellow/red slots): nav lines/dots on the page, and
//     some permanently-visible bold text (e.g. the "PITA" half of the
//     logotype, styled in the accent-base/red role) — needs more than the
//     bare-minimum "thin decorative accent" bar turned out to allow, since a
//     too-low value here can make that text unreadable.
//   - fg vs each accent: the model's accent regions (hand/foot/head — the
//     clickable zone hotspots) are drawn by tinting the SAME dithered ink
//     pattern used for the rest of the model, so if the accent color is too
//     close to the ink/fg color, those regions don't visually separate from
//     the plain body at all — the "can't see the selectable body parts"
//     failure. This pair had NO check at all until a live example showed it
//     could get almost fully indistinguishable, ~1.2:1.
// Both accent bars went through several rounds of being too loose: first no
// fg check + bg at 2.0, then bg at 2.5 + fg at 1.8 — a live screenshot after
// the second round STILL showed an unreadable case (dark green bg, dark
// navy accent), and checking actual applied page values (not just the API
// output) found several real palettes sitting right at that 1.8-2.5
// boundary that plainly don't look distinct enough. bg-vs-accent now sits at
// WCAG's own official non-text/UI-component minimum (3:1) — no longer
// relaxed below the standard, since it also gates real (if decorative) text
// like the "PITA" half of the logotype. fg-vs-accent stops short of that
// same 3:1 bar deliberately: requiring it on top of bg-vs-accent for BOTH
// yellow AND red simultaneously is a much harder combined bar than either
// check alone (empirically, 3:1-on-both collapses the qualifying pool to
// 2/100 of the top-100 — unworkably repetitive) — 2.2 is the highest value
// that still leaves a real, varied pool (~11/100) while meaningfully
// clearing the 1.8 that just failed live.
const MIN_TEXT_CONTRAST    = 4.5
const MIN_BG_ACCENT_CONTRAST = 3.0
const MIN_FG_ACCENT_CONTRAST = 2.2

function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const n = parseInt(hex, 16)
  const r = srgbToLinear((n >> 16) & 255)
  const g = srgbToLinear((n >> 8) & 255)
  const b = srgbToLinear(n & 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function allPermutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  const out: T[][] = []
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const perm of allPermutations(rest)) out.push([arr[i], ...perm])
  }
  return out
}

// Every [white, yellow, red, black] role assignment of a palette's 4 colors
// that clears the contrast bars — lightness order plays no part in which
// color lands in which role, only whichever pairing is picked afterwards.
// Deliberately checked per-*assignment*, not just "does the luminance-sorted
// order pass": the darkest color can end up as bg, a mid-tone can end up as
// fg, etc., as long as THAT pairing still reads clearly.
function validRoleAssignments(colors: string[]): string[][] {
  return allPermutations(colors).filter(([white, yellow, red, black]) =>
    contrastRatio(white, black)  >= MIN_TEXT_CONTRAST &&
    contrastRatio(white, yellow) >= MIN_BG_ACCENT_CONTRAST &&
    contrastRatio(white, red)    >= MIN_BG_ACCENT_CONTRAST &&
    contrastRatio(black, yellow) >= MIN_FG_ACCENT_CONTRAST &&
    contrastRatio(black, red)    >= MIN_FG_ACCENT_CONTRAST
  )
}

function passesContrastFilter(p: LospecPalette): boolean {
  return validRoleAssignments(p.colors).length > 0
}

// Picks uniformly at random among the valid role assignments — this is what
// actually mixes up which color lands where (not just which palette is used).
function toPalette(p: LospecPalette): Palette {
  const valid = validRoleAssignments(p.colors)
  // Only reachable if toPalette is ever called on a palette that skipped
  // passesContrastFilter (shouldn't happen given how GET() below uses it) —
  // falls back to the old brightest/darkest ordering rather than crashing.
  const [white, yellow, red, black] = valid.length > 0
    ? valid[Math.floor(Math.random() * valid.length)]
    : [...p.colors].sort((a, b) => luma(b) - luma(a))
  const bright = [...p.colors].sort((a, b) => luma(b) - luma(a))[0]
  return { white: `#${white}`, yellow: `#${yellow}`, red: `#${red}`, black: `#${black}`, bright: `#${bright}`, title: p.title, slug: p.slug }
}

async function fetchTopPalettes(): Promise<LospecPalette[]> {
  const pages = await Promise.all(
    Array.from({ length: PAGES }, (_, i) => {
      const page = i + 1
      const url = `${LOSPEC_URL}?colorNumberFilterType=exact&colorNumber=4&sortingType=downloads&tag=&page=${page}`
      return fetch(url, { signal: AbortSignal.timeout(4000), next: { revalidate: 86400 } })
        .then(res => (res.ok ? res.json() : null))
        .catch(() => null)
    })
  )

  return pages
    .filter((p): p is { palettes: LospecPalette[] } => !!p?.palettes?.length)
    .flatMap(p => p.palettes)
    .slice(0, PAGES * PAGE_SIZE)
}

export async function GET() {
  let pool = FALLBACK_PALETTES
  try {
    const topPalettes = await fetchTopPalettes()
    // Prefer palettes that clear the contrast bar; if the filter happens to
    // reject the entire pool (it shouldn't — usually ~5-10% pass), fall
    // back to the unfiltered pool rather than erroring.
    const filtered = topPalettes.filter(passesContrastFilter)
    if (filtered.length > 0) pool = filtered
    else if (topPalettes.length > 0) pool = topPalettes
  } catch {
    // fall through to FALLBACK_PALETTES
  }

  const pick = pool[Math.floor(Math.random() * pool.length)]
  return NextResponse.json(toPalette(pick), { headers: { 'Cache-Control': 'no-store' } })
}
