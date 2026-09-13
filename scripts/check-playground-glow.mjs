import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://localhost:3000/?materialAudit=1')
  await page.getByRole('status', { name: 'Loading' }).waitFor({ state: 'hidden', timeout: 90000 })
  await page.getByText('Playground', { exact: true }).dispatchEvent('click')
  const card = page.getByRole('button', { name: 'Open Isolation', exact: true })
  await card.waitFor()
  await page.waitForTimeout(4000)
  async function check(label) {
    await card.hover()
    await page.waitForTimeout(700)
    const result = await card.evaluate(el => {
      const art = el.querySelector('[data-tilt]').getBoundingClientRect()
      const renderer = window.__duoAudit.renderScene.__r3f.root.getState().gl
      const program = renderer.info.programs.find(p => p.getUniforms().map.uPgCardP0)
      const uniforms = program.getUniforms().map, gl = renderer.getContext()
      const get = name => [0,1,2,3].flatMap(i => { const v = gl.getUniform(program.program, gl.getUniformLocation(program.program, `${name}[${i}]`)); return typeof v === 'number' ? [v] : Array.from(v) })
      const active = get('uPgCardActive'), opacity = get('uPgCardOpacity')
      const slot = active.findIndex((a, i) => a && opacity[i] > .9)
      if (slot < 0) throw new Error(JSON.stringify({active,opacity,hover:el.matches(':hover'),art:art.toJSON()}))
      const points = [0,1,2,3].map(i => get(`uPgCardP${i}`).slice(slot * 2, slot * 2 + 2))
      const xs = points.map(p => p[0]), ys = points.map(p => p[1])
      return { actual: [art.left, art.top, art.right, art.bottom], glow: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
    })
    const error = Math.max(...result.actual.map((v,i) => Math.abs(v-result.glow[i])))
    assert(error < 2, `${label}: highlight differs from card by ${error}px: ${JSON.stringify(result)}`)
    console.log(`${label}: maximum edge error ${error.toFixed(3)}px`)
  }
  await page.mouse.move(1400,850)
  await check('Initial entrance')
  await page.setViewportSize({ width: 1920, height: 1080 })
  await check('Resized layout')
  await page.getByText('Projects', { exact: true }).dispatchEvent('click')
  await page.waitForTimeout(1500)
  await page.getByText('Playground', { exact: true }).dispatchEvent('click')
  await page.waitForTimeout(1800)
  await check('Return from Projects')
  await page.screenshot({ path: '/tmp/playground-glow-aligned.png' })
} finally { await browser.close() }
