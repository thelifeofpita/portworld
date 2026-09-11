import {chromium} from 'playwright'
import fs from 'node:fs/promises'
const browser=await chromium.launch({channel:'chrome',headless:true})
const results=[]
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 await page.goto('http://localhost:3001')
 await page.getByRole('status',{name:'Loading'}).waitFor({state:'hidden'})
 for(const section of ['Projects','Playground','Projects']){
  await page.getByText(section,{exact:true}).dispatchEvent('click');await page.waitForTimeout(12000)
  const sampling=page.evaluate(()=>new Promise(resolve=>{
   const frames=[],long=[];let prev=performance.now(),start=prev
   const observer=new PerformanceObserver(l=>long.push(...l.getEntries().map(e=>e.duration)));observer.observe({entryTypes:['longtask']})
   function frame(now){frames.push(now-prev);prev=now;if(now-start<5000)requestAnimationFrame(frame);else{observer.disconnect();resolve({frames,long,scale:document.querySelector('canvas').dataset.renderScale})}}requestAnimationFrame(frame)
  }))
  for(let i=0;i<40;i++){await page.mouse.move(720+80*Math.sin(i/5),450+60*Math.cos(i/5));await page.waitForTimeout(125)}
  const data=await sampling;results.push({section,...data})
  console.log(section,1000/(data.frames.reduce((a,b)=>a+b,0)/data.frames.length),'fps',data.scale)
 }
 await fs.writeFile('reports/performance/final-active-chrome.json',JSON.stringify(results,null,2))
}finally{await browser.close()}
