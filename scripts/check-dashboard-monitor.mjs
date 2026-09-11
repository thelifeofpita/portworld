import { chromium } from 'playwright'
const browser = await chromium.launch({channel:'chrome',headless:true})
try {
  const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2})
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://localhost:3000/?materialAudit=1',{waitUntil:'domcontentloaded'})
  await page.waitForTimeout(6000)
  await page.locator('nav[aria-label="Sections"]').getByText('Projects',{exact:true}).dispatchEvent('click')
  await page.waitForFunction(()=>!!window.__duoAudit)
  await page.waitForTimeout(2500)
  const screen=await page.evaluate(()=>{
    let found
    window.__duoAudit.renderScene.traverse(o=>{
      if(o.isMesh && o.userData.projectMaskId===6/16 && o.material.name.includes('LCD'))
        found={map:!!o.material.map,emissiveMap:!!o.material.emissiveMap,emission:o.material.emissiveIntensity}
    })
    return found
  })
  if(!screen?.map || !screen.emissiveMap || screen.emission<=0)throw new Error('Missing illuminated campaign screen')
  const box=await page.locator('[class*="bigProjectModelSlot"]').nth(5).boundingBox()
  for(const [name,x,y] of [['front',box.x+box.width/2,box.y+box.height/2],['angled',50,450]]){
    await page.mouse.move(x,y)
    await page.waitForTimeout(1500)
    await page.screenshot({path:`/tmp/dashboard-${name}.png`,clip:{x:box.x-25,y:box.y-25,width:box.width+50,height:box.height+50}})
  }
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2)
  await page.waitForTimeout(1000)
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
  await page.getByRole('heading',{name:'Back in smoothly.',exact:true}).waitFor({timeout:15000})
  if(errors.length)throw new Error(errors.join('\n'))
  console.log('PASS: illuminated LCD, model hover and existing campaign opens',screen)
} finally {await browser.close()}
