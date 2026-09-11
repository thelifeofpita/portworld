import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const adaptiveUrl=`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(readFileSync('lib/adaptiveCollection.ts','utf8'))).toString('base64')}`
const collectionUrl=`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(readFileSync('lib/fitCollection.ts','utf8')).replace("'./adaptiveCollection'",JSON.stringify(adaptiveUrl))).toString('base64')}`
const source=stripTypeScriptTypes(readFileSync('lib/fitOrbit.ts','utf8')).replace("'./fitCollection'",JSON.stringify(collectionUrl))
const baseline=source.slice(0,source.indexOf('  // Equalize actual'))+'return best;\n}'
const importSource=s=>import(`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`)
const {fitOrbit}=await importSource(source)
const {fitOrbit:before}=await importSource(baseline)
const {playgroundContent}=await importSource(stripTypeScriptTypes(readFileSync('content/playgroundContent.ts','utf8')))
const ratios=playgroundContent.map(item=>item.aspectRatio)
const gap=(a,b)=>Math.hypot(Math.max(0,a.left-b.left-b.width,b.left-a.left-a.width),Math.max(0,a.top-b.top-b.height-25,b.top-a.top-a.height-25))
const spread=rects=>{
  const distances=rects.map((r,i)=>Math.min(...rects.filter((_,j)=>i!==j).map(q=>gap(r,q))))
  return {min:Math.min(...distances),max:Math.max(...distances)}
}
for(const [w,h] of [[1504,810],[1750,810],[940,505]]){
  const initial=before(ratios,w,h),result=fitOrbit(ratios,w,h)
  assert.equal(result.length,ratios.length)
  const areas=result.map(r=>r.width*r.height)
  assert(Math.max(...areas)/Math.min(...areas)<1.0001)
  const belowCenter={x:w/2,y:h*.82}
  const distanceBelow=Math.min(...result.map(r=>Math.hypot(Math.max(0,r.left-belowCenter.x,belowCenter.x-r.left-r.width),Math.max(0,r.top-belowCenter.y,belowCenter.y-r.top-r.height))))
  assert(distanceBelow<Math.max(80,w*.06),'The lower-center region must not remain an empty pocket')
  result.forEach((r,i)=>{
    assert(r.left>=0 && r.top>=0 && r.left+r.width<=w && r.top+r.height+25<=h)
    result.slice(i+1).forEach(q=>assert(gap(r,q)>=12))
  })
  const old=spread(initial),now=spread(result)
  assert(now.max-now.min<old.max-old.min,'Nearest-neighbor gap variation must decrease')
  console.log(`${w}x${h}: nearest gaps ${old.min.toFixed(1)}–${old.max.toFixed(1)} → ${now.min.toFixed(1)}–${now.max.toFixed(1)} px; equal area and no overlaps`)
}
