// Frame-pacing harness: walks the site through every interaction that matters
// (idle, drag, zone switches, project hover/expand, case pages, Playground,
// palette reroll, mobile scrolling) and records, per scenario, rAF interval
// percentiles, dropped frames, Long Animation Frames (with script attribution)
// and the ?perfAudit=1 counters/GPU time from components/canvas/PostProcessing.tsx.
//
// Serve a production build first (static export → ./out), e.g.
//   npm run build && python3 -m http.server 3002 --directory out
// then:
//   node scripts/measure-frames.mjs                       # chrome, all profiles
//   PERF_ENGINE=webkit node scripts/measure-frames.mjs
//   FRAMES_PROFILE=mobile PERF_LABEL=after node scripts/measure-frames.mjs
//
// Chrome runs headed by default: headless Chrome may composite through
// software GL, which distorts GPU-bound frame times (FRAMES_HEADLESS=1 opts in).
import { chromium, webkit } from 'playwright'
import fs from 'node:fs/promises'

const BASE    = process.env.TEST_BASE_URL || 'http://localhost:3002'
const engine  = process.env.PERF_ENGINE || 'chrome'
const label   = process.env.PERF_LABEL || 'baseline'
const only    = process.env.FRAMES_ONLY ? new RegExp(process.env.FRAMES_ONLY) : null
const profiles = (process.env.FRAMES_PROFILE || 'desktop,proxy,mobile').split(',')
const headless = process.env.FRAMES_HEADLESS === '1'

const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, mobile: false, cpu: 1 },
  wide:    { viewport: { width: 1920, height: 1080 }, mobile: false, cpu: 1 },
  // Stand-in for a ~2019 integrated-GPU laptop: the GPU can't be throttled
  // from the browser, so this only stresses the CPU side of the budget.
  proxy:   { viewport: { width: 1440, height: 900 }, mobile: false, cpu: 4 },
  mobile:  { viewport: { width: 390, height: 844 }, mobile: true, cpu: 4 },
}

const browser = await (engine === 'webkit'
  ? webkit.launch({ headless })
  : chromium.launch({ channel: 'chrome', headless, args: ['--enable-privileged-webgl-extensions', '--ignore-gpu-blocklist'] }))

const wait = ms => new Promise(r => setTimeout(r, ms))
const BUDGET_MS = 1000 / 60

function stats(frames) {
  if (!frames.length) return null
  const sorted = [...frames].sort((a, b) => a - b)
  const pct = p => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]
  const interval = pct(0.5)
  const total = frames.reduce((a, b) => a + b, 0)
  // The target is 60fps regardless of the display's own refresh rate (the
  // measuring Mac runs at 120-165Hz): a frame is dropped when it spans more
  // than one and a half 60Hz intervals, i.e. a visible hitch at 60fps.
  const dropped = frames.filter(f => f > BUDGET_MS * 1.5).length
  return {
    count: frames.length,
    fps: +(1000 * frames.length / total).toFixed(1),
    p50: +interval.toFixed(1), p95: +pct(0.95).toFixed(1), p99: +pct(0.99).toFixed(1), max: +sorted.at(-1).toFixed(1),
    droppedPct: +(100 * dropped / frames.length).toFixed(2),
  }
}

async function run(profileName) {
  const profile = PROFILES[profileName]
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.mobile ? 2 : 1,
    isMobile: profile.mobile && engine !== 'webkit' ? true : undefined,
    hasTouch: profile.mobile,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => {
    // Fixed palette/layout randomness so before/after runs are comparable.
    let seed = 42
    Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    const rec = window.__frames = { on: false, frames: [], loaf: [] }
    let last = 0
    const tick = t => { if (rec.on && last) rec.frames.push(t - last); last = t; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    try {
      new PerformanceObserver(list => {
        if (!rec.on) return
        for (const e of list.getEntries()) rec.loaf.push({
          duration: Math.round(e.duration), blocking: Math.round(e.blockingDuration ?? 0),
          scripts: (e.scripts ?? []).sort((a, b) => b.duration - a.duration).slice(0, 3)
            .map(s => ({ ms: Math.round(s.duration), invoker: s.invoker, source: `${s.sourceURL?.split('/').pop()}:${s.sourceFunctionName}` })),
        })
      }).observe({ type: 'long-animation-frame', buffered: false })
    } catch { /* not supported (WebKit) */ }
  })
  if (engine === 'chrome' && profile.cpu > 1) {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu })
  }

  const results = []
  async function sample(name, action, ms = 4000) {
    if (only && !only.test(name)) { await action?.(); return }
    await page.evaluate(() => { window.__perfAudit?.reset(); Object.assign(window.__frames, { on: true, frames: [], loaf: [] }) })
    const started = Date.now()
    let error = null
    try { await action?.() } catch (e) { error = e.message.split('\n')[0] }
    const rest = ms - (Date.now() - started)
    if (rest > 0) await wait(rest)
    const data = await page.evaluate(() => {
      const rec = window.__frames; rec.on = false
      const audit = window.__perfAudit
      const gpu = audit?.gpuMs?.length ? [...audit.gpuMs].sort((a, b) => a - b) : null
      return {
        frames: rec.frames, loaf: rec.loaf,
        scale: document.querySelector('canvas')?.dataset.renderScale,
        audit: audit && {
          frames: audit.frames, layer1Frames: audit.layer1Frames, shadowRedraws: audit.shadowRedraws,
          dirtyBy: audit.dirtyBy, tierChanges: audit.tierChanges,
          gpuP50: gpu && +gpu[Math.floor(gpu.length * .5)].toFixed(2), gpuP95: gpu && +gpu[Math.floor(gpu.length * .95)].toFixed(2),
        },
        playingVideos: [...document.querySelectorAll('video')].filter(v => !v.paused).length,
      }
    })
    const s = stats(data.frames)
    const longest = data.loaf.reduce((m, e) => Math.max(m, e.duration), 0)
    const result = { profile: profileName, name, ...s, loafCount: data.loaf.length, longestLoaf: longest,
      pass: !!s && s.fps >= 59 && s.droppedPct < 1 && s.p99 <= BUDGET_MS * 1.5 && longest <= 50, scale: data.scale, audit: data.audit,
      playingVideos: data.playingVideos, error, loaf: data.loaf.slice(0, 20) }
    results.push(result)
    console.log(`${result.pass ? 'PASS' : 'FAIL'} ${profileName.padEnd(7)} ${name.padEnd(28)} fps=${s?.fps} p95=${s?.p95} p99=${s?.p99} max=${s?.max} dropped=${s?.droppedPct}% loaf>50=${data.loaf.filter(e => e.duration > 50).length} longest=${longest} scale=${data.scale} shadow=${data.audit?.shadowRedraws}/${data.audit?.layer1Frames} gpu95=${data.audit?.gpuP95}${error ? ' ERROR ' + error : ''}`)
  }

  async function load() {
    await page.goto(`${BASE}/?perfAudit=1`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.getByRole('status', { name: 'Loading' }).waitFor({ state: 'hidden', timeout: 120000 })
    await wait(1500)
  }
  const { width, height } = profile.viewport
  const park = () => page.mouse.move(width - 8, height - 8)
  const nav = section => page.locator('nav[aria-label="Sections"]').getByText(section, { exact: true }).first().dispatchEvent('click')
  const byline = () => page.locator('[aria-label^="THELIFEOFPITA"]').first().dispatchEvent('click')
  const wheel = async (ms, dy = 120) => { const end = Date.now() + ms; let dir = 1; while (Date.now() < end) { for (let i = 0; i < 12 && Date.now() < end; i++) { await page.mouse.wheel(0, dy * dir); await wait(40) } dir = -dir } }

  try {
    await load()
    if (!profile.mobile) {
      await park()
      await sample('landing-idle', null, 5000)
      await sample('drag-model', async () => {
        await page.mouse.move(width / 2, height / 2); await page.mouse.down()
        for (let i = 0; i < 120; i++) { await page.mouse.move(width / 2 + Math.sin(i / 12) * 260, height / 2 + Math.cos(i / 17) * 40); await wait(16) }
        await page.mouse.up(); await park()
      }, 4500)
      await load(); await park()
      await sample('enter-projects', () => nav('Projects'), 3500)
      await wait(8000)
      await sample('projects-idle', null, 5000)
      const slots = page.locator('[class*="bigProjectModelSlot"]')
      await sample('project-hover-sweep', async () => {
        const n = await slots.count()
        for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
          const b = await slots.nth(i).boundingBox(); if (!b) continue
          for (let k = 0; k < 10; k++) { await page.mouse.move(b.x + b.width * (0.2 + 0.06 * k), b.y + b.height / 2); await wait(30) }
        }
      }, 5000)
      await sample('expand-project', async () => {
        const b = await slots.nth(0).boundingBox()
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await wait(400)
        await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
      }, 3500)
      const dialogOpen = await page.getByRole('dialog').count()
      if (dialogOpen) {
        for (let i = 0; i < 6; i++) {
          await page.mouse.move(width / 2, height / 2)
          await sample(`case-page-${i}-scroll`, () => wheel(3500), 4000)
          await sample(`case-page-${i}-next`, () => page.getByRole('button', { name: 'Next project' }).first().dispatchEvent('click'), 3000)
        }
        await sample('close-project', () => page.getByRole('button', { name: 'Close', exact: true }).first().dispatchEvent('click'), 2500)
      }
      await park()
      await sample('enter-playground', () => nav('Playground'), 3500)
      await wait(6000)
      await sample('playground-idle', null, 5000)
      await sample('open-collection', () => page.locator('[aria-label="Playground"]').getByRole('button', { name: /^Open / }).first().click({ timeout: 5000 }), 4000)
      await sample('next-collection', () => page.locator('[role="dialog"]:not([inert]) button[aria-label="Next collection"]').first().click({ timeout: 3000 }), 3500)
      await sample('close-collection', () => page.locator('[role="dialog"]:not([inert]) button[aria-label="Close collection"]').first().click({ timeout: 3000 }), 2500)
      await park()
      await sample('return-projects', () => nav('Projects'), 3500)
      await wait(10000)
      await sample('projects-return-idle', null, 5000)
      await sample('enter-about', () => nav('About Me'), 3500)
      await wait(3000)
      await sample('about-idle', null, 4000)
      await sample('back-to-landing', () => byline(), 3000)
      await wait(2000)
      await sample('palette-reroll', () => byline(), 3000)
      await sample('landing-return-idle', null, 4000)
    } else {
      await sample('m-landing-idle', null, 5000)
      await sample('m-scroll-page', () => wheel(5000, 160), 5000)
      await page.evaluate(() => window.scrollTo(0, 0)); await wait(1000)
      await sample('m-enter-projects', () => nav('Projects'), 3500)
      await wait(3000)
      await sample('m-projects-scroll', () => wheel(5000, 160), 5000)
      await sample('m-open-project', () => page.getByRole('button', { name: /^Open / }).first().click({ timeout: 5000 }), 3500)
      if (await page.getByRole('dialog').count()) {
        await sample('m-case-page-scroll', () => wheel(5000, 200), 5000)
        await sample('m-close-project', () => page.getByRole('button', { name: 'Close', exact: true }).first().click({ timeout: 3000 }), 2500)
      }
      await page.evaluate(() => window.scrollTo(0, 0)); await wait(1000)
      await sample('m-enter-playground', () => nav('Playground'), 3500)
      await wait(3000)
      await sample('m-playground-scroll', () => wheel(5000, 160), 5000)
      await page.evaluate(() => window.scrollTo(0, 0)); await wait(1000)
      await sample('m-enter-about', () => nav('About Me'), 3500)
      await page.evaluate(() => window.scrollTo(0, 0)); await wait(1000)
      await sample('m-palette-reroll', () => byline(), 3000)
    }
  } catch (e) {
    console.log(`ABORT ${profileName}: ${e.message.split('\n')[0]}`)
  }
  await context.close()
  return { results, errors }
}

const out = { label, engine, base: BASE, date: new Date().toISOString(), profiles: {} }
try {
  for (const name of profiles) {
    out.profiles[name] = await run(name)
    await fs.writeFile(`reports/performance/frames-${label}-${engine}.json`, JSON.stringify(out, null, 2))
  }
} finally { await browser.close() }
const all = Object.values(out.profiles).flatMap(p => p.results)
console.log(`\n${all.filter(r => r.pass).length}/${all.length} scenarios pass → reports/performance/frames-${label}-${engine}.json`)
