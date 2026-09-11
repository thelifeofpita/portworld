import {chromium,webkit} from 'playwright'
import fs from 'node:fs/promises'
const engine=process.env.PERF_ENGINE||'chrome',label=process.env.PERF_LABEL||'baseline'
const browser=await (engine==='webkit'?webkit.launch():chromium.launch({channel:'chrome',headless:true}))
const results=[]
try{
for(const dark of (process.env.PERF_LIGHT_ONLY ? [false] : [false,true])){
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(dark=>{localStorage.setItem('portworld-debug-state',JSON.stringify({bgColor:dark?'#161616':'#fff8ed',fgColor:dark?'#f0f0f0':'#241b2b',accentBaseColor:'#ab4646',accentFocusColor:'#8f9bf6'}));let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296)},dark)
 await page.goto('http://localhost:3001')
 await page.getByRole('status',{name:'Loading'}).waitFor({state:'hidden',timeout:90000})
 await page.waitForTimeout(1500)
 const nav=page.locator('nav[aria-label="Sections"]')
 for(const section of ['Projects','Playground','Projects']){
  await nav.getByText(section,{exact:true}).dispatchEvent('click')
  await page.waitForTimeout(15000)
  const metrics=await page.evaluate(()=>new Promise(resolve=>{
   const frames=[],long=[];let last=performance.now(),start=last
   const observer=new PerformanceObserver(l=>long.push(...l.getEntries().map(e=>e.duration)));observer.observe({entryTypes:['longtask']})
   function frame(now){frames.push(now-last);last=now;if(now-start<5000)requestAnimationFrame(frame);else{observer.disconnect();resolve({frames,long,videos:[...document.querySelectorAll('video')].map(v=>({src:v.currentSrc,paused:v.paused,time:v.currentTime,ready:v.readyState})),scale:document.querySelector('canvas')?.dataset.renderScale})}}requestAnimationFrame(frame)
  }))
  results.push({section,dark,errors,...metrics})
  await fs.writeFile(`reports/performance/${label}-${engine}-interactions.json`,JSON.stringify(results,null,2))
  await page.screenshot({timeout:8000,path:`reports/performance/${label}-${engine}-${dark?'dark':'light'}-${section}.png`}).catch(e=>console.log('Screenshot unavailable:',e.message.split('\n')[0]))
  console.log(label,engine,dark,section,'playing',metrics.videos.filter(v=>!v.paused).length)
 }
 await page.close()
}
await fs.writeFile(`reports/performance/${label}-${engine}-interactions.json`,JSON.stringify(results,null,2))
}finally{await browser.close()}
