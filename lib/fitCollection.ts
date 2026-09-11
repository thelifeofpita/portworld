import type { MasonryRect } from './fitMasonry'
import { adaptiveCollection } from './adaptiveCollection'

// Detail views have no navigation island to reserve. Pack the actual native
// rectangles into free space, maximizing one shared area for all the artwork.
export function fitCollection(ratios:number[],width:number,height:number):MasonryRect[] {
  if(!ratios.length || width<=0 || height<=0) return []
  const gap=Math.max(10,Math.min(22,width*.012))
  const intersect=(a:MasonryRect,b:MasonryRect)=>a.left<b.left+b.width-.01 && a.left+a.width>b.left+.01 && a.top<b.top+b.height-.01 && a.top+a.height>b.top+.01
  const pack=(unit:number,order:number[],mode:number)=>{
    let free:MasonryRect[]=[{left:0,top:0,width:width+gap,height:height+gap}]
    const placed:MasonryRect[]=[]
    for(const i of order){
      const w=unit*Math.sqrt(ratios[i])+gap,h=unit/Math.sqrt(ratios[i])+gap
      let chosen:MasonryRect|undefined,score=Infinity
      for(const r of free){
        if(w>r.width+.001 || h>r.height+.001) continue
        const dx=r.width-w,dy=r.height-h
        const value=mode===0?Math.min(dx,dy)*10000+Math.max(dx,dy):mode===1?r.width*r.height-w*h:(r.top+h)*10000+r.left
        if(value<score){score=value;chosen={left:r.left,top:r.top,width:w,height:h}}
      }
      if(!chosen) return null
      const p=chosen
      placed[i]={...p,width:w-gap,height:h-gap}
      const next:MasonryRect[]=[]
      for(const r of free){
        if(!intersect(r,p)){next.push(r);continue}
        if(p.left>r.left) next.push({...r,width:p.left-r.left})
        if(p.left+p.width<r.left+r.width) next.push({...r,left:p.left+p.width,width:r.left+r.width-p.left-p.width})
        if(p.top>r.top) next.push({...r,height:p.top-r.top})
        if(p.top+p.height<r.top+r.height) next.push({...r,top:p.top+p.height,height:r.top+r.height-p.top-p.height})
      }
      free=next.filter((r,i)=>!next.some((q,j)=>i!==j && q.left<=r.left && q.top<=r.top && q.left+q.width>=r.left+r.width && q.top+q.height>=r.top+r.height && (j<i || q.width*q.height>r.width*r.height)))
    }
    return placed
  }
  const indices=ratios.map((_,i)=>i)
  const orders=[indices,indices.toReversed(),indices.toSorted((a,b)=>ratios[a]-ratios[b]),indices.toSorted((a,b)=>ratios[b]-ratios[a])]
  // Small collections deserve an exhaustive shape-order search. A greedy
  // square-first pass can strand half a row beside the taller posters.
  if(indices.length<=6){
    const visit=(prefix:number[],remaining:number[])=>{
      if(!remaining.length){orders.push(prefix);return}
      const shapes=new Set<string>()
      remaining.forEach(i=>{
        const shape=ratios[i].toFixed(2)
        if(shapes.has(shape)) return
        shapes.add(shape);visit([...prefix,i],remaining.filter(j=>j!==i))
      })
    }
    visit([],indices)
  }
  let best:MasonryRect[]=[],size=0
  for(const order of orders) for(let mode=0;mode<3;mode++){
    let low=0,high=Math.sqrt(width*height/ratios.length)
    for(let step=0;step<22;step++){
      const mid=(low+high)/2,result=pack(mid,order,mode)
      if(result){low=mid;if(mid>size){size=mid;best=result}}else high=mid
    }
  }
  // Center the whole composition; stagger only into real spare space. Native
  // proportions, common area, and minimum gutters remain hard constraints.
  const usedW=Math.max(...best.map(r=>r.left+r.width)),usedH=Math.max(...best.map(r=>r.top+r.height))
  best=best.map(r=>({...r,left:r.left+(width-usedW)/2,top:r.top+(height-usedH)/2}))
  best.forEach((r,i)=>{
    const move=Math.min(24,Math.min(width,height)*.035)*[.4,-.7,1,-.3][i%4]
    for(const vertical of [true,false]){
      const candidate={...r,left:r.left+(vertical?0:move),top:r.top+(vertical?move:0)}
      if(candidate.left<0 || candidate.top<0 || candidate.left+r.width>width || candidate.top+r.height>height) continue
      const padded={...candidate,left:candidate.left-gap/2,top:candidate.top-gap/2,width:r.width+gap,height:r.height+gap}
      if(best.some((q,j)=>j!==i && intersect(padded,{left:q.left-gap/2,top:q.top-gap/2,width:q.width+gap,height:q.height+gap}))) continue
      best[i]=candidate;break
    }
  })
  // Balance the mass of the artwork, rather than leaving all unused space in
  // one bottom corner of a tightly packed composition.
  const balance=(rects:MasonryRect[])=>{
    const cx=rects.reduce((s,r)=>s+r.left+r.width/2,0)/rects.length
    const cy=rects.reduce((s,r)=>s+r.top+r.height/2,0)/rects.length
    return ((cx-width/2)/width)**2+((cy-height/2)/height)**2
  }
  // Keep neighboring pieces connected: balancing the centroid alone pulled
  // posters away from the rest of Cooler Venus and opened a large interior gap.
  const compactness=(rects:MasonryRect[])=>{
    const right=Math.max(...rects.map(r=>r.left+r.width)),left=Math.min(...rects.map(r=>r.left))
    const bottom=Math.max(...rects.map(r=>r.top+r.height)),top=Math.min(...rects.map(r=>r.top))
    return (right-left)*(bottom-top)/(width*height)
  }
  let score=compactness(best)
  for(let pass=0;pass<30;pass++) for(let i=0;i<best.length;i++){
    const r=best[i],step=16*Math.pow(.94,pass)
    for(let direction=0;direction<8;direction++){
      const a=direction*Math.PI/4,q={...r,left:r.left+Math.cos(a)*step,top:r.top+Math.sin(a)*step}
      if(q.left<0 || q.top<0 || q.left+q.width>width || q.top+q.height>height) continue
      const padded={...q,left:q.left-gap/2,top:q.top-gap/2,width:q.width+gap,height:q.height+gap}
      if(best.some((other,j)=>j!==i&&intersect(padded,{left:other.left-gap/2,top:other.top-gap/2,width:other.width+gap,height:other.height+gap}))) continue
      const trial=best.slice();trial[i]=q
      const next=compactness(trial)
      if(next<score){best[i]=q;score=next}
    }
  }
  if(ratios.length>2){
    const adaptive=adaptiveCollection(ratios,width,height,gap)
    const area=(rects:MasonryRect[])=>rects.reduce((sum,r)=>sum+r.width*r.height,0)
    // Only relax equal sizing when the gain is material, not for tiny gaps.
    if(area(adaptive)>area(best)*1.08) return adaptive
  }
  return best
}
