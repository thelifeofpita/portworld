import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
const browser=await chromium.launch({channel:'chrome'})
const results=[]
try {
 for(const width of [1440,390]) {
  const page=await browser.newPage({viewport:{width,height:900}})
  await page.addInitScript(()=>{window.__long=[];new PerformanceObserver(l=>window.__long.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({entryTypes:['longtask']})})
  await page.goto('http://localhost:3001',{waitUntil:'domcontentloaded'})
  await page.getByRole('status',{name:'Loading'}).waitFor({state:'hidden',timeout:120000})
  const ready=await page.evaluate(()=>performance.now())
  for(const section of ['Playground','Projects']) {
   const start=await page.evaluate(()=>performance.now())
   await page.getByText(section,{exact:true}).first().dispatchEvent('click')
   await page.waitForTimeout(2500)
   const tasks=await page.evaluate(start=>window.__long.filter(t=>t.start>=start),start)
   results.push({width,section,readyMs:Math.round(ready),longTasks:tasks,maxTaskMs:Math.max(0,...tasks.map(t=>t.duration))})
  }
  await page.close()
 }
 console.log(JSON.stringify(results,null,2))
 await writeFile(`reports/first-entry-${process.env.PERF_LABEL||'baseline'}.json`,JSON.stringify(results,null,2))
} finally {await browser.close()}
