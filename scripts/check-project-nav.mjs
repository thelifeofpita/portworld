// In-project navigation: the THELIFEOFPITA wordmark scrolls with the case page
// in the page's ink, Previous/Next/[X] hover in their destination's colour, a
// Previous/Next step lands at the top of the next page, and the step plays a
// DitherSweep that clears from the side the new page arrives from. Also checks
// that playground collections slide horizontally, and that reduced motion skips
// the sweep.
//
//   TEST_BASE_URL=http://localhost:3000 node scripts/check-project-nav.mjs
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const base = process.env.TEST_BASE_URL || 'http://localhost:3000'
const output = '/tmp/project-nav-check'
await mkdir(output, { recursive: true })

const SURF = 'rgb(66, 133, 244)'
const DUOLINGO = 'rgb(88, 204, 2)'
const VERIFIED = 'rgb(218, 104, 141)'
const BACK_IN_SMOOTHLY = 'rgb(106, 47, 217)'
const WHITE = 'rgb(255, 255, 255)'
const INK_DARK = 'rgb(13, 13, 13)'

const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function load(page) {
  await page.goto(base + '/?materialAudit=1', { waitUntil: 'domcontentloaded' })
  await page.getByRole('status', { name: 'Loading' }).waitFor({ state: 'hidden', timeout: 90000 })
  await page.waitForTimeout(1500)
}

async function openDesktopProject(page, slotIndex, title) {
  await page.getByText('Projects', { exact: true }).dispatchEvent('click')
  await page.waitForTimeout(2500)
  const heading = page.getByRole('heading', { level: 1, name: title, exact: true })
  const slot = page.locator('[class*="bigProjectModelSlot"]').nth(slotIndex)
  for (const offset of [0, -20, 20, -40, 40]) {
    const b = await slot.boundingBox()
    await page.mouse.move(b.x + b.width / 2 + offset, b.y + b.height / 2)
    await page.waitForTimeout(600)
    await page.mouse.click(b.x + b.width / 2 + offset, b.y + b.height / 2)
    await page.waitForTimeout(900)
    if (await heading.count()) break
  }
  await heading.waitFor({ timeout: 20000 })
  await page.waitForTimeout(800)
}

// Clicks a nav button (first match) inside the page and samples the transition
// from the same task, so no round-trip latency skews the timings.
function stepAndSample(page, label) {
  return page.evaluate(async label => {
    const wait = ms => new Promise(r => setTimeout(r, ms))
    const scrollerOf = el => { let a = el?.parentElement; while (a) { const s = getComputedStyle(a); if (s.overflowY === 'auto' || s.overflowY === 'scroll') return a; a = a.parentElement } return null }
    const sweep = () => [...document.querySelectorAll('canvas')].find(c => getComputedStyle(c).imageRendering === 'pixelated')
    const translateX = el => { const m = getComputedStyle(el).transform; return m === 'none' ? 0 : new DOMMatrix(m).m41 }
    const sides = c => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      const q = Math.floor(c.width / 4); let left = 0, right = 0, n = 0
      for (let y = 0; y < c.height; y += 4) for (let i = 0; i < q; i += 2) {
        left += d[(y * c.width + i) * 4 + 3]; right += d[(y * c.width + (c.width - 1 - i)) * 4 + 3]; n++
      }
      return { left: left / n / 255, right: right / n / 255 }
    }
    document.querySelector(`button[aria-label="${label}"]`).click()
    await wait(60)
    const canvas = sweep()
    const heading = document.querySelector('[role=dialog] h1')
    const moving = heading.closest('[style*="overflow"]') ?? scrollerOf(heading)
    const early = { canvas: !!canvas, translateX: translateX(moving.closest('[style]')), heading: heading.textContent }
    await wait(140)
    const mid = canvas && canvas.isConnected ? sides(canvas) : null
    await wait(800)
    const scroller = scrollerOf(document.querySelector('[role=dialog] h1'))
    return { early, mid, sweepGone: !sweep(), scrollTop: scroller?.scrollTop ?? null }
  }, label)
}

const hoverColor = async (page, locator) => {
  await locator.hover()
  await page.waitForTimeout(300)
  return locator.evaluate(el => getComputedStyle(el).color)
}

try {
  // ─── Desktop ────────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.stack || e.message))
    await load(page)
    await openDesktopProject(page, 0, 'Surf the spike.')
    const dialog = page.locator('[role=dialog]')
    const wordmark = dialog.getByRole('button', { name: 'Return to home' })
    assert.equal(await wordmark.count(), 1, 'One wordmark on a case page')
    assert.equal(await wordmark.evaluate(el => getComputedStyle(el).color), WHITE, 'Wordmark takes Surf\'s white ink')
    assert.equal(await wordmark.locator('span').evaluate(el => getComputedStyle(el).color), WHITE, 'PITA matches the ink too')
    const topNav = dialog.getByRole('navigation', { name: 'Project navigation' }).first()
    const [wm, nav] = [await wordmark.boundingBox(), await topNav.boundingBox()]
    assert(wm.y + wm.height <= nav.y, 'Wordmark sits above the top nav')
    await page.screenshot({ path: `${output}/desktop-surf-top.png` })

    // Hover previews each destination.
    assert.equal(await hoverColor(page, topNav.getByRole('button', { name: 'Next project' })), DUOLINGO, 'Next hovers in Duolingo green')
    assert.equal(await hoverColor(page, topNav.getByRole('button', { name: 'Previous project' })), BACK_IN_SMOOTHLY, 'Previous hovers in Back in Smoothly violet')
    const homeBg = await page.evaluate(() => { const p = document.createElement('p'); p.style.color = 'var(--bg-color)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c })
    assert.equal(await hoverColor(page, topNav.getByRole('button', { name: 'Close' })), homeBg, '[X] hovers in the home background')
    await page.mouse.move(5, 450)

    // The wordmark scrolls away with the page.
    await wordmark.evaluate(el => { let a = el.parentElement; while (getComputedStyle(a).overflowY !== 'auto') a = a.parentElement; a.scrollTo(0, 1400) })
    await page.waitForTimeout(400)
    const scrolled = await wordmark.boundingBox()
    assert(scrolled.y + scrolled.height < 0, `Wordmark scrolled off screen (y=${scrolled.y})`)

    // Next from mid-page: sweep clears right side first, page arrives from the right, lands at top.
    const next = await stepAndSample(page, 'Next project')
    console.log('desktop next', JSON.stringify(next))
    assert(next.early.canvas, 'Next plays a DitherSweep')
    assert.equal(next.early.heading, 'Your Coolest Lesson Yet.')
    assert(next.early.translateX > 0, 'Next page drifts in from the right')
    assert(next.mid && next.mid.right < next.mid.left, `Next clears the right side first (${JSON.stringify(next.mid)})`)
    assert(next.sweepGone, 'Sweep unmounts once finished')
    assert.equal(next.scrollTop, 0, 'Next lands at the top of the project')
    assert.equal(await wordmark.evaluate(el => getComputedStyle(el).color), INK_DARK, 'Wordmark switches to Duolingo\'s dark ink')
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).backgroundColor), DUOLINGO)

    // Previous mirrors it.
    await wordmark.evaluate(el => { let a = el.parentElement; while (getComputedStyle(a).overflowY !== 'auto') a = a.parentElement; a.scrollTo(0, 900) })
    const prev = await stepAndSample(page, 'Previous project')
    console.log('desktop previous', JSON.stringify(prev))
    assert(prev.early.canvas && prev.early.translateX < 0, 'Previous page drifts in from the left')
    assert(prev.mid && prev.mid.left < prev.mid.right, `Previous clears the left side first (${JSON.stringify(prev.mid)})`)
    assert.equal(prev.scrollTop, 0)
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).backgroundColor), SURF)

    // Playground: collection Prev/Next slides horizontally, never vertically.
    await dialog.getByRole('button', { name: 'Close' }).first().click()
    await page.waitForTimeout(1200)
    await page.getByText('Playground', { exact: true }).dispatchEvent('click')
    await page.getByRole('button', { name: 'Open Woodstock 29', exact: true }).waitFor({ timeout: 60000 })
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: 'Open Woodstock 29', exact: true }).click()
    await page.getByRole('button', { name: 'Close collection' }).waitFor()
    await page.waitForTimeout(1200)
    const slide = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms))
      const visible = () => [...document.querySelectorAll('[role=dialog]')].find(d => !d.inert)
      const from = visible()
      visible().querySelector('button[aria-label="Next collection"]').click()
      await wait(90)
      const m = el => new DOMMatrix(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform)
      const to = visible()
      return { outgoing: { x: m(from).m41, y: m(from).m42 }, incoming: { x: m(to).m41, y: m(to).m42 }, changed: from !== to }
    })
    console.log('playground next', JSON.stringify(slide))
    assert(slide.changed, 'Next collection opened a different collection')
    assert(slide.incoming.x > 0 && slide.outgoing.x < 0, 'Incoming from the right, outgoing to the left')
    assert(slide.incoming.y === 0 && slide.outgoing.y === 0, 'No vertical movement')
    const collectionNavBtn = page.locator('[role=dialog]:not([inert])').getByRole('button', { name: 'Next collection' })
    await page.waitForTimeout(500)
    assert.equal(await collectionNavBtn.evaluate(el => getComputedStyle(el).color), await page.evaluate(() => { const p = document.createElement('p'); p.style.color = 'var(--fg-color)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c }), 'Collection nav keeps the page ink')
    assert.deepEqual(errors, [])
    await page.close()
    console.log('PASS desktop: wordmark, hover colours, sweep direction, scroll reset, playground slide')
  }

  // ─── Mobile ─────────────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.stack || e.message))
    await load(page)
    await page.getByText('Projects', { exact: true }).dispatchEvent('click')
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: 'Open Duolingo: Your Coolest Lesson Yet.', exact: true }).click()
    await page.getByRole('heading', { level: 1, name: 'Your Coolest Lesson Yet.', exact: true }).waitFor()
    await page.waitForTimeout(800)
    await page.evaluate(() => document.querySelector('[role=dialog]').scrollTo(0, 1500))
    await page.waitForTimeout(300)
    const next = await stepAndSample(page, 'Next project')
    console.log('mobile next', JSON.stringify(next))
    assert(next.early.canvas, 'Mobile Next plays a DitherSweep')
    assert.equal(next.early.heading, 'Verified.')
    assert(next.mid && next.mid.right < next.mid.left, 'Mobile Next clears the right side first')
    assert.equal(await page.evaluate(() => document.querySelector('[role=dialog]').scrollTop), 0, 'Mobile lands at the top')
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[role=dialog]')).backgroundColor), VERIFIED)
    await page.screenshot({ path: `${output}/mobile-verified-top.png` })
    assert.deepEqual(errors, [])
    await page.close()
    console.log('PASS mobile: sweep direction, scroll reset')
  }

  // ─── Reduced motion ─────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    await load(page)
    await openDesktopProject(page, 0, 'Surf the spike.')
    const step = await stepAndSample(page, 'Next project')
    console.log('reduced-motion next', JSON.stringify(step))
    assert(!step.early.canvas, 'Reduced motion skips the sweep')
    assert.equal(step.early.translateX, 0, 'Reduced motion skips the slide')
    assert.equal(step.scrollTop, 0)
    await page.close()
    console.log('PASS reduced motion: instant swap at the top')
  }
} finally {
  await browser.close()
}
