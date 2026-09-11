import { chromium, webkit } from 'playwright'
import fs from 'node:fs/promises'
const label = process.env.PERF_LABEL || 'baseline'
const engine = process.env.PERF_ENGINE || 'chrome'
const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ channel: 'chrome', headless: true }))
const results=[]
try {
for (const [width,height,mobile] of [[1440,900,false],[1920,1080,false],[390,844,true]]) {
 const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:mobile?2:1,isMobile:mobile})
 const page=await context.newPage()
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{
  window.__perf={frames:[],long:[],coverage:[]}
  new PerformanceObserver(l=>window.__perf.long.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({entryTypes:['longtask']})
  let last=0;function frame(t){if(last) window.__perf.frames.push({start:t,dt:t-last});last=t;requestAnimationFrame(frame)}requestAnimationFrame(frame)
  const get=CanvasRenderingContext2D.prototype.getImageData
  CanvasRenderingContext2D.prototype.getImageData=function(...args){const r=get.apply(this,args);if(r.width===256&&r.height===256){let sum=0;for(let i=3;i<r.data.length;i+=4)sum+=r.data[i]/255;window.__perf.coverage.push(sum/65536)}return r}
 })
 if(engine==='chrome'&&process.env.PERF_THROTTLE!=='0') {
  const cdp=await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:(mobile?5:10)*1000000/8,uploadThroughput:1000000/8})
  if(mobile)await cdp.send('Emulation.setCPUThrottlingRate',{rate:4})
 }
 for(const cache of ['cold','warm']){
  await page.goto('http://localhost:3001',{waitUntil:'domcontentloaded',timeout:90000})
  await page.locator('[aria-label="Loading"]').waitFor({state:'hidden',timeout:90000})
  const ready=await page.evaluate(()=>performance.now())
  await page.waitForTimeout(1500)
  await page.screenshot({timeout:8000,path:`reports/performance/${label}-${engine}-${width}-${cache}-nav.png`}).catch(e=>console.log('Screenshot unavailable:',e.message.split('\n')[0]))
  if(!mobile){await page.locator('nav[aria-label="Sections"]').getByText('Projects',{exact:true}).dispatchEvent('click');await page.waitForTimeout(6000)}
  await page.screenshot({timeout:8000,path:`reports/performance/${label}-${engine}-${width}-${cache}-projects.png`}).catch(e=>console.log('Screenshot unavailable:',e.message.split('\n')[0]))
  results.push(await page.evaluate(({width,height,cache,ready,errors})=>({width,height,cache,ready,errors,...window.__perf,resources:performance.getEntriesByType('resource').map(e=>({name:e.name,bytes:e.transferSize,duration:e.duration})),ttfb:performance.getEntriesByType('navigation')[0].responseStart}),{width,height,cache,ready,errors}))
  await fs.writeFile(`reports/performance/${label}-${engine}.json`,JSON.stringify(results,null,2))
  console.log(label,engine,width,cache,Math.round(ready),'ms')
 }
 await context.close()
}
await fs.writeFile(`reports/performance/${label}-${engine}.json`,JSON.stringify(results,null,2))
} finally { await browser.close() }
