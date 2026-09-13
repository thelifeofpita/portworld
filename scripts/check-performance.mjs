import {chromium,webkit} from 'playwright'
import assert from 'node:assert/strict'
const BASE=process.env.TEST_BASE_URL||'http://localhost:3001'
const engine=process.env.PERF_ENGINE||'chrome'
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'chrome',headless:true}))
try{
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(BASE)
  await page.getByRole('status',{name:'Loading'}).waitFor({state:'hidden',timeout:60000})
  assert.equal(await page.locator('canvas').count(),1,'Only one experience initializes')
  await page.waitForTimeout(1500)
  await page.getByText('Playground',{exact:true}).dispatchEvent('click')
  const gallery=page.locator('[aria-label="Playground"]')
  await gallery.getByRole('button',{name:'Open Jewelry'}).waitFor({timeout:30000})
  await page.waitForTimeout(6500)
  const preview=gallery.locator('video[data-playback-id="/playground/neck-chain.mp4"]')
  const before=await preview.evaluate(v=>({time:v.currentTime,at:performance.now(),duration:v.duration}))
  assert(before.duration>0)
  const playback=await gallery.locator('video').evaluateAll(vs=>vs.map(v=>({paused:v.paused,visible:Number(v.style.opacity)>0})))
  assert(playback.some(v=>v.paused),'Hidden decoders suspend')
  assert(playback.filter(v=>!v.paused).length<=12,'Only current/next previews decode')
  const rects=await gallery.locator('button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()))
  await page.waitForTimeout(1200)
  const later=await gallery.locator('button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()))
  assert(rects.every((r,i)=>['x','y','width','height'].every(k=>Math.abs(r[k]-later[i][k])<.5)),'Preview cuts do not reflow cards')
  await gallery.getByRole('button',{name:'Open Jewelry'}).click()
  const dialog=page.getByRole('dialog',{name:'Jewelry'})
  await page.waitForFunction(()=>{const vs=[...document.querySelectorAll('[role="dialog"] video')];return vs.length===4&&vs.every(v=>!v.paused&&v.readyState>=2)},null,{timeout:45000})
  assert(await gallery.locator('video').evaluateAll(vs=>vs.every(v=>v.paused)),'Covered previews pause')
  const detail=dialog.locator('video[data-playback-id="/playground/neck-chain.mp4"]')
  const current=await detail.evaluate(v=>({time:v.currentTime,duration:v.duration}))
  assert(Math.abs(current.duration-before.duration)<.1,'Preview and detail durations agree')
  await page.waitForTimeout(900)
  assert.notEqual(await detail.evaluate(v=>v.currentTime),current.time,'Detail video advances')
  const closing=await detail.evaluate(v=>({time:v.currentTime,at:performance.now(),duration:v.duration}))
  await page.getByRole('button',{name:'Close collection'}).click()
  await page.waitForFunction(()=>{const v=document.querySelector('[aria-label="Playground"] video[data-playback-id="/playground/neck-chain.mp4"]');return v&&!v.paused&&v.readyState>=2},null,{timeout:12000})
  const resumed=await preview.evaluate(v=>({time:v.currentTime,at:performance.now()}))
  const expected=(closing.time+(resumed.at-closing.at)/1000)%closing.duration
  const difference=Math.abs(expected-resumed.time)
  assert(Math.min(difference,closing.duration-difference)<.6,'Preview returns to the same elapsed timeline')
  await gallery.getByRole('button',{name:'Open L(P)OOP'}).click()
  const game=page.locator('iframe[title="L(P)OOP playable game"]')
  await game.waitFor({state:'attached'})
  await game.evaluate(e=>{e.dataset.stateToken='kept'})
  await page.getByRole('button',{name:'Screenshots',exact:true}).click()
  assert.equal(await game.getAttribute('data-state-token'),'kept')
  // Scoped to this dialog: a previously opened collection stays mounted (that
  // retention is the behaviour being asserted just above), so an unscoped
  // "Close collection" matches every collection that has been opened this run.
  const gameDialog=page.getByRole('dialog',{name:'L(P)OOP',exact:true})
  await gameDialog.getByRole('button',{name:'Close collection'}).click()
  await gallery.getByRole('button',{name:'Open L(P)OOP'}).click()
  assert.equal(await game.getAttribute('data-state-token'),'kept','Closing/reopening preserves the game iframe')
  await gameDialog.getByRole('button',{name:'Close collection'}).click()
  if(!mobile){
   for(let i=0;i<3;i++){
    await page.getByText('Projects',{exact:true}).dispatchEvent('click');await page.waitForFunction(()=>document.querySelector('[aria-label="Playground"]')?.closest('[aria-hidden]')?.getAttribute('aria-hidden')==='true',null,{timeout:15000});await page.waitForTimeout(500)
    assert(await gallery.locator('video').evaluateAll(vs=>vs.every(v=>v.paused)),'Leaving Playground pauses its videos')
    await page.getByText('Playground',{exact:true}).dispatchEvent('click');await page.waitForTimeout(1800)
   }
   assert.equal(await gallery.locator('video').count(),15,'Section changes do not accumulate decoders')
  }
  const externalErrors = errors.filter(error => /itch.zone|enumerateDevices/.test(error))
  if (externalErrors.length) console.log('Embedded game browser restrictions:', externalErrors)
  assert.deepEqual(errors.filter(error => !externalErrors.includes(error)),[])
  console.log('PASS',engine,mobile?'mobile':'desktop','layout, media suspension/resume, simultaneous details, iframe state, section lifecycle')
  await page.close()
 }
}finally{await browser.close()}
