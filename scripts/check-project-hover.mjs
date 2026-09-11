import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://localhost:3000/?materialAudit=1')
 await page.getByRole('status',{name:'Loading'}).waitFor({state:'hidden',timeout:60000})
 await page.getByText('Projects',{exact:true}).dispatchEvent('click')
 await page.waitForFunction(()=>!!window.__duoAudit)
 await page.waitForTimeout(4000)
 const glow = index => page.evaluate(index => {
  const gl=window.__duoAudit.renderScene.__r3f.root.getState().gl
  const program=gl.info.programs.find(p=>p.getUniforms().map.uBigGlowId)
  const uniforms=program.getUniforms().map
  const context=gl.getContext()
  return {id:context.getUniform(program.program,context.getUniformLocation(program.program, `uBigGlowId[${index}]`)),opacity:context.getUniform(program.program,context.getUniformLocation(program.program, `uBigGlowOpacity[${index}]`))}
 }, index)
 const points=await page.evaluate(()=>{
  const scene=window.__duoAudit.renderScene
  const state=scene.__r3f.root.getState()
  const points=[]
  scene.traverse(o=>{
   if(o.userData.projectHitTarget===undefined)return
   const center=o.position.clone().set(0,0,0).applyMatrix4(o.matrixWorld).project(state.camera)
   const edge=o.position.clone().set(.47,0,0).applyMatrix4(o.matrixWorld).project(state.camera)
   points.push({index:o.userData.projectHitTarget,center:{x:(center.x+1)*720,y:(1-center.y)*450},edge:{x:(edge.x+1)*720,y:(1-edge.y)*450},visible:o.visible})
  })
  return points.sort((a,b)=>a.index-b.index)
 })
 assert.equal(points.length,6)
 assert(points.every(p=>p.visible===false),'Hit volumes must not render')
 for(const point of points){
  await page.mouse.move(720,850)
  await page.mouse.move(point.edge.x,point.edge.y)
  await page.waitForTimeout(45)
  assert.equal(await page.locator('canvas').evaluate(e=>e.style.cursor),'pointer',`Model ${point.index} padded edge should hover`)
  const highlight=await glow(point.index)
  assert.equal(highlight.id,(point.index+1)/16, 'Highlight switches immediately to the new model')
  assert(highlight.opacity > 0 && highlight.opacity < .95, 'Highlight should start immediately and fade in smoothly')
  await page.waitForTimeout(400)
  assert((await glow(point.index)).opacity > .95, 'Highlight should reach full strength after the fade')
 }
 // Consecutive models must highlight without waiting for the previous fade.
 await page.mouse.move(points[0].center.x,points[0].center.y)
 await page.waitForTimeout(400)
 const before = (await glow(0)).opacity
 await page.mouse.move(points[3].center.x,points[3].center.y)
 await page.waitForTimeout(45)
 const leaving = (await glow(0)).opacity
 const entering = (await glow(3)).opacity
 assert(leaving > 0 && leaving < before, 'Previous highlight must remain visible and fade out during handoff')
 assert(entering > 0 && entering < .95, 'Next highlight must fade in simultaneously')
 await page.screenshot({path:'/tmp/project-hover-fast-handoff.png'})
 await page.mouse.click(points[3].edge.x,points[3].edge.y)
 await page.locator('iframe[src*="VykD83mmSTo"]').first().waitFor({state:'attached',timeout:15000})
 assert.deepEqual(errors,[])
 console.log('PASS: six padded hover targets, immediate pointer feedback, smooth highlight fade, fast handoff, padded-edge click opens Twix')
} finally { await browser.close() }
