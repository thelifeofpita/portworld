// CPU profile of specific interactions, attributed to source files and lines.
// Complements measure-frames.mjs (which says WHICH scenario misses 60fps) by
// saying WHAT script spends the frame budget there.
//
// Build with source maps so minified positions can be mapped back:
//   PERF_SOURCEMAPS=1 npm run build && python3 -m http.server 3002 --directory out
//   node scripts/profile-frames.mjs                        # all scenarios, 4x CPU
//   PROFILE_ONLY=m-reroll PROFILE_CPU=4 node scripts/profile-frames.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3002'
const CPU = Number(process.env.PROFILE_CPU || 4)
const only = process.env.PROFILE_ONLY ? new RegExp(process.env.PROFILE_ONLY) : null
const wait = ms => new Promise(r => setTimeout(r, ms))

const desktop = { viewport: { width: 1440, height: 900 } }
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

const nav = (page, section) => page.locator('nav[aria-label="Sections"]').getByText(section, { exact: true }).first().dispatchEvent('click')
const byline = page => page.locator('[aria-label^="THELIFEOFPITA"]').first().dispatchEvent('click')

// Each scenario: context options, setup (not profiled), then the profiled action.
const scenarios = [
  { name: 'projects-idle', context: desktop, setup: async page => { await nav(page, 'Projects'); await wait(10000) }, run: () => wait(4000) },
  { name: 'projects-hover', context: desktop, setup: async page => { await nav(page, 'Projects'); await wait(10000) }, run: async page => {
    const slots = page.locator('[class*="bigProjectModelSlot"]')
    for (let i = 0; i < await slots.count(); i++) {
      const b = await slots.nth(i).boundingBox(); if (!b) continue
      for (let k = 0; k < 12; k++) { await page.mouse.move(b.x + b.width * (0.2 + 0.05 * k), b.y + b.height / 2); await wait(30) }
    }
  } },
  { name: 'enter-about', context: desktop, run: async page => { await nav(page, 'About Me'); await wait(3000) } },
  { name: 'm-enter-projects', context: mobile, run: async page => { await nav(page, 'Projects'); await wait(4000) } },
  { name: 'm-reroll', context: mobile, run: async page => { await byline(page); await wait(4000) } },
]

const maps = new Map()
function traceMapFor(url) {
  if (maps.has(url)) return maps.get(url)
  let map = null
  try {
    const path = new URL(url).pathname
    if (path.endsWith('.js')) map = new TraceMap(fs.readFileSync(`out${path}.map`, 'utf8'))
  } catch { /* no map for this script */ }
  maps.set(url, map)
  return map
}

function attribute(callFrame) {
  const { url, lineNumber, columnNumber, functionName } = callFrame
  if (!url) return functionName || '(native)'
  const map = traceMapFor(url)
  if (!map) return `${functionName || '(anonymous)'} ${url.split('/').pop()}:${lineNumber + 1}`
  const pos = originalPositionFor(map, { line: lineNumber + 1, column: columnNumber })
  const source = (pos.source ?? '?').replace(/^.*\[project\]\//, '').replace(/^turbopack:\/\/\//, '').replace(/ \[.*$/, '')
  return `${pos.name || functionName || '(anonymous)'} ${source}:${pos.line}`
}

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist'] })
try {
  for (const scenario of scenarios) {
    if (only && !only.test(scenario.name)) continue
    const context = await browser.newContext(scenario.context)
    const page = await context.newPage()
    await page.addInitScript(() => { let s = 42; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) })
    const cdp = await context.newCDPSession(page)
    await page.goto(`${BASE}/?perfAudit=1`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.getByRole('status', { name: 'Loading' }).waitFor({ state: 'hidden', timeout: 120000 })
    await wait(1500)
    await page.mouse.move(scenario.context.viewport.width - 8, scenario.context.viewport.height - 8)
    await scenario.setup?.(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('Profiler.start')
    const started = Date.now()
    await scenario.run(page)
    const { profile } = await cdp.send('Profiler.stop')
    const wall = Date.now() - started
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

    const nodes = new Map(profile.nodes.map(n => [n.id, n]))
    const selfMicros = new Map()
    profile.samples.forEach((id, i) => selfMicros.set(id, (selfMicros.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)))
    const byFunction = new Map(), byFile = new Map()
    let total = 0
    for (const [id, micros] of selfMicros) {
      const frame = nodes.get(id).callFrame
      if (frame.functionName === '(idle)') continue
      total += micros
      const key = attribute(frame)
      byFunction.set(key, (byFunction.get(key) ?? 0) + micros)
      const file = key.includes(' ') ? key.slice(key.indexOf(' ') + 1).replace(/:\d+$/, '') : key
      byFile.set(file, (byFile.get(file) ?? 0) + micros)
    }
    const fmt = micros => `${(micros / 1000).toFixed(0).padStart(6)}ms ${(100 * micros / total).toFixed(1).padStart(5)}%`
    console.log(`\n=== ${scenario.name}  (${CPU}x CPU, ${wall}ms wall, ${(total / 1000).toFixed(0)}ms busy script/native)`)
    console.log('  by file:')
    for (const [file, micros] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${fmt(micros)}  ${file}`)
    console.log('  by function:')
    for (const [key, micros] of [...byFunction].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`    ${fmt(micros)}  ${key}`)
    await context.close()
  }
} finally {
  await browser.close()
}
