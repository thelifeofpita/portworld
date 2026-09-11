import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import sharp from 'sharp'
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 const errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 page.on('console',m=>{if(m.type()==='error' && /shader|WebGLProgram/i.test(m.text()))errors.push(m.text())})
 await page.goto('http://localhost:3000/?materialAudit=1')
 await page.getByRole('status',{name:'Loading'}).waitFor({state:'hidden',timeout:90000})
 await page.getByText('Projects',{exact:true}).dispatchEvent('click')
 await page.waitForFunction(()=>!!window.__duoAudit)
 await page.waitForTimeout(4000)
 const maps=await page.evaluate(()=>{
  const results=[]
  window.__duoAudit.model.traverse(o=>{
   if(!o.isMesh || !o.material.sheenRoughnessMap)return
   const m=o.material,t=m.sheenRoughnessMap
   results.push({mesh:o.name,width:t.image.width,height:t.image.height,flipY:t.flipY,colorSpace:t.colorSpace,sheen:m.sheen,roughness:m.sheenRoughness,normal:!!m.normalMap,base:!!m.map})
  })
  return results
 })
 assert.equal(maps.length,7)
 for(const m of maps){assert.equal(m.sheen,1);assert.equal(m.roughness,1);assert.equal(m.flipY,false);assert.equal(m.colorSpace,'');assert(m.normal && m.base);assert(m.width>=512)}
 await page.screenshot({path:'/tmp/duolingo-baked-sheen.png'})
 await page.evaluate(()=>window.__duoAudit.model.traverse(o=>{if(o.isMesh && o.material.sheenRoughnessMap){o.material.sheenRoughnessMap=null;o.material.needsUpdate=true}}))
 await page.waitForTimeout(1500)
 await page.screenshot({path:'/tmp/duolingo-uniform-sheen.png'})
 const region={left:130,top:330,width:235,height:200}
 const a=await sharp('/tmp/duolingo-baked-sheen.png').extract(region).removeAlpha().raw().toBuffer()
 const b=await sharp('/tmp/duolingo-uniform-sheen.png').extract(region).removeAlpha().raw().toBuffer()
 const difference=a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length
 assert(difference>.2,'Baked roughness must visibly affect the material')
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({maps,meanPixelDifference:difference}))
}finally{await browser.close()}
