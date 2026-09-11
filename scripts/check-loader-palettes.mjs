import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({ reducedMotion })
    await page.route('**/*.glb', async route => { await new Promise(r => setTimeout(r, 3500)); await route.continue() })
    await page.addInitScript(() => {
      window.paletteSteps = []
      new MutationObserver(() => {
        const el = document.querySelector('[role="status"][aria-label="Loading"]')
        if (!el) return
        const color = el.style.getPropertyValue('--bg-color')
        if (color && window.paletteSteps.at(-1)?.color !== color) window.paletteSteps.push({ color, duration: parseFloat(el.style.getPropertyValue('--palette-step')) })
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] })
    })
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' })
    const loader = page.getByRole('status', { name: 'Loading' })
    await loader.waitFor({ state: 'hidden', timeout: 90000 })
    const result = await page.evaluate(() => ({ steps: window.paletteSteps, settled: window.settledPalette, final: getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim(), chosen: window.__PALETTE__.white }))
    console.log(JSON.stringify(result))
    if (reducedMotion === 'reduce') assert.equal(result.steps.length, 0)
    else {
      assert(result.steps.length >= 4, 'Loading should cycle through several palettes')
      assert(result.steps.every(step => step.duration === 50), 'Every palette fade should last three frames at 60fps')
    }
    assert.equal(result.final, result.chosen, 'The chosen theme must be preserved')
    console.log(reducedMotion, JSON.stringify(result))
    await page.close()
  }
} finally { await browser.close() }
