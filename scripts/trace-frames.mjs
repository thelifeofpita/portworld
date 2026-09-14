// Chrome performance traces of individual interactions, summarised per thread,
// to attribute frame time that never shows up as script: style, layout, paint,
// image and video decode, compositing and GPU tasks. Each scenario gets a fresh
// context so one cannot warm or starve the next. Needs a production build
// served on TEST_BASE_URL (see scripts/measure-frames.mjs).
//   node scripts/trace-frames.mjs
//   TRACE_ONLY='surf|m-landing' node scripts/trace-frames.mjs
import { chromium } from 'playwright'
import fs from 'node:fs/promises'

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3002'
const OUT = process.env.TRACE_DIR || '/tmp'
const only = process.env.TRACE_ONLY ? new RegExp(process.env.TRACE_ONLY) : null
// Kept deliberately small: with cc/viz/blink/frame categories a few seconds of
// project hover produced a trace larger than Node can read as one string.
const categories = ['devtools.timeline', 'toplevel', 'gpu', 'media', ...(process.env.TRACE_DETAIL ? ['disabled-by-default-devtools.timeline'] : [])]
const wait = ms => new Promise(r => setTimeout(r, ms))

const desktop = { viewport: { width: 1440, height: 900 } }
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

const nav = (page, section) => page.locator('nav[aria-label="Sections"]').getByText(section, { exact: true }).first().dispatchEvent('click')
const wheel = async (page, ms, dy = 120) => {
  const end = Date.now() + ms
  let dir = 1
  while (Date.now() < end) { for (let i = 0; i < 12 && Date.now() < end; i++) { await page.mouse.wheel(0, dy * dir); await wait(40) } dir = -dir }
}
const openFirstProject = page => openProject(page, 0)
// Project slots render in DOM order: left column 0-2, right column 3-5.
async function openProject(page, index) {
  await nav(page, 'Projects')
  await wait(8000)
  const b = await page.locator('[class*="bigProjectModelSlot"]').nth(index).boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await wait(400)
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  await wait(4000)
  await page.mouse.move(720, 450)
}

// setup runs untraced; trace runs traced. Default trace is 3s of idling.
const scenarios = [
  { name: 'projects-idle', context: desktop, setup: async page => { await nav(page, 'Projects'); await wait(12000) } },
  { name: 'project-hover', context: desktop, setup: async page => { await nav(page, 'Projects'); await wait(12000) }, trace: async page => {
    const b = await page.locator('[class*="bigProjectModelSlot"]').nth(1).boundingBox()
    for (let i = 0; i < 60; i++) { await page.mouse.move(b.x + b.width * (0.3 + 0.4 * Math.abs(Math.sin(i / 15))), b.y + b.height / 2); await wait(30) }
  } },
  { name: 'surf-scroll', context: desktop, setup: openFirstProject, trace: page => wheel(page, 3500) },
  { name: 'surf-to-duolingo', context: desktop, setup: openFirstProject, trace: async page => {
    await page.getByRole('button', { name: 'Next project' }).first().dispatchEvent('click')
    await wait(3000)
  } },
  { name: 'playground-enter', context: desktop, trace: async page => { await nav(page, 'Playground'); await wait(3000) } },
  { name: 'playground-idle', context: desktop, setup: async page => { await nav(page, 'Playground'); await wait(9000) } },
  { name: 'collection-close', context: desktop, setup: async page => {
    await nav(page, 'Playground'); await wait(8000)
    await page.locator('[aria-label="Playground"]').getByRole('button', { name: /^Open / }).first().click({ timeout: 5000 })
    await wait(4000)
  }, trace: async page => {
    await page.locator('[role="dialog"]:not([inert]) button[aria-label="Close collection"]').first().click({ timeout: 3000 })
    await wait(2500)
  } },
  { name: 'm-landing-idle', context: mobile, trace: () => wait(4000) },
  // Whole-page scrolls through a case study, top to bottom.
  { name: 'verified-scroll', context: desktop, setup: page => openProject(page, 2), trace: async page => { for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 140); await wait(60) } } },
  { name: 'bis-scroll', context: desktop, setup: page => openProject(page, 5), trace: async page => { for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 140); await wait(60) } } },
]

// Leaf-ish main-thread work worth separating from the RunTask wrappers.
const MAIN_THREAD_WORK = ['FunctionCall', 'EvaluateScript', 'v8.run', 'UpdateLayoutTree', 'RecalculateStyles', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'Decode Image', 'ImageDecodeTask', 'HitTest', 'ParseHTML', 'IntersectionObserverController::computeIntersections', 'MajorGC', 'MinorGC']

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist'] })
try {
  for (const scenario of scenarios) {
    if (only && !only.test(scenario.name)) continue
    const context = await browser.newContext(scenario.context)
    const page = await context.newPage()
    await page.addInitScript(() => { let s = 42; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) })
    await page.goto(`${BASE}/?perfAudit=1`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.getByRole('status', { name: 'Loading' }).waitFor({ state: 'hidden', timeout: 120000 })
    await wait(1500)
    await page.mouse.move(scenario.context.viewport.width - 8, scenario.context.viewport.height - 8)
    await scenario.setup?.(page)

    const path = `${OUT}/trace-${scenario.name}.json`
    await browser.startTracing(page, { path, categories })
    await (scenario.trace ? scenario.trace(page) : wait(3000))
    await browser.stopTracing()
    await context.close()

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
    const perSecond = micros => (micros / 1000 / seconds).toFixed(1)
    // Inclusive durations (children not subtracted), as ms per wall second.
    console.log(`\n=== ${scenario.name} (${seconds.toFixed(1)}s traced, inclusive ms per wall second)`)
    const rows = [...threads]
      .map(([key, totals]) => ({ key, name: threadNames.get(key) ?? key, totals, top: [...totals].sort((a, b) => b[1] - a[1]) }))
      .filter(r => r.top.length && r.top[0][1] / 1000 / seconds > 5)
      .sort((a, b) => b.top[0][1] - a.top[0][1])
      .slice(0, 7)
    // Worst gaps between animation frames on the page's own main thread, with
    // what every thread spent inside each gap (events clipped to the window).
    const pageMain = [...threadNames].filter(([, n]) => n === 'CrRendererMain').map(([k]) => k)
      .map(key => ({ key, frames: traceEvents.filter(e => `${e.pid}:${e.tid}` === key && e.name === 'FireAnimationFrame' && e.ph === 'X').map(e => e.ts).sort((a, b) => a - b) }))
      .sort((a, b) => b.frames.length - a.frames.length)[0]
    if (pageMain && pageMain.frames.length > 2) {
      const gaps = []
      for (let i = 1; i < pageMain.frames.length; i++) if (pageMain.frames[i] - pageMain.frames[i - 1] > 50000) gaps.push([pageMain.frames[i - 1], pageMain.frames[i]])
      gaps.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))
      for (const [g0, g1] of gaps.slice(0, 3)) {
        const inside = new Map()
        for (const e of traceEvents) {
          if (e.ph !== 'X' || typeof e.dur !== 'number') continue
          const overlap = Math.min(g1, e.ts + e.dur) - Math.max(g0, e.ts)
          if (overlap <= 0) continue
          const key = `${threadNames.get(`${e.pid}:${e.tid}`) ?? '?'}:${e.name}`
          inside.set(key, (inside.get(key) ?? 0) + overlap)
        }
        const top = [...inside].filter(([k]) => !/RunTask|ThreadControllerImpl|Scheduler::|Receive mojo|SimpleWatcher|ThreadPool_RunTask/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 10)
        console.log(`  gap ${((g1 - g0) / 1000).toFixed(0)}ms: ` + top.map(([k, d]) => `${k}=${(d / 1000).toFixed(0)}`).join('  '))
      }
    }
    for (const r of rows) {
      console.log(`  [${r.name}] ` + r.top.slice(0, 8).map(([n, d]) => `${n}=${perSecond(d)}`).join('  '))
      if (r.name === 'CrRendererMain') {
        const work = MAIN_THREAD_WORK.filter(n => r.totals.has(n)).map(n => `${n}=${perSecond(r.totals.get(n))}`)
        console.log(`    main-thread work: ${work.join('  ')}`)
      }
    }
  }
} finally {
  await browser.close()
}
