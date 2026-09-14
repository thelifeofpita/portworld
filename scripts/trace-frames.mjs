// Chrome performance trace of settled states and project hover, summarised per
// thread, to attribute frame time that never shows up as script (raster,
// compositing, video decode, GPU tasks). Needs a production build served on
// TEST_BASE_URL (see scripts/measure-frames.mjs).
//   node scripts/trace-frames.mjs
import { chromium } from 'playwright'
import fs from 'node:fs/promises'

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3002'
const OUT = process.env.TRACE_DIR || '/tmp'
const categories = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'toplevel', 'gpu', 'cc', 'viz', 'media', 'blink']
const wait = ms => new Promise(r => setTimeout(r, ms))

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.addInitScript(() => { let s = 42; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) })
  await page.goto(`${BASE}/?perfAudit=1`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('status', { name: 'Loading' }).waitFor({ state: 'hidden', timeout: 120000 })
  await page.mouse.move(1432, 892)
  const nav = s => page.locator('nav[aria-label="Sections"]').getByText(s, { exact: true }).first().dispatchEvent('click')

  const scenarios = [
    { name: 'projects-idle', before: async () => { await nav('Projects'); await wait(12000) } },
    { name: 'project-hover', during: async () => {
      const b = await page.locator('[class*="bigProjectModelSlot"]').nth(1).boundingBox()
      for (let i = 0; i < 90; i++) { await page.mouse.move(b.x + b.width * (0.3 + 0.4 * Math.abs(Math.sin(i / 15))), b.y + b.height / 2); await wait(30) }
    } },
    { name: 'playground-idle', before: async () => { await page.mouse.move(1432, 892); await nav('Playground'); await wait(9000) } },
  ]

  for (const { name, before, during } of scenarios) {
    await before?.()
    const path = `${OUT}/trace-${name}.json`
    await browser.startTracing(page, { path, categories })
    if (during) await during(); else await wait(3000)
    await browser.stopTracing()

    const { traceEvents } = JSON.parse(await fs.readFile(path, 'utf8'))
    const threadNames = new Map()
    for (const e of traceEvents) {
      const threadName = e.args?.data?.threadName ?? (e.cat === '__metadata' ? e.args?.name : undefined)
      if (threadName) threadNames.set(`${e.pid}:${e.tid}`, threadName)
    }
    const threads = new Map()
    let t0 = Infinity, t1 = 0
    for (const e of traceEvents) {
      if (e.ph !== 'X' || typeof e.dur !== 'number') continue
      t0 = Math.min(t0, e.ts); t1 = Math.max(t1, e.ts + e.dur)
      const key = `${e.pid}:${e.tid}`
      if (!threads.has(key)) threads.set(key, new Map())
      const totals = threads.get(key)
      totals.set(e.name, (totals.get(e.name) ?? 0) + e.dur)
    }
    const seconds = (t1 - t0) / 1e6
    // Inclusive durations (children are not subtracted), expressed as
    // milliseconds per second of wall time, so nested events overlap.
    console.log(`\n=== ${name} (${seconds.toFixed(1)}s traced, inclusive ms per wall second)`)
    const rows = [...threads]
      .map(([key, totals]) => ({ name: threadNames.get(key) ?? key, top: [...totals].sort((a, b) => b[1] - a[1]) }))
      .filter(r => r.top.length && r.top[0][1] / 1000 / seconds > 5)
      .sort((a, b) => b.top[0][1] - a.top[0][1])
      .slice(0, 8)
    for (const r of rows) console.log(`  [${r.name}] ` + r.top.slice(0, 9).map(([n, d]) => `${n}=${(d / 1000 / seconds).toFixed(1)}`).join('  '))
  }
} finally {
  await browser.close()
}
