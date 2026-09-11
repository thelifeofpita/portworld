import { chromium } from 'playwright'
import sharp from 'sharp'
const browser = await chromium.launch({channel:'chrome',headless:true})
const page = await browser.newPage({viewport:{width:1440,height:900}})
await page.goto('http://localhost:3000/?materialAudit=1',{waitUntil:'domcontentloaded'})
await page.waitForTimeout(6000)
await page.locator('nav[aria-label="Sections"]').getByText('Projects',{exact:true}).dispatchEvent('click')
await page.waitForTimeout(3500)
console.log(await page.evaluate(()=>{
  const {model,renderScene}=window.__duoAudit
  const materials=[],lights=[]
  model.traverse(o=>{if(o.isMesh){const m=o.material;materials.push({mesh:o.name,type:m.type,map:m.map?.uuid,normal:m.normalMap?.uuid,normalScale:m.normalScale?.toArray(),emissive:m.emissive?.toArray(),intensity:m.emissiveIntensity,env:m.envMapIntensity,layer:o.layers.mask,roughness:m.roughness,roughnessMap:!!m.roughnessMap})}})
  renderScene.traverse(o=>{if(o.isLight)lights.push({name:o.name,type:o.type,intensity:o.intensity,layer:o.layers.mask})})
  return {materials,lights}
}))
await page.screenshot({path:'/tmp/duo-lit.png'})
await page.evaluate(()=>{
  const {model,renderScene}=window.__duoAudit
  renderScene.traverse(o=>{if(o.isLight)o.intensity=0})
  model.traverse(o=>{if(o.isMesh)o.material.envMapIntensity=0})
})
await page.waitForTimeout(1500)
await page.screenshot({path:'/tmp/duo-unlit-audit.png'})
const region={left:250,top:350,width:170,height:210}
const lit=await sharp('/tmp/duo-lit.png').extract(region).removeAlpha().raw().toBuffer()
const dark=await sharp('/tmp/duo-unlit-audit.png').extract(region).removeAlpha().raw().toBuffer()
const difference=lit.reduce((sum,v,i)=>sum+Math.abs(v-dark[i]),0)/lit.length
console.log('Lighting response, mean RGB difference:',difference)
if(difference<10) throw new Error('Duolingo is not responding to its lighting controls')
await browser.close()
