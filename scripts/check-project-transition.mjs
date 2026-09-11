import { chromium } from 'playwright'
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://localhost:3000/?materialAudit=1',{waitUntil:'domcontentloaded'})
  await page.waitForTimeout(6000)
  const nav=page.locator('nav[aria-label="Sections"]')
  await nav.getByText('Projects',{exact:true}).dispatchEvent('click')
  await page.waitForFunction(()=>!!window.__duoAudit)
  await page.waitForTimeout(3000)
  await nav.getByText('Playground',{exact:true}).dispatchEvent('click')
  await page.waitForTimeout(1800)
  await page.evaluate(()=>{
    window.__entryFrames=[]
    const start=performance.now()
    const tick=()=>{
      const slot=document.querySelector('[class*="bigProjectModelSlot"]')
      const pane=slot.closest('[class*="paneLayer"]')
      let outer
      window.__duoAudit.renderScene.traverse(o=>{
        if(o.isMesh && o.userData.projectMaskId===1/16){
          outer=o
          while(outer.parent && outer.parent!==window.__duoAudit.renderScene)outer=outer.parent
        }
      })
      const rect=slot.getBoundingClientRect()
      window.__entryFrames.push({opacity:Number(pane.style.opacity),x:rect.x,y:rect.y,scale:outer?.scale.x/rect.height})
      if(performance.now()-start<2200)requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await nav.getByText('Projects',{exact:true}).dispatchEvent('click')
  await page.waitForTimeout(2400)
  const frames=await page.evaluate(()=>window.__entryFrames)
  const visible=frames.filter(f=>f.opacity>.15 && f.scale>0)
  if(visible.length<4)throw new Error('Too few transition samples')
  const scales=visible.map(f=>f.scale)
  const spread=Math.max(...scales)/Math.min(...scales)
  if(spread>1.05)throw new Error(`Model still grows during entrance: ${spread}`)
  const travel=Math.hypot(visible.at(-1).x-visible[0].x,visible.at(-1).y-visible[0].y)
  if(travel<5)throw new Error(`No directional entrance: ${travel}px`)
  if(!visible.some(f=>f.opacity<.8))throw new Error('No section fade')
  await page.screenshot({path:'/tmp/projects-directional-entry.png'})
  if(errors.length)throw new Error(errors.join('\n'))
  console.log('PASS: directional movement with section fade; no grow-from-zero', {travel,scaleRatio:spread,samples:visible.length})
} finally {await browser.close()}
