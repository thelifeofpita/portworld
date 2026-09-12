import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const errors = []
    page.on('pageerror', e => errors.push(String(e)))
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await page.getByRole('status', { name: 'Loading' }).waitFor({ state: 'hidden', timeout: 90000 })
    await page.waitForTimeout(500)
    await page.getByText('Projects', { exact: true }).dispatchEvent('click')
    await page.waitForTimeout(500)
    await page.screenshot({ path: '/tmp/verify-01-grid.png' })

    // Scroll through the whole grid to exercise the imperative tilt/scale
    // writes and confirm no scroll jank/errors.
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 400)
      await page.waitForTimeout(150)
    }
    await page.screenshot({ path: '/tmp/verify-02-scrolled.png' })

    // Tap the first project image to open its detail.
    const firstBtn = page.locator('[data-project-index] button').first()
    await firstBtn.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await firstBtn.click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: '/tmp/verify-03-detail.png' })

    console.log('console/page errors:', JSON.stringify(errors, null, 2))
  } finally {
    await browser.close()
  }
}

run()
