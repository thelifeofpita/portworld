import { chromium } from 'playwright'
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2})
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error' && /THREE|GLSL|shader|WebGL/i.test(m.text()))errors.push(m.text())})
  await page.goto('http://localhost:3000/?materialAudit=1',{waitUntil:'domcontentloaded'})
  await page.waitForTimeout(6000)
  await page.locator('nav[aria-label="Sections"]').getByText('Projects',{exact:true}).dispatchEvent('click')
  await page.waitForFunction(()=>!!window.__duoAudit)
  await page.waitForTimeout(3000)
  const meshes=await page.evaluate(()=>{
    const out=[]
    window.__duoAudit.renderScene.traverse(o=>{if(o.isMesh && o.userData.projectMaskId===5/16){o.geometry.computeBoundingBox();out.push({name:o.name,extent:o.geometry.boundingBox.min.distanceTo(o.geometry.boundingBox.max),normals:!!o.geometry.attributes.normal,normalMap:!!o.material.normalMap,roughnessMap:!!o.material.roughnessMap})}})
    return out
  })
  if(meshes.length!==3 || !meshes.every(m=>m.normals && m.normalMap && m.roughnessMap))throw new Error('Missing fries, box, sticker or material maps: '+JSON.stringify(meshes))
  if(meshes.some(m=>m.extent>5))throw new Error('Loose geometry is inflating the model bounds')
  const box=await page.locator('[class*="bigProjectModelSlot"]').nth(4).boundingBox()
  for(const [name,x,y] of [['left',20,450],['right',1420,450],['hover',box.x+box.width/2,box.y+box.height/2]]){
    await page.mouse.move(x,y);await page.waitForTimeout(1200)
    await page.screenshot({path:`/tmp/pick-a-side-${name}.png`})
    await page.screenshot({path:`/tmp/pick-a-side-detail-${name}.png`,clip:{x:box.x-20,y:box.y-20,width:box.width+40,height:box.height+40}})
  }
  for(const [dx,dy] of [[0,0],[-15,10],[15,-10]]){
    await page.mouse.click(box.x+box.width/2+dx,box.y+box.height/2+dy)
    await page.waitForTimeout(800)
    if(await page.getByRole('heading',{name:'Pick a side.',exact:true}).count())break
  }
  await page.getByRole('heading',{name:'Pick a side.',exact:true}).waitFor({timeout:15000})
  if(errors.length)throw new Error(errors.join('\n'))
  console.log('PASS: exactly box, sticker, fries; material maps intact; custom Pick a Side project opens',meshes)
} finally {await browser.close()}
