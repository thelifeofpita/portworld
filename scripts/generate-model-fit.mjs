// Run against the isolated server. Uses the exact browser rasterizer as the old runtime fit.
import {chromium} from 'playwright'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
const source=await fs.readFile('content/projectsContent.ts','utf8')
const paths=[...source.matchAll(/thumbModel:\s*'([^']+)'/g)].map(m=>m[1])
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage()
await page.route('**/__fit/**',async route=>{
 const suffix=new URL(route.request().url()).pathname.replace('/__fit/','')
 if(suffix==='index') return route.fulfill({contentType:'text/html',body:'<script type="importmap">{"imports":{"three":"/__fit/build/three.module.js","three/addons/":"/__fit/examples/jsm/"}}</script>'})
 await route.fulfill({contentType:'text/javascript',body:await fs.readFile('node_modules/three/'+suffix,'utf8')})
})
await page.route('**/generated/**', async route => route.fulfill({contentType:'model/gltf-binary', body:await fs.readFile('public'+new URL(route.request().url()).pathname)}))
await page.goto('http://localhost:3001/__fit/index')
const result={}
for(const src of paths){
 const coverage=await page.evaluate(async src=>{
  const THREE=await import('/__fit/build/three.module.js')
  const {GLTFLoader}=await import('/__fit/examples/jsm/loaders/GLTFLoader.js')
  const {DRACOLoader}=await import('/__fit/examples/jsm/loaders/DRACOLoader.js')
  const draco=new DRACOLoader().setDecoderPath('/draco/')
  const {scene}=await new GLTFLoader().setDRACOLoader(draco).loadAsync(src)
  if(src.includes('surfthespike')) {for(const child of [...scene.children])if(!['Google_Pixel_9_Pro_XL003','Google Pixel 9 Pro XL.003','Can'].includes(child.name))scene.remove(child);scene.getObjectByName('Can').position.x=0}
  scene.updateMatrixWorld(true)
  const box=new THREE.Box3().setFromObject(scene),size=box.getSize(new THREE.Vector3())
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';const vertex=new THREE.Vector3()
  scene.traverse(object=>{if(!object.isMesh)return;const geometry=object.geometry,positions=geometry.attributes.position,indices=geometry.index,count=indices?indices.count:positions.count
   for(let i=0;i<count;i+=3){ctx.beginPath();for(let j=0;j<3;j++){vertex.fromBufferAttribute(positions,indices?indices.getX(i+j):i+j).applyMatrix4(object.matrixWorld);const x=(vertex.x-box.min.x)/size.x*256,y=(vertex.y-box.min.y)/size.y*256;if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath();ctx.fill()}
  })
  const pixels=ctx.getImageData(0,0,256,256).data;let sum=0;for(let i=3;i<pixels.length;i+=4)sum+=pixels[i]/255
  draco.dispose();return sum/65536
 },src)
 const bytes=await fs.readFile('public'+src.split('?')[0])
 result[src]={coverage,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}
 console.log(src,coverage)
}
await fs.writeFile('content/model-fit.json',JSON.stringify(result,null,2)+'\n')
await browser.close()
