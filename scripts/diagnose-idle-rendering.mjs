import {chromium} from 'playwright'
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 await page.goto('http://localhost:3001')
 await page.getByRole('status',{name:'Loading'}).waitFor({state:'hidden'})
 async function sample(name){console.log(name,await page.evaluate(()=>new Promise(resolve=>{const times=[];let prev=performance.now(),start=prev;function tick(now){times.push(now-prev);prev=now;if(now-start<3500)requestAnimationFrame(tick);else resolve({fps:1000/(times.reduce((a,b)=>a+b,0)/times.length),scale:document.querySelector('canvas').dataset.renderScale,hidden:document.hidden,playing:[...document.querySelectorAll('video')].filter(v=>!v.paused).length})}requestAnimationFrame(tick)})))}
 for(const section of ['Projects','Playground','Projects']){await page.getByText(section,{exact:true}).dispatchEvent('click');await page.waitForTimeout(15000);await sample(section)}
 await page.evaluate(()=>document.querySelector('[aria-label="Playground"]').style.visibility='hidden');await page.waitForTimeout(1000);await sample('visibility hidden')
 await page.evaluate(()=>document.querySelector('[aria-label="Playground"]').style.display='none');await page.waitForTimeout(1000);await sample('display none')
 await page.mouse.move(300,400);await page.waitForTimeout(1000);await sample('cursor moved')
}finally{await browser.close()}
