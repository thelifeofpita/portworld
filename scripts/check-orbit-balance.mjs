import {readFile,writeFile} from 'node:fs/promises'
import ts from 'typescript'
import assert from 'node:assert/strict'
const adaptive=ts.transpileModule(await readFile('lib/adaptiveCollection.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const collection=ts.transpileModule(await readFile('lib/fitCollection.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'./adaptiveCollection'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(adaptive).toString('base64')))
const source=await readFile(process.env.ORBIT_SOURCE || 'lib/fitOrbit.ts','utf8')
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'./fitCollection'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(collection).toString('base64')))
const {fitOrbit}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const content=await readFile('content/playgroundContent.ts','utf8')
const ratios=[...content.matchAll(/\{ aspectRatio: ([\d.]+), title:/g)].map(m=>+m[1])
const results=[]
for(const [w,h] of [[1758,796],[1354,729],[1805,875]])for(let seed=1;seed<=12;seed++){
 const start=performance.now(),r=fitOrbit(ratios,w,h,false,seed)
 assert.equal(r.length,17)
 const gap=Math.max(12,Math.min(22,w*.012))
 const cw=Math.min(270,w*.23),ch=Math.min(240,h*.32)
 const center={left:(w-cw)/2,top:(h-ch)/2,width:cw,height:ch-25}
 const overlaps=(a,b)=>a.left<b.left+b.width+gap-.01 && a.left+a.width+gap>b.left+.01 && a.top<b.top+b.height+25+gap-.01 && a.top+a.height+25+gap>b.top+.01
 for(let i=0;i<r.length;i++){const a=r[i];assert(a.width>1 && a.left>=11.99 && a.top>=11.99 && a.left+a.width<=w-11.99 && a.top+a.height+25<=h-11.99);assert(!overlaps(a,center));for(let j=0;j<i;j++)assert(!overlaps(a,r[j]))}
 const area=r[0].width*r[0].height
 assert(r.every(a=>Math.abs(a.width*a.height-area)<.01))
 const cx=r.reduce((s,a)=>s+a.left+a.width/2,0)/r.length/w
 const cy=r.reduce((s,a)=>s+a.top+(a.height+25)/2,0)/r.length/h
 const left=r.reduce((s,a)=>s+Math.max(0,Math.min(a.width,w/2-a.left))*a.height,0)/(area*r.length)
 if(!process.env.ORBIT_SOURCE){
  assert(Math.abs(cx-.5)<.01 && Math.abs(cy-.5)<.01, 'Artwork should stay centered across random seeds')
  assert(Math.abs(left-.5)<.04, 'Left/right visual weight should remain balanced')
 }
 results.push({w,h,seed,cx,cy,left,area,ms:performance.now()-start})
}
console.log(JSON.stringify({worstCenter:Math.max(...results.map(r=>Math.max(Math.abs(r.cx-.5),Math.abs(r.cy-.5)))),worstLeft:Math.max(...results.map(r=>Math.abs(r.left-.5))),meanArea:results.reduce((s,r)=>s+r.area,0)/results.length,meanMs:results.reduce((s,r)=>s+r.ms,0)/results.length}))
await writeFile(process.env.ORBIT_REPORT || '/tmp/orbit-balance-after.json',JSON.stringify(results,null,2))
