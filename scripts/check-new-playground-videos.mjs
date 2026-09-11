import { chromium } from 'playwright'
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto((process.env.TEST_BASE_URL || 'http://localhost:3000'),{waitUntil:'domcontentloaded'})
  await page.waitForTimeout(6000)
  await page.locator('nav[aria-label="Sections"]').getByText('Playground',{exact:true}).dispatchEvent('click')
  await page.waitForTimeout(3000)
  await page.mouse.move(0,0)
  for (const [title,file,duration] of [['Stickers','stickers-loop.mp4',2],['Jewellery in motion','bracelet.mp4',10],['Jewellery in motion','neck-chain.mp4',10],['Swords, wings & bassball','wings.mp4',2.08]]) {
    const card=page.getByRole('button',{name:`Open ${title}`,exact:true})
    const selector=`video[data-playback-id="/playground/${file}"]`
    const video=card.locator(selector)
    await video.waitFor({state:'attached'})
    await page.waitForFunction(file=>{
      const v=[...document.querySelectorAll('video')].find(v=>v.dataset.playbackId?.endsWith(file))
      return v && v.readyState>=2 && !v.paused
    },file)
    const state=await video.evaluate(v=>({duration:v.duration,loop:v.loop,muted:v.muted,time:v.currentTime,width:v.videoWidth,height:v.videoHeight}))
    if(Math.abs(state.duration-duration)>.1 || !state.loop || !state.muted)throw new Error(JSON.stringify(state))
    await card.click()
    const detail=page.getByRole('dialog').locator(selector)
    await detail.waitFor({state:'visible'})
    await page.waitForFunction(file=>{
      const v=[...document.querySelectorAll('[role="dialog"] video')].find(v=>v.dataset.playbackId?.endsWith(file))
      return v && !v.paused && v.readyState>=2
    },file,{timeout:30000})
    if(title==='Jewellery in motion') {
      const videos=page.getByRole('dialog').locator('video')
      await page.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"] video')].every(v=>!v.paused && v.readyState>=2),null,{timeout:30000})
      const states=await videos.evaluateAll(vs=>vs.map(v=>({paused:v.paused,ready:v.readyState})))
      if(states.length!==4 || states.some(v=>v.paused || v.ready<2))throw new Error('All four jewellery pieces must play together')
    }
    await page.screenshot({path:`/tmp/${file}-detail.png`})
    await page.getByRole('button',{name:'Close collection'}).click()
    await page.waitForTimeout(500)
    console.log('PASS',title,state)
  }
  if(errors.length)throw new Error(errors.join('\n'))
} finally {await browser.close()}
