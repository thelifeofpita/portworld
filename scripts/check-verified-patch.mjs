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
  const materials = await page.evaluate(()=>{
    const out=[]
    window.__duoAudit.renderScene.traverse(o=>{
      if(o.isMesh && o.userData.projectMaskId===3/16) out.push({name:o.name,vertices:o.geometry.attributes.position.count,normals:!!o.geometry.attributes.normal,normalMap:!!o.material.normalMap,colorMap:!!o.material.map,roughnessMap:!!o.material.roughnessMap})
    })
    return out
  })
  if(materials.length!==2 || !materials.every(m=>m.normals && m.normalMap && m.colorMap && m.roughnessMap)) throw new Error('Missing magazine geometry, paper relief, texture or material roughness')
  const loaded = await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('verified-magazine-c39b9a5102.glb')))
  if(!loaded) throw new Error('Website did not fetch the versioned magazine')
  await page.waitForTimeout(2000)
  const box=await page.locator('[class*="bigProjectModelSlot"]').nth(2).boundingBox()
  for (const [name,x,y] of [['left',50,450],['right',1390,450],['top',720,50]]) {
    await page.mouse.move(x,y)
    await page.waitForTimeout(1000)
    await page.screenshot({path:`/tmp/verified-magazine-${name}.png`,clip:{x:box.x-20,y:box.y-20,width:box.width+40,height:box.height+40}})
  }
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2)
  await page.waitForTimeout(1000)
  await page.screenshot({path:'/tmp/verified-magazine-hover.png'})
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
  await page.locator('iframe[src*="HwCWeJ_ZcvQ"]').first().waitFor({state:'attached',timeout:15000})
  if(errors.length) throw new Error(errors.join('\n'))
  console.log('PASS: magazine cover and pages, normals, roughness maps, and existing Verified project opens',materials)
} finally { await browser.close() }
