// Screenshot parity between two builds of the site (e.g. main vs a branch),
// same seeded randomness and viewport, for the key states. Writes each pair
// side by side with a difference heat map, and prints the share of pixels
// that differ. Video frames and 3D motion never match exactly, so the images
// are the evidence; the percentages only point at where to look.
//
//   PORT=3003 ROOT=<main>/out node scripts/serve-static.mjs   # reference
//   node scripts/serve-static.mjs                              # candidate, :3002
//   node scripts/compare-visual.mjs
import { chromium } from 'playwright'
import sharp from 'sharp'
import fs from 'node:fs/promises'

const A = process.env.COMPARE_A || 'http://127.0.0.1:3003'
const B = process.env.COMPARE_B || 'http://127.0.0.1:3002'
const OUT = process.env.COMPARE_OUT || 'reports/performance/visual'
const wait = ms => new Promise(r => setTimeout(r, ms))

const desktop = { viewport: { width: 1440, height: 900 } }
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const nav = (page, section) => page.locator('nav[aria-label="Sections"]').getByText(section, { exact: true }).first().dispatchEvent('click')

const states = [
  { name: 'desktop-landing', context: desktop, go: () => wait(2500) },
  { name: 'desktop-projects', context: desktop, go: async page => { await nav(page, 'Projects'); await wait(9000) } },
  { name: 'desktop-about', context: desktop, go: async page => { await nav(page, 'About Me'); await wait(5000) } },
  { name: 'desktop-playground', context: desktop, go: async page => { await nav(page, 'Playground'); await wait(8000) } },
  { name: 'desktop-surf-case', context: desktop, go: async page => {
    await nav(page, 'Projects'); await wait(9000)
    const b = await page.locator('[class*="bigProjectModelSlot"]').nth(0).boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await wait(400)
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await wait(5000)
    await page.mouse.move(8, 8); await wait(1500)
  } },
  { name: 'mobile-landing', context: mobile, go: () => wait(2500) },
  { name: 'mobile-projects', context: mobile, go: async page => { await nav(page, 'Projects'); await wait(6000) } },
]

async function capture(browser, base, state) {
  const context = await browser.newContext(state.context)
  const page = await context.newPage()
  // Same seed on both sides: palette, layout shuffles and orbit scatter match.
  await page.addInitScript(() => { let s = 42; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) })
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.getByRole('status', { name: 'Loading' }).waitFor({ state: 'hidden', timeout: 120000 })
  const { width, height } = state.context.viewport
  await page.mouse.move(width - 8, height - 8)
  await state.go(page)
  const png = await page.screenshot({ timeout: 15000 })
  await context.close()
  return png
}

await fs.mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-position=0,0', '--ignore-gpu-blocklist'] })
try {
  for (const state of states) {
    const [a, b] = [await capture(browser, A, state), await capture(browser, B, state)]
    const ra = await sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const rb = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const { width, height, channels } = ra.info
    const heat = Buffer.alloc(width * height * 4)
    let differing = 0
    for (let i = 0, p = 0; i < ra.data.length; i += channels, p += 4) {
      const d = Math.max(Math.abs(ra.data[i] - rb.data[i]), Math.abs(ra.data[i + 1] - rb.data[i + 1]), Math.abs(ra.data[i + 2] - rb.data[i + 2]))
      if (d > 24) differing++
      heat[p] = Math.min(255, d * 4); heat[p + 1] = 0; heat[p + 2] = 0; heat[p + 3] = 255
    }
    const heatPng = await sharp(heat, { raw: { width, height, channels: 4 } }).png().toBuffer()
    // Composite at full size first: sharp applies a resize before composite in
    // one pipeline, which would shrink the base under the full-size overlays.
    const sideBySide = await sharp({ create: { width: width * 3, height, channels: 4, background: '#000' } })
      .composite([{ input: a, left: 0, top: 0 }, { input: b, left: width, top: 0 }, { input: heatPng, left: width * 2, top: 0 }])
      .png().toBuffer()
    await sharp(sideBySide).resize({ width: Math.min(width * 3, 2400) }).png().toFile(`${OUT}/${state.name}.png`)
    console.log(`${state.name.padEnd(20)} ${(100 * differing / (width * height)).toFixed(2)}% of pixels differ → ${OUT}/${state.name}.png (reference | candidate | difference)`)
  }
} finally {
  await browser.close()
}
