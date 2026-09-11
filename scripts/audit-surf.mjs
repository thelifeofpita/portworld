import { chromium } from 'playwright'
import sharp from 'sharp'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
await page.goto('http://localhost:3000/?materialAudit=1',{waitUntil:'domcontentloaded'})
await page.waitForTimeout(6000)
await page.locator('nav[aria-label="Sections"]').getByText('Projects',{exact:true}).dispatchEvent('click')
await page.waitForTimeout(3000)
await page.waitForFunction(()=>!!window.__duoAudit,{},{timeout:30000})
const state=await page.evaluate(()=>{
  const scene=window.__duoAudit.renderScene,materials=[]
  scene.traverse(o=>{
    if(o.userData.projectMaskId!==1/16 || !o.isMesh)return
    for(const m of Array.isArray(o.material)?o.material:[o.material])materials.push({name:m.name,env:!!m.envMap,intensity:m.envMapIntensity,color:m.color.toArray(),normal:!!m.normalMap,roughnessMap:!!m.roughnessMap,roughness:m.roughness,metalness:m.metalness,emission:m.emissiveIntensity,emissiveMap:!!m.emissiveMap})
  })
  return materials
})
const label=state.find(m=>m.name==='Label'),frame=state.find(m=>m.name==='GP9XL_Frame.001')
if(!label?.roughnessMap || label.metalness!==0.78 || !frame?.env || frame.color[0]<0.1)throw new Error('Source material restoration failed')
const screen=state.find(m=>m.name.startsWith('GP9XL_Screen'))
if(screen?.emission!==1.5 || !screen.emissiveMap || screen.roughness!==0.01)throw new Error('Screen emission/glass differs from Blender')
if(!state.find(m=>m.name==='silver 1')?.normal)throw new Error('Missing can metal normal map')
if(!state.find(m=>m.name==='silver 1.001')?.normal)throw new Error('Missing tab normal map')
await page.screenshot({path:'/tmp/surf-lit.png'})
for (const angle of [Math.PI, Math.PI * 1.5]) {
  await page.evaluate(angle => window.__duoAudit.renderScene.traverse(o => {
    if(o.userData.projectMaskId!==1/16 || !o.isMesh)return
    for(const m of Array.isArray(o.material)?o.material:[o.material]) {
      if(m.name==='Label' || m.name.startsWith('silver'))m.envMapRotation.y=angle
    }
  }),angle)
  await page.waitForTimeout(400)
  await page.screenshot({path:`/tmp/surf-angle-${Math.round(angle*100)}.png`,clip:{x:310,y:80,width:210,height:295}})
}
await page.evaluate(() => window.__duoAudit.renderScene.traverse(o => {
  if(o.userData.projectMaskId!==1/16 || !o.isMesh)return
  for(const m of Array.isArray(o.material)?o.material:[o.material]) {
    if(m.name==='Label' || m.name.startsWith('silver'))m.envMapRotation.y=Math.PI/2
  }
}))
await page.evaluate(()=>window.__duoAudit.renderScene.traverse(o=>{
  if(o.userData.projectMaskId!==1/16 || !o.isMesh)return
  for(const m of Array.isArray(o.material)?o.material:[o.material])m.envMapIntensity=0
}))
await page.waitForTimeout(1200)
await page.screenshot({path:'/tmp/surf-no-reflections.png'})
const region={left:250,top:110,width:160,height:220}
const a=await sharp('/tmp/surf-lit.png').extract(region).removeAlpha().raw().toBuffer()
const b=await sharp('/tmp/surf-no-reflections.png').extract(region).removeAlpha().raw().toBuffer()
const difference=a.reduce((sum,value,i)=>sum+Math.abs(value-b[i]),0)/a.length
if(difference<1)throw new Error('Environment controls have no visible effect')
console.log('PASS: authored colors, metalness, roughness/normal maps; reflection response:',difference)
await browser.close()
