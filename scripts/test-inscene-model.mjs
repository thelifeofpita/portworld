import { chromium } from 'playwright'

const shot = async (page, name) => {
  await page.screenshot({ path: `/tmp/inscene-${name}.png` })
  console.log(`saved /tmp/inscene-${name}.png`)
}

const run = async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
    if (msg.text().includes('InSceneProjectModel')) {
      Promise.all(msg.args().map((a) => a.jsonValue().catch(() => '<unserializable>')))
        .then((vals) => console.log('LOG:', ...vals))
    }
  })
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
  // wait for the loading screen to dismiss
  await page.waitForTimeout(4000)
  await shot(page, '01-loaded')

  // Rotate to the Projects zone by dragging the model — same interaction the
  // real user drives via ZoneNav/drag. Try clicking the Projects nav label
  // if present, else drag.
  const nav = page.locator('text=Projects').first()
  if (await nav.count()) {
    await nav.click()
  } else {
    await page.mouse.move(720, 450)
    await page.mouse.down()
    await page.mouse.move(1100, 450, { steps: 20 })
    await page.mouse.up()
  }
  await page.waitForTimeout(1500)
  await shot(page, '02-projects-zone')

  // Find the Duolingo card slot in the DOM (invisible spacer div) and hover
  // over its center to trigger the in-scene model's hover glow.
  const slot = page.locator('[class*="bigProjectModelSlot"]').first()
  const count = await slot.count()
  console.log('bigProjectModelSlot count:', count)
  if (count) {
    const box = await slot.boundingBox()
    console.log('slot box:', box)
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 })
      await page.waitForTimeout(600)
      await shot(page, '03-hover')
      await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2 + 5, { steps: 5 })
      await page.waitForTimeout(600)
      await shot(page, '04-hover-settled')
    }
  }

  console.log('console/page errors:', JSON.stringify(errors, null, 2))
  await browser.close()
}

run()
