import { chromium } from 'playwright'
const browser = await chromium.launch({channel:'chrome',headless:true})
const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:Number(process.env.TEST_DPR || 1)})
const errors=[]
if (process.env.TEST_LIGHT_BG) await page.addInitScript(()=>{
  localStorage.setItem('portworld-debug-state',JSON.stringify({bgColor:'#b0e217',fgColor:'#24170a'}))
})
page.on('pageerror', e=>errors.push(e.message))
page.on('console', msg=>{if(msg.type()==='error' && /THREE|GLSL|shader|WebGL/i.test(msg.text())) errors.push(msg.text())})
await page.goto((process.env.TEST_BASE_URL || 'http://localhost:3000'),{waitUntil:'domcontentloaded'})
await page.waitForTimeout(6000)
await page.screenshot({path:'/tmp/navigation-highlights.png'})
await page.locator('nav[aria-label="Sections"]').getByText('Projects',{exact:true}).dispatchEvent('click')
await page.waitForTimeout(4000)
await page.screenshot({path:'/tmp/projects-rendering.png'})
console.log(await page.locator('[class*="bigProjectModelSlot"]').evaluateAll(es=>es.map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON()}))))
const modelCount = await page.locator('[class*="bigProjectModelSlot"]').count()
if (modelCount !== 6) throw new Error(`Expected six project models, got ${modelCount}`)
const slots = await page.locator('[class*="bigProjectModelSlot"]').evaluateAll(es => es.map(e => {
  const r = e.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}))
if (!(slots[1].x < slots[0].x - 100 && slots[4].x > slots[3].x + 100)) {
  throw new Error('Middle models must wrap outward, not line up in columns')
}
for (let i = 0; i < modelCount; i++) {
  const box = await page.locator('[class*="bigProjectModelSlot"]').nth(i).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4)
  await page.waitForTimeout(1800)
  await page.screenshot({path:`/tmp/projects-hover-${i}.png`})
}
for (const [width,height] of [[1000,700],[1920,1080]]) {
  await page.setViewportSize({width,height})
  await page.mouse.move(width/2,height/2)
  await page.waitForTimeout(2000)
  await page.screenshot({path:`/tmp/projects-rendering-${width}.png`})
}
if(errors.length) throw new Error(errors.join('\n'))
await page.setViewportSize({width:1440,height:900})
await page.waitForTimeout(1500)
const twix = await page.locator('[class*="bigProjectModelSlot"]').nth(3).boundingBox()
await page.mouse.move(twix.x + twix.width / 2, twix.y + twix.height / 2)
await page.waitForTimeout(1000)
for (const [dx,dy] of [[0,0],[10,-15],[-10,15]]) {
  await page.mouse.click(twix.x + twix.width / 2 + dx, twix.y + twix.height / 2 + dy)
  await page.waitForTimeout(600)
  if(await page.locator('iframe[src*="VykD83mmSTo"]').count()) break
}
await page.locator('iframe[src*="VykD83mmSTo"]').first().waitFor({state:'attached',timeout:15000})
console.log('PASS: Twix model opens its existing project')
console.log('PASS: all six model hovers and three viewport sizes; no rendering errors')
await browser.close()
