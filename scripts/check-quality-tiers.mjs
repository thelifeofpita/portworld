// Synthetic frame pacing exercises the real hysteresis and render-target resize.
// It changes only the test browser's RAF timestamps; no production test controls.
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import sharp from 'sharp'
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile})
 page.on('pageerror', e=>console.log('PAGE ERROR',e.message))
 page.on('console', e=>{if(e.type()==='error'||/WebGL|INVALID|shadow/i.test(e.text()))console.log('CONSOLE',e.text().slice(0,500))})
 await page.addInitScript(mobile=>{
  const realNow=performance.now.bind(performance)
  const origin=realNow()
  if(mobile) Object.defineProperty(performance, 'now', {value:()=>origin+(realNow()-origin)*.8})
  const raf=window.requestAnimationFrame.bind(window)
  window.__slowFrames=false
  window.requestAnimationFrame=callback=>raf(t=>{if(window.__slowFrames)setTimeout(()=>callback(performance.now()),30);else callback(t)})
  localStorage.setItem('portworld-debug-state',JSON.stringify({bgColor:'#fff8ed',fgColor:'#241b2b'}))
 },mobile)
 await page.goto('http://localhost:3001')
 await page.getByRole('status',{name:'Loading'}).waitFor({state:'hidden',timeout:60000})
 if(!mobile) await page.getByText('Projects',{exact:true}).dispatchEvent('click')
 await page.waitForTimeout(mobile?22000:15000)
 const seen=new Set()
 for(let i=0;i<3;i++){
  const scale=await page.locator('canvas').first().getAttribute('data-render-scale')
  seen.add(scale)
  const pixels = await page.screenshot({path:`reports/performance/quality-${mobile?'mobile':'desktop'}-${scale}.png`,timeout:10000})
  if(!mobile) {
    const {data,info}=await sharp(pixels).extract({left:0,top:100,width:600,height:750}).raw().toBuffer({resolveWithObject:true})
    let colored=0;for(let n=0;n<data.length;n+=info.channels)if(Math.max(data[n],data[n+1],data[n+2])-Math.min(data[n],data[n+1],data[n+2])>60)colored++
    assert(colored>5000, 'Project materials must survive static shadow caching and tier changes')
  }
  await page.evaluate(()=>window.__slowFrames=true)
  await page.waitForTimeout(4500)
 }
 const scale=await page.locator('canvas').first().getAttribute('data-render-scale');seen.add(scale)
 await page.screenshot({path:`reports/performance/quality-${mobile?'mobile':'desktop'}-${scale}.png`,timeout:10000})
 console.log('Quality tiers captured',mobile?'mobile':'desktop',[...seen])
 await page.close()
}
}finally{await browser.close()}
