export type MasonryRect = { left: number; top: number; width: number; height: number }

// Find the largest arrangement that fits every piece at its native ratio.
// Unequal columns and staggered starts produce a compact, irregular wall.
export function fitMasonry(ratios: number[], width: number, height: number, label = 0, exclusion?: MasonryRect): MasonryRect[] {
  if (!ratios.length || width <= 0 || height <= 0) return []
  const gap = Math.min(22, Math.max(8, width * 0.012))
  // A pair is a comparison, not two differently weighted masonry columns.
  // Give both pieces the same display height and preserve their native ratios.
  if (ratios.length === 2 && label === 0 && !exclusion) {
    const h = Math.min(height, (width - gap) / (ratios[0] + ratios[1]))
    const x = (width - h * (ratios[0] + ratios[1]) - gap) / 2
    return ratios.map((ar, i) => ({ left: x + (i ? h * ratios[0] + gap : 0), top: (height - h) / 2, width: h * ar, height: h }))
  }
  let best: MasonryRect[] = [], bestArea = -1
  for (let count = 1; count <= Math.min(ratios.length, 8); count++) {
    const weights = Array.from({ length: count }, (_, c) => [1, 0.88, 1.08, 0.96][c % 4])
    const maxUnit = (width - gap * (count - 1)) / weights.reduce((a, b) => a + b, 0)
    const pack = (unit: number) => {
      const widths = weights.map(w => w * unit)
      const usedWidth = widths.reduce((a, b) => a + b, 0) + gap * (count - 1)
      const inset = (width - usedWidth) / 2
      const bottoms = widths.map((_, c) => exclusion ? [0, 16, 28, 8][c % 4] : 0)
      const columns: number[][] = widths.map(() => [])
      const rects: MasonryRect[] = []
      ratios.forEach((ratio, i) => {
        const ar = Math.max(0.15, Math.min(8, ratio || 1))
        const tops = widths.map((w, c) => {
          const x = inset + widths.slice(0, c).reduce((a, b) => a + b, 0) + gap * c
          const y = bottoms[c]
          if (exclusion && x < exclusion.left + exclusion.width && x + w > exclusion.left && y < exclusion.top + exclusion.height && y + w / ar + label > exclusion.top) return exclusion.top + exclusion.height + gap
          return y
        })
        let col = 0
        widths.forEach((w, c) => { if (tops[c] + w / ar < tops[col] + widths[col] / ar) col = c })
        const w = widths[col], h = w / ar
        rects[i] = { left: widths.slice(0, col).reduce((a, b) => a + b, 0) + gap * col, top: tops[col], width: w, height: h }
        bottoms[col] = tops[col] + h + label + gap
        columns[col].push(i)
      })
      return { rects, bottoms, columns, totalH: Math.max(...bottoms) - gap }
    }
    let low = 0, high = maxUnit
    for (let step = 0; step < 28; step++) {
      const mid = (low + high) / 2
      if (pack(mid).totalH <= height) low = mid
      else high = mid
    }
    if (low < 1) continue
    const { rects, bottoms, columns } = pack(low)
    const area = rects.reduce((a, r) => a + r.width * r.height, 0)
    if (area <= bestArea) continue
    bestArea = area
    const usedW = low * weights.reduce((a, b) => a + b, 0) + gap * (count - 1)
    const insetX = (width - usedW) / 2
    columns.forEach((indices, col) => {
      const offset = exclusion ? 0 : Math.max(0, height - (bottoms[col] - gap)) * [0.4, 0.65, 0.25, 0.55][col % 4]
      indices.forEach(i => { rects[i].left += insetX; rects[i].top += offset })
    })
    best = rects
  }
  return best
}
