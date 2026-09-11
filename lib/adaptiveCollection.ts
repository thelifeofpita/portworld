import type { MasonryRect } from './fitMasonry'

type Layout={aspect:number; boxes:(MasonryRect & {index:number})[]; variance:number}

// Explore mixed horizontal/vertical groups. Unlike a rigid equal-area bin,
// these can give one group more room when that fills an otherwise empty region.
export function adaptiveCollection(ratios:number[],width:number,height:number,gap:number):MasonryRect[] {
  const orders=Array.from({length:8},(_,seed)=>ratios.map((_,i)=>i).sort((a,b)=>seed===0?a-b:seed===1?ratios[a]-ratios[b]:Math.sin((a+1)*(seed+3)*12.9898)-Math.sin((b+1)*(seed+3)*12.9898)))
  let best:MasonryRect[]=[],bestScore=-Infinity
  for(const order of orders){
    const memo=new Map<string,Layout[]>()
    const build=(start:number,end:number):Layout[]=>{
      const key=`${start}:${end}`,cached=memo.get(key)
      if(cached) return cached
      if(end-start===1){const i=order[start];return [{aspect:ratios[i],boxes:[{index:i,left:0,top:0,width:ratios[i],height:1}],variance:0}]}
      const bins=new Map<number,Layout>()
      for(let cut=start+1;cut<end;cut++) for(const a of build(start,cut)) for(const b of build(cut,end)) for(const horizontal of [true,false]){
        const aspect=horizontal?a.aspect+b.aspect:1/(1/a.aspect+1/b.aspect)
        const boxes=horizontal?[...a.boxes,...b.boxes.map(r=>({...r,left:r.left+a.aspect}))]:[
          ...a.boxes.map(r=>({...r,left:r.left*aspect/a.aspect,top:r.top*aspect/a.aspect,width:r.width*aspect/a.aspect,height:r.height*aspect/a.aspect})),
          ...b.boxes.map(r=>({...r,left:r.left*aspect/b.aspect,top:aspect/a.aspect+r.top*aspect/b.aspect,width:r.width*aspect/b.aspect,height:r.height*aspect/b.aspect})),
        ]
        const logs=boxes.map(r=>Math.log(r.width*r.height)),mean=logs.reduce((s,x)=>s+x,0)/logs.length
        const variance=logs.reduce((s,x)=>s+(x-mean)**2,0)/logs.length
        const bin=Math.round(Math.log(aspect)*24),previous=bins.get(bin)
        if(!previous || variance<previous.variance) bins.set(bin,{aspect,boxes,variance})
      }
      const result=[...bins.values()].sort((a,b)=>a.variance-b.variance).slice(0,64)
      memo.set(key,result);return result
    }
    for(const layout of build(0,ratios.length)){
      const h=Math.min(height,width/layout.aspect),w=h*layout.aspect
      const rects:MasonryRect[]=[]
      for(const box of layout.boxes){
        const slotW=Math.max(1,box.width*h-gap),slotH=Math.max(1,box.height*h-gap)
        const rw=Math.min(slotW,slotH*ratios[box.index]),rh=rw/ratios[box.index]
        rects[box.index]={left:(width-w)/2+box.left*h+(box.width*h-rw)/2,top:(height-h)/2+box.top*h+(box.height*h-rh)/2,width:rw,height:rh}
      }
      const coverage=rects.reduce((s,r)=>s+r.width*r.height,0)/(width*height)
      const areas=rects.map(r=>r.width*r.height)
      // Fill gaps without turning one image into a hero and the rest into
      // thumbnails. Every piece must keep comparable visual weight.
      if(Math.max(...areas)/Math.min(...areas)>6) continue
      // Equal areas remain a preference, but no longer create a giant void.
      const score=coverage-.04*layout.variance
      if(score>bestScore){bestScore=score;best=rects}
    }
  }
  return best
}
