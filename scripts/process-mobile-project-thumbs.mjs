// Second half of the mobile-project-thumbnail pipeline (see
// capture-mobile-project-thumbs.mjs for the first). The raw capture already
// has a REAL alpha channel (no chroma-key color involved — see the capture
// route's gl.alpha:true) — this just isolates the largest connected opaque
// blob (a safety net in case any stray reflection/AA fringe sits elsewhere
// in the generous capture margin), trims to its bounds, and writes an
// optimized WebP into public/projects/mobile-thumbs/.
//
// Sizing: NOT a formula. The trimmed image's CSS size (its pixel dimensions
// divided by the capture's device-scale-factor) as a fraction of the slot
// it was captured from (recorded by capture-mobile-project-thumbs.mjs) is
// exactly how big that model actually rendered live, relative to its own
// slot — so displaying it at that same fraction on the real site (width:
// calc(X% of slot), height:auto) reproduces the live size exactly, no
// per-project tuning or "equal visual weight" math needed.
//
// Usage: node scripts/process-mobile-project-thumbs.mjs
import sharp from 'sharp'
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const IN_DIR = '/tmp/mobile-thumb-raw'
const OUT_DIR = 'public/projects/mobile-thumbs'
// Not imported at runtime — content/projectsContent.ts's mobileThumbWidthPct
// field is the hand-baked source of truth (matches that file's existing
// convention of being where per-project mobile presentation is curated,
// e.g. accentColor/thumbScale). This is just a scratch reference to copy
// updated values from after re-running the capture pipeline.
const META_PATH = '/tmp/mobile-thumb-width-pct.json'
// Alpha below this is treated as background. Real WebGL alpha is either
// ~0 (nothing drawn) or ~255 (drawn), with a thin genuinely-antialiased
// transition band at silhouette edges — no despill/color classification
// needed at all now that the source has true transparency.
const ALPHA_THRESHOLD = 12

const PROJECTS = [
  'surf-the-spike',
  'duolingo',
  'verified',
  'hat-twix',
  'pick-a-side',
  'back-in-smoothly',
]

// 4-connectivity BFS labeling — returns the pixel-index list of the largest
// component among pixels with alpha > ALPHA_THRESHOLD.
function largestComponent(opaque, width, height) {
  const visited = new Uint8Array(width * height)
  let best = null
  const stack = new Int32Array(width * height)
  for (let start = 0; start < opaque.length; start++) {
    if (!opaque[start] || visited[start]) continue
    let top = 0
    stack[top++] = start
    visited[start] = 1
    const members = [start]
    while (top > 0) {
      const p = stack[--top]
      const x = p % width, y = (p / width) | 0
      const neighbors = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ]
      for (const n of neighbors) {
        if (n < 0 || visited[n] || !opaque[n]) continue
        visited[n] = 1
        stack[top++] = n
        members.push(n)
      }
    }
    if (!best || members.length > best.length) best = members
  }
  return best ?? []
}

// The model is centred in its slot but its centre pixel can still be
// transparent (the Twix bar's gap, the fries carton's notch), so walk outward
// in rings until an opaque pixel is found.
function nearestOpaque(opaque, width, height, sx, sy) {
  const maxR = Math.max(width, height)
  for (let r = 0; r < maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = sx + dx, y = sy + dy
        if (x < 0 || y < 0 || x >= width || y >= height) continue
        const i = y * width + x
        if (opaque[i]) return i
      }
    }
  }
  return -1
}

// 4-connectivity BFS from one seed pixel.
function componentContaining(opaque, width, height, seed) {
  const visited = new Uint8Array(width * height)
  const stack = new Int32Array(width * height)
  let top = 0
  stack[top++] = seed
  visited[seed] = 1
  const members = [seed]
  while (top > 0) {
    const p = stack[--top]
    const x = p % width, y = (p / width) | 0
    const neighbors = [
      x > 0 ? p - 1 : -1,
      x < width - 1 ? p + 1 : -1,
      y > 0 ? p - width : -1,
      y < height - 1 ? p + width : -1,
    ]
    for (const nb of neighbors) {
      if (nb < 0 || visited[nb] || !opaque[nb]) continue
      visited[nb] = 1
      stack[top++] = nb
      members.push(nb)
    }
  }
  return members
}

async function processOne(name) {
  const inPath = `${IN_DIR}/${name}.png`
  const meta = JSON.parse(await readFile(`${IN_DIR}/${name}.json`, 'utf8'))
  const img = sharp(inPath).ensureAlpha()
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const n = width * height
  const opaque = new Uint8Array(n)
  for (let i = 0; i < n; i++) opaque[i] = data[i * channels + 3] > ALPHA_THRESHOLD ? 1 : 0

  // Prefer the component the slot's own centre lands in, not the biggest one.
  // Desktop's six slots sit close enough together that a crop around one model
  // can contain part of a neighbour, and "largest blob" then picks the wrong
  // object — that is how Pick a Side once came out landscape, having latched
  // onto the model diagonally above it. Seeding from the slot centre selects
  // the intended model by construction. Falls back to the largest component
  // when the capture step didn't record a seed.
  const keep = new Uint8Array(n)
  const seed = Number.isFinite(meta.seedX) && Number.isFinite(meta.seedY)
    ? nearestOpaque(opaque, width, height, Math.round(meta.seedX), Math.round(meta.seedY))
    : -1
  const members = seed >= 0
    ? componentContaining(opaque, width, height, seed)
    : largestComponent(opaque, width, height)
  for (const i of members) keep[i] = 1

  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let i = 0; i < n; i++) {
    if (!keep[i]) { data[i * channels + 3] = 0; continue }
    const x = i % width, y = (i / width) | 0
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (maxX < minX) throw new Error(`${name}: no foreground found`)

  // Small pad so the trim doesn't shave antialiased edge pixels.
  const pad = 6
  const cropX = Math.max(0, minX - pad)
  const cropY = Math.max(0, minY - pad)
  const cropW = Math.min(width, maxX + pad) - cropX
  const cropH = Math.min(height, maxY + pad) - cropY

  await mkdir(OUT_DIR, { recursive: true })
  const cropped = () => sharp(data, { raw: { width, height, channels } })
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })

  // Two widths, so a small phone doesn't download pixels it can't resolve.
  // The capture is deliberately oversized (see SLOT_SIZE in the capture
  // script); at full size the six thumbs come to ~480KB, which is real weight
  // on a page that targets 90+ on mobile Lighthouse. The half-width variant
  // covers ordinary phones and the full one covers large 3x screens. Same
  // pattern as content/campaign-page-media.json's 480w/960w/1600w sets.
  // Filenames carry a content hash, like /generated/'s assets already do
  // (back-in-smoothly-qr-3166e307aef6.svg and friends). next.config.ts serves
  // /projects/:path* as `max-age=31536000, immutable`, which tells browsers
  // never to revalidate — so a re-capture under a stable filename is invisible
  // to anyone who has already loaded the page, and NOT fixable with a hard
  // reload (immutable means the browser does not even ask). Hashing makes the
  // URL change whenever the pixels change, which is what that cache header
  // assumes is true.
  const halfW = Math.round(cropW / 2)
  const fullBuf = await cropped().webp({ quality: 92 }).toBuffer()
  const halfBuf = await cropped().resize({ width: halfW }).webp({ quality: 92 }).toBuffer()
  const hash = createHash('sha1').update(fullBuf).digest('hex').slice(0, 12)

  // Drop earlier hashes of this piece so the directory doesn't accumulate.
  for (const f of await readdir(OUT_DIR)) {
    if (new RegExp(`^${name}-[0-9a-f]{12}(@half)?\\.webp$`).test(f)) await rm(`${OUT_DIR}/${f}`)
    if (f === `${name}.webp` || f === `${name}@half.webp`) await rm(`${OUT_DIR}/${f}`)
  }

  const outPath = `${OUT_DIR}/${name}-${hash}.webp`
  const halfPath = `${OUT_DIR}/${name}-${hash}@half.webp`
  await writeFile(outPath, fullBuf)
  await writeFile(halfPath, halfBuf)

  // The measurement that actually matters: this crop's CSS width (its
  // device pixels / the capture's DSF) as a fraction of the slot it was
  // captured from — i.e. exactly how wide the live model rendered relative
  // to its own slot. No trimming margin was added around the true content
  // bounds (just the small antialiasing pad above), so this is the model's
  // real footprint, not an inflated one.
  const cropCssWidth = cropW / meta.deviceScaleFactor
  const widthPct = (cropCssWidth / meta.slotWidth) * 100
  // The crop's own aspect ratio. The site displays each thumb at widthPct of
  // its slot with height:auto, so this is what decides how far the image
  // actually overflows its square slot vertically — which is what the grid
  // has to leave room for. Emitted rather than eyeballed, because hand-tuned
  // gutters are what let these images collide in the first place.
  const aspect = cropW / cropH
  const pub = p => p.replace(/^public/, '')
  const srcSet = `${pub(halfPath)} ${halfW}w, ${pub(outPath)} ${cropW}w`
  const src = pub(outPath)
  console.log(`wrote ${outPath} (${cropW}x${cropH}) + @half (${halfW}w) — widthPct=${widthPct.toFixed(1)}% aspect=${aspect.toFixed(3)} heightPct=${(widthPct / aspect).toFixed(1)}%`)
  return { name, widthPct, aspect, src, srcSet, width: cropW, height: cropH }
}

const results = []
for (const name of PROJECTS) {
  results.push(await processOne(name))
}
const meta = {}
for (const { name, widthPct, aspect, src, srcSet, width, height } of results) meta[name] = {
  widthPct: Math.round(widthPct * 10) / 10,
  aspect:   Math.round(aspect * 1000) / 1000,
  src,
  srcSet,
  width,
  height,
}
await writeFile(META_PATH, JSON.stringify(meta, null, 2) + '\n')
console.log(`wrote ${META_PATH}`, meta)
