// The 3D scene stops rendering while an opaque case-study page covers it, and
// resumes the moment the page starts closing — before the shrinking panel can
// reveal a stale frame. Counts composited frames via ?perfAudit=1.
//   node scripts/check-scene-cover.mjs        (production build on TEST_BASE_URL)
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import sharp from 'sharp'

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3002'
const wait = ms => new Promise(r => setTimeout(r, ms))

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-position=0,0', '--ignore-gpu-blocklist'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${BASE}/?perfAudit=1`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('status', { name: 'Loading' }).waitFor({ state: 'hidden', timeout: 120000 })
  const frames = () => page.evaluate(() => window.__perfAudit.frames)
  const framesDuring = async ms => { const a = await frames(); await wait(ms); return (await frames()) - a }
  const openFirstProject = async () => {
    const b = await page.locator('[class*="bigProjectModelSlot"]').nth(0).boundingBox()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await wait(400)
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    await page.getByRole('dialog').waitFor({ timeout: 5000 })
    await wait(1200)
  }

  await page.mouse.move(700, 450)
  await page.locator('nav[aria-label="Sections"]').getByText('Projects', { exact: true }).first().dispatchEvent('click')
  await wait(8000)
  assert(await framesDuring(1000) > 30, 'The scene renders in Projects')

  await openFirstProject()
  assert(await framesDuring(1500) <= 2, 'The scene is paused while a case study covers it')
  await page.mouse.move(720, 450)
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 150); await wait(50) }
  assert(await framesDuring(1000) <= 2, 'It stays paused while scrolling the case study')

  const next = page.getByRole('button', { name: 'Next project' }).first()
  await next.scrollIntoViewIfNeeded()
  await next.click()
  await wait(1500)
  assert(await framesDuring(1500) <= 2, 'It stays paused after moving to the next case study')

  const close = page.getByRole('button', { name: 'Close', exact: true }).first()
  await close.scrollIntoViewIfNeeded()
  const beforeClose = await frames()
  await close.click()
  await wait(250)
  assert((await frames()) - beforeClose >= 5, 'Rendering resumes as soon as closing starts')
  await wait(1500)
  assert(await framesDuring(1000) > 30, 'The scene keeps rendering after the page is closed')

  // The project models must actually be drawn again, not a stale frame.
  const shot = await page.screenshot()
  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true })
  let colored = 0
  for (let i = 0; i < data.length; i += info.channels) if (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) > 60) colored++
  assert(colored > 5000, 'Project models are visible after closing')

  await openFirstProject()
  assert(await framesDuring(1500) <= 2, 'Paused again on reopening')
  const beforeEscape = await frames()
  await page.keyboard.press('Escape')
  await wait(250)
  assert((await frames()) - beforeEscape >= 5, 'Escape also resumes rendering immediately')

  assert.deepEqual(errors, [])
  console.log('PASS scene pauses under case studies and resumes on close (button and Escape)')
} finally {
  await browser.close()
}
