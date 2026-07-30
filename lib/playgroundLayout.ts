import type { PlaygroundItem } from '@/content/playgroundContent'

// Shared between the flat 2D DOM masonry (ContentPanel.tsx's PlaygroundPane)
// and the experimental 3D card display (canvas/PlaygroundCards3D.tsx) — both
// need the exact same card positions/sizes, just rendered through different
// pipelines, so the layout solver lives here as the single source of truth.

export interface PlaygroundCardConfig {
  x: number            // card centre as % of viewport width
  y: number            // card centre as % of viewport height
  thumbW: number       // thumbnail width in px
  thumbH: number       // thumbnail height in px
  aspectRatio: number  // real w/h — resolved from poster/video before layout
}

// Full-width masonry with per-column circular exclusion.
//
// N equal-width columns span the viewport. Columns whose footprint intersects
// the exclusion circle get a vertical gap — items sit above AND below the model.
// Portrait items that are too tall to fit in a gap-column section are routed to
// outer (full-height) columns instead, preventing any overflow.
export function buildConfigs(vw: number, vh: number, items: PlaygroundItem[]): PlaygroundCardConfig[] {
  const rem         = parseFloat(getComputedStyle(document.documentElement).fontSize)
  const GAP         = 20
  const LABEL_H     = 22
  const marginX     = 44
  const marginTop    = rem * 7    // clears header: 3rem top + ~2.75rem text + gap
  const marginBottom = rem * 6    // clears footer: 4rem bottom + 1rem text + gap

  const R  = Math.min(vw, vh) * 0.08
  const ex = vw / 2
  const ey = vh / 2

  const n     = items.length
  const ars   = items.map(it => it.aspectRatio ?? 1)
  const avgAR = ars.reduce((s, ar) => s + ar, 0) / n
  const zoneH = vh - marginTop - marginBottom

  // Equal-area sizing: thumbW = S*√AR, thumbH = S/√AR → area = S² for every card.
  // Use √avgAR for the column-count estimate (average card height ≈ S/√avgAR).
  const sqrtAvgAR = Math.sqrt(avgAR)
  let N = 8, cardW = 0
  for (let nc = 6; nc <= 10; nc++) {
    const w = (vw - 2 * marginX - (nc - 1) * GAP) / nc
    if ((w / sqrtAvgAR + LABEL_H + GAP) * (n / nc) <= zoneH * 0.88) {
      N = nc; cardW = w; break
    }
  }
  if (!cardW) {
    N = 10
    cardW = (vw - 2 * marginX - (N - 1) * GAP) / N
  }

  interface ColInfo {
    cx: number; gapTop: number | null; gapBottom: number | null
    topAvail: number; botAvail: number; items: number[]
  }

  const cols: ColInfo[] = []
  for (let c = 0; c < N; c++) {
    const xLeft    = marginX + c * (cardW + GAP)
    const colCx    = xLeft + cardW / 2
    const nearX    = Math.max(xLeft, Math.min(ex, xLeft + cardW))
    const nearDist = Math.abs(nearX - ex)

    let gapTop: number | null = null, gapBottom: number | null = null
    let topAvail = zoneH, botAvail = 0

    if (nearDist < R) {
      const half = Math.sqrt(R * R - nearDist * nearDist)
      gapTop    = Math.max(marginTop,         ey - half)
      gapBottom = Math.min(vh - marginBottom, ey + half)
      topAvail  = Math.max(0, gapTop - marginTop)
      botAvail  = Math.max(0, vh - marginBottom - gapBottom)
    }

    cols.push({ cx: colCx, gapTop, gapBottom, topAvail, botAvail, items: [] })
  }

  // Per-card visual dimensions with equal-area scaling: thumbW = S*√AR, thumbH = S/√AR.
  // Cap thumbW to the column pitch so adjacent landscape cards never visually overlap.
  // For capped cards the true AR is still preserved (thumbH = cappedW / AR),
  // only the area is slightly reduced for very wide cards.
  const sqrtArs = ars.map(ar => Math.sqrt(ar))
  const pitch   = cardW + GAP

  function visW(itemIdx: number): number {
    return Math.min(cardW * sqrtArs[itemIdx], pitch - 2)
  }

  function cardH(itemIdx: number): number {
    return visW(itemIdx) / ars[itemIdx]
  }

  // Returns true if the item can fit in at least one section of the column.
  function canFit(itemIdx: number, col: ColInfo): boolean {
    if (col.gapTop === null) return true
    const itemH = cardH(itemIdx) + LABEL_H
    return itemH <= col.topAvail || itemH <= col.botAvail
  }

  // Greedy: prefer columns where the item actually fits in a section.
  // Add a small left/right alternating tiebreaker so cards spread evenly
  // across both sides of the center model rather than clustering on one side.
  const remaining = cols.map(c => c.gapTop === null ? zoneH : c.topAvail + c.botAvail)
  let lastSide = -1  // 0 = left of center, 1 = right of center
  for (let i = 0; i < n; i++) {
    let best = -1, bestScore = -Infinity
    for (let c = 0; c < N; c++) {
      if (!canFit(i, cols[c]) || remaining[c] <= 0) continue
      const side = cols[c].cx > ex ? 1 : 0
      const sideBonus = (lastSide === -1 || side !== lastSide) ? 0.5 : 0
      const score = remaining[c] + sideBonus
      if (score > bestScore) { bestScore = score; best = c }
    }
    if (best === -1) {
      let fallback = -Infinity
      for (let c = 0; c < N; c++) {
        const side = cols[c].cx > ex ? 1 : 0
        const sideBonus = (lastSide === -1 || side !== lastSide) ? 0.5 : 0
        const score = remaining[c] + sideBonus
        if (score > fallback) { fallback = score; best = c }
      }
    }
    if (best === -1) best = 0
    cols[best].items.push(i)
    remaining[best] -= cardH(i) + LABEL_H + GAP
    lastSide = cols[best].cx > ex ? 1 : 0
  }

  const configs: PlaygroundCardConfig[] = new Array(n)

  // Place group within [yStart, yEnd]. Each card: thumbW = S*√AR, thumbH = S/√AR → same area.
  function placeGroup(group: number[], yStart: number, yEnd: number, colCx: number) {
    if (!group.length || yEnd <= yStart) return
    const placed: number[] = []
    let usedH = 0
    for (const idx of group) {
      const itemH = cardH(idx) + LABEL_H
      const gap   = placed.length > 0 ? GAP : 0
      if (usedH + gap + itemH > yEnd - yStart + 1) break
      placed.push(idx)
      usedH += gap + itemH
    }
    if (!placed.length) return
    const total  = placed.reduce((s, idx) => s + cardH(idx) + LABEL_H + GAP, 0) - GAP
    const offset = Math.max(0, (yEnd - yStart - total) / 2)
    let y = yStart + offset
    for (const idx of placed) {
      const h = cardH(idx)
      const w = visW(idx)
      configs[idx] = {
        x: colCx / vw * 100,
        y: (y + (h + LABEL_H) / 2) / vh * 100,
        thumbW: Math.round(w), thumbH: Math.round(h), aspectRatio: ars[idx],
      }
      y += h + LABEL_H + GAP
    }
  }

  for (const col of cols) {
    if (!col.items.length) continue
    if (col.gapTop === null) {
      placeGroup(col.items, marginTop, vh - marginBottom, col.cx)
    } else {
      let usedTop = 0, split = 0
      for (let k = 0; k < col.items.length; k++) {
        const itemH = cardH(col.items[k]) + LABEL_H
        const gap   = split > 0 ? GAP : 0
        if (usedTop + gap + itemH > col.topAvail) break
        usedTop += gap + itemH; split = k + 1
      }
      placeGroup(col.items.slice(0, split), marginTop,      col.gapTop,        col.cx)
      placeGroup(col.items.slice(split),    col.gapBottom!, vh - marginBottom, col.cx)
    }
  }

  return configs
}

// ─── Aspect-ratio resolver ────────────────────────────────────────────────────
// Reads the real w/h from the poster image (fast, always available when set)
// or from video metadata as fallback, before buildConfigs runs — so placement
// is computed with the actual card shape and cards never overlap post-load.

export function resolveAspectRatio(item: PlaygroundItem): Promise<number> {
  if (item.aspectRatio !== undefined) return Promise.resolve(item.aspectRatio)

  const giveUp = new Promise<number>(r => setTimeout(() => r(1), 3000))

  const detect = new Promise<number>(resolve => {
    if (item.poster) {
      const img = new window.Image()
      img.onload  = () => resolve((img.naturalWidth / img.naturalHeight) || 1)
      img.onerror = () => resolve(1)
      img.src = item.poster
    } else if (item.mp4 || item.webm) {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => resolve((v.videoWidth / v.videoHeight) || 1)
      v.onerror = () => resolve(1)
      v.src = (item.mp4 ?? item.webm)!
    } else {
      resolve(1)
    }
  })

  return Promise.race([detect, giveUp])
}
