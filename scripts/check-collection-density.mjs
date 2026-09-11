import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import sharp from 'sharp'
const adaptiveUrl=`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(readFileSync('lib/adaptiveCollection.ts','utf8'))).toString('base64')}`
const load=async path=>import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(readFileSync(path,'utf8')).replace("'./adaptiveCollection'",JSON.stringify(adaptiveUrl))).toString('base64')}`)
const {fitCollection}=await load('lib/fitCollection.ts')
const {playgroundContent}=await load('content/playgroundContent.ts')
for(const title of ['Cooler Venus','Album cover collection','Woodstock 29']){
  const item=playgroundContent.find(item=>item.title===title)
  const ratios=await Promise.all(item.media.map(async p=>{const m=await sharp(`public${p.src}`).metadata();return p.crop?.aspectRatio ?? m.width/m.height}))
  for(const [w,h] of [[1504,876],[940,526],[366,650]]){
    const rects=fitCollection(ratios,w,h),areas=rects.map(r=>r.width*r.height)
    assert.equal(rects.length,ratios.length)
    assert(areas.every(area=>area>0))
    if(title==='Cooler Venus') assert(areas.reduce((s,a)=>s+a,0)/(w*h)>.7,'Cooler Venus must occupy most of the content viewport')
    rects.forEach((r,i)=>{
      assert(r.left>=-.01&&r.top>=-.01&&r.left+r.width<=w+.01&&r.top+r.height<=h+.01)
      assert(Math.abs(r.width/r.height-ratios[i])<.00001)
      rects.slice(i+1).forEach(q=>assert(r.left+r.width<=q.left || q.left+q.width<=r.left || r.top+r.height<=q.top || q.top+q.height<=r.top))
    })
    console.log(title,w,h,`${Math.round(areas.reduce((s,a)=>s+a,0)/(w*h)*100)}% artwork coverage; native ratios, no overlaps`)
  }
}
