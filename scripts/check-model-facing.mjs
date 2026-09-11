import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://localhost:3000/?materialAudit=1', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  await page.locator('nav[aria-label="Sections"]').getByText('Projects', { exact: true }).dispatchEvent('click')
  await page.waitForFunction(() => !!window.__duoAudit)
  await page.waitForTimeout(3000)
  for (let i = 0; i < 6; i++) {
    const box = await page.locator('[class*="bigProjectModelSlot"]').nth(i).boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(1800)
    const tilt = await page.evaluate(index => {
      let mesh
      window.__duoAudit.renderScene.traverse(o => {
        if (o.isMesh && o.userData.projectMaskId === (index + 1) / 16) mesh = o
      })
      // Find the cursor-controlled group immediately beneath the positioned
      // parent (which is attached directly to the render scene).
      let outer = mesh
      while (outer.parent && outer.parent !== window.__duoAudit.renderScene) outer = outer.parent
      const inner = outer.children[0]
      return { x: inner.rotation.x, y: inner.rotation.y, cameraCompensation: outer.rotation.y }
    }, i)
    if (Math.abs(tilt.x) > .012 || Math.abs(tilt.y) > .012) throw new Error(`Model ${i} retains cursor tilt at its centre: ${JSON.stringify(tilt)}`)
    if (Math.abs(tilt.cameraCompensation) < .01) throw new Error(`Model ${i} has no perspective compensation`)
    if (i === 1) await page.screenshot({ path: '/tmp/duolingo-facing-cursor.png' })
    console.log('Front-facing model', i, tilt)
  }
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('PASS: all six models neutralize tilt under the cursor and compensate perspective')
} finally { await browser.close() }
