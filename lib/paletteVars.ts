// Shared (server + client) definition of a palette and the CSS variables it
// maps onto. Both sides need this identical mapping: app/layout.tsx inlines it
// into the HTML for the first paint, and lib/paletteStore.ts re-applies the
// same values on a reroll — if the two ever disagreed, the page would shift
// colors the moment JS took over.

export interface Palette {
  white:  string  // bg role
  yellow: string  // accent-focus role
  red:    string  // accent-base role
  black:  string  // fg role
  bright: string  // objectively brightest of the 4, whatever role it landed in
  title:  string
  slug:   string
}

export function hexToRgb255(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Ratio the original hardcoded muted grays sat between fg and bg (both the
// white-mode #999999 and black-mode #666666 land ~58% of the way from fg to
// bg) — reused so any palette produces a muted tone with the same relationship.
export const MUTED_RATIO = 0.58

export function mixHex(fromHex: string, toHex: string, t: number): string {
  const [fr, fg, fb] = hexToRgb255(fromHex)
  const [tr, tg, tb] = hexToRgb255(toHex)
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
  return '#' + [mix(fr, tr), mix(fg, tg), mix(fb, tb)].map(n => n.toString(16).padStart(2, '0')).join('')
}

// Every themed CSS variable, as a declaration string. Mirrors what
// applyPalette + BackgroundSync write at runtime, so the inlined first-paint
// values and the runtime ones are the same numbers.
export function paletteCssVars(p: Palette): string {
  return [
    `--bg-color:${p.white}`,
    `--fg-color:${p.black}`,
    `--fg-muted:${mixHex(p.black, p.white, MUTED_RATIO)}`,
    `--accent-color:${p.yellow}`,
    `--accent-base-color:${p.red}`,
    `--hover-color:${p.red}`,
    `--text-highlight-color:${p.yellow}`,
    `--palette-white:${p.bright}`,
  ].join(';')
}
