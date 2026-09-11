import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:900}})
  await page.goto('http://localhost:3000/?materialAudit=1')
  await page.getByRole('status',{name:'Loading'}).waitFor({state:'hidden',timeout:90000})
  await page.getByText('Projects',{exact:true}).dispatchEvent('click')
  await page.waitForTimeout(3000)
  if(mobile) await page.getByAltText('PlatanoMelón: Back in smoothly.',{exact:true}).click()
  else {const slot=page.locator('[class*="bigProjectModelSlot"]').nth(5); const b=await slot.boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2)}
  await page.getByRole('heading',{name:'Back in smoothly.',exact:true}).waitFor({timeout:20000})
  const link=page.getByRole('link',{name:/Tap to Play now/i})
  await link.scrollIntoViewIfNeeded()
  assert.equal(await link.getAttribute('href'),'https://thelifeofpita.github.io/backingame/')
  const videos=page.locator('img[alt*="updated mobile game"]')
  assert.equal(await videos.count(),2)
  for(let i=0;i<2;i++){
   const clip=videos.nth(i)
   await clip.scrollIntoViewIfNeeded()
   await clip.evaluate(img=>img.decode())
   const before=await clip.screenshot();await page.waitForTimeout(600);const after=await clip.screenshot()
   assert(!before.equals(after),'Transparent game animation must advance')
   const alpha=await clip.evaluate(img=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {corner:ctx.getImageData(0,0,1,1).data[3],center:ctx.getImageData(c.width/2,c.height/2,1,1).data[3]}})
   assert.equal(alpha.corner,0);assert.equal(alpha.center,255)
  }
  const vb=await videos.evaluateAll(v=>v.map(e=>{const b=e.getBoundingClientRect();return{left:b.left,right:b.right,width:b.width,height:b.height}}))
  assert(vb.every(b=>b.left>=0 && b.right<=(mobile?390:1440) && Math.abs(b.width/b.height-608/1080)<.01), 'Game clips must fit without overflow or distortion')
  await link.scrollIntoViewIfNeeded()
  await page.screenshot({path:`/tmp/bis-cta-${mobile?'mobile':'desktop'}.png`})
  const mockups=page.locator('img[alt*="sticker seen through a parking"]')
  assert.equal(await mockups.count(),3)
  await mockups.last().scrollIntoViewIfNeeded();await page.waitForTimeout(800)
  const boxes=await mockups.evaluateAll(imgs=>imgs.map(img=>{const b=img.getBoundingClientRect();return{left:b.left,top:b.top,width:b.width,height:b.height,loaded:img.naturalWidth>0}}))
  assert(boxes.every(b=>b.loaded && b.width>0 && b.left>=0 && b.left+b.width<(mobile?390:1440)+1))
  if(mobile)assert(boxes[2].top>boxes[1].top && boxes[1].top>boxes[0].top)
  else assert(Math.max(...boxes.map(b=>b.top))-Math.min(...boxes.map(b=>b.top))<1)
  assert.equal(await page.locator('img[src*="car-camera"]').count(),0)
  await page.screenshot({path:`/tmp/bis-mockups-${mobile?'mobile':'desktop'}.png`})
  console.log('PASS',mobile?'mobile':'desktop','updated link, two transparent animated game clips, three complete mockups')
  await page.close()
 }
}finally{await browser.close()}
