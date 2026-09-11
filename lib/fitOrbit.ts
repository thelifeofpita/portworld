import type { MasonryRect } from './fitMasonry'
import { fitCollection } from './fitCollection'

// Small deterministic PRNG (mulberry32). seed 0 disables all randomness so the
// layout stays fixed — the test harness relies on that; the app passes a fresh
// non-zero seed per mount for a different arrangement every visit.
function rng(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const shuffle = <T,>(arr: T[], rand: () => number) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Symmetric starting positions with enough distinct homes for every card.
// Reusing the old 15 anchors for 17 cards could leave one side crowded.
function orbitAnchors(count: number): number[][] {
  const left = [[.08,.15],[.25,.13],[.42,.15],[.08,.43],[.29,.40],[.08,.73],[.27,.67],[.25,.87],[.43,.85]]
  const anchors = left.flatMap(([x,y]) => [[x,y],[1-x,y]])
  while (anchors.length < count) {
    let next = [.1,.1], distance = -1
    for (let y=.1;y<.95;y+=.08) for (let x=.07;x<.95;x+=.08) {
      if (x>.35 && x<.65 && y>.3 && y<.7) continue
      const near = Math.min(...anchors.map(([ax,ay]) => (x-ax)**2+(y-ay)**2))
      if (near>distance) { distance=near; next=[x,y] }
    }
    anchors.push(next)
  }
  return anchors
}

// Give each card a home anchor so that (a) the order cards claim space is
// shape-alternating — portrait, square, landscape, portrait… — and (b) each
// successive card is sent to whichever remaining anchor sits farthest from the
// ones already handed out. Same-shape cards therefore land far apart and their
// differing footprints interlock instead of stacking into one tall column.
function anchorAssignment(ratios: number[], anchors: number[][], rand: () => number): number[] {
  const cls = (r: number) => (r < 0.85 ? 0 : r > 1.2 ? 2 : 1)
  const buckets: number[][] = [[], [], []]
  ratios.forEach((r, i) => buckets[cls(r)].push(i))
  buckets.forEach(b => shuffle(b, rand))
  const cardOrder: number[] = []
  for (let round = 0; cardOrder.length < ratios.length; round++)
    for (const b of buckets) if (b[round] !== undefined) cardOrder.push(b[round])

  const remaining = anchors.map((_, i) => i)
  const spread = [remaining.splice(Math.floor(rand() * remaining.length), 1)[0]]
  while (remaining.length) {
    let bestAt = 0, bestScore = -1
    remaining.forEach((ai, at) => {
      const near = Math.min(...spread.map(s => (anchors[s][0] - anchors[ai][0]) ** 2 + (anchors[s][1] - anchors[ai][1]) ** 2))
      const score = near * (0.75 + rand() * 0.5)
      if (score > bestScore) { bestScore = score; bestAt = at }
    })
    spread.push(remaining.splice(bestAt, 1)[0])
  }

  const assigned = new Array<number>(ratios.length)
  cardOrder.forEach((card, k) => { assigned[card] = spread[k % spread.length] })
  return assigned
}

// Art-directed islands, not rows or columns. The center stays available for
// navigation; each item's dimensions are fixed by its cover's native average.
function fixedOrbit(ratios: number[], width: number, height: number, seed = 0): MasonryRect[] {
  if (width <= 0 || height <= 0) return []
  const anchors = orbitAnchors(ratios.length)
  if (seed) shuffle(anchors, rng(seed ^ 0x5f356495))
  const gap = 18, label = 25
  const make = (unit: number) => ratios.map((ratio, i) => {
    const [x,y] = anchors[i % anchors.length]
    const area = unit * unit * [1, .9, 1.1, .95, 1.06][i % 5]
    const w = Math.sqrt(area * ratio), h = w / ratio
    return { left: x * width - w / 2, top: y * height - h / 2, width: w, height: h }
  })
  const fits = (rects: MasonryRect[]) => rects.every((r,i) => {
    if (r.left < gap || r.top < gap || r.left+r.width > width-gap || r.top+r.height+label > height-gap) return false
    const clearW = Math.min(270,width*.23), clearH = Math.min(240,height*.32)
    if (r.left < (width+clearW)/2 && r.left+r.width > (width-clearW)/2 && r.top < (height+clearH)/2 && r.top+r.height+label > (height-clearH)/2) return false
    return rects.slice(0,i).every(q => r.left >= q.left+q.width+gap || q.left >= r.left+r.width+gap || r.top >= q.top+q.height+label+gap || q.top >= r.top+r.height+label+gap)
  })
  let low = 0, high = Math.min(width,height)
  for (let i=0;i<28;i++) { const mid=(low+high)/2; if(fits(make(mid))) low=mid; else high=mid }
  const rects = make(low)
  // Grow each island into its own available space, so one tight pair cannot
  // make every other card unnecessarily small. Centers and ratios stay fixed.
  for (let pass=0;pass<100;pass++) {
    rects.forEach((r,i) => {
      const w=r.width*1.012, h=r.height*1.012
      const grown={ left:r.left-(w-r.width)/2, top:r.top-(h-r.height)/2, width:w,height:h }
      const candidate=rects.slice(); candidate[i]=grown
      if(fits(candidate)) rects[i]=grown
    })
  }
  return rects
}

// Anchors are preferences, not fixed slots. Find the largest free-position
// packing around the navigation for this viewport; never align to columns.
export function fitOrbit(ratios:number[],width:number,height:number,collection=false,seed=0):MasonryRect[] {
  if(!ratios.length || width<=0 || height<=0) return []
  if(collection) return fitCollection(ratios,width,height)
  if(collection && ratios.length===1){
    const w=Math.min(width,height*ratios[0]),h=w/ratios[0]
    return [{left:(width-w)/2,top:(height-h)/2,width:w,height:h}]
  }
  const anchors=collection ? ratios.map((_,i)=>[.15+((i*.61803398875+.2)%1)*.7,.15+((i*.381966+.1)%1)*.7]) : orbitAnchors(ratios.length)
  // Per-card home anchor. Seed 0 keeps the historical index→anchor mapping; a
  // real seed shuffles it shape-aware (see anchorAssignment) and jitters each
  // point, so vertical pieces no longer all land on the left and the two deep
  // art-direction collections no longer come out side by side every load.
  const rand=rng(seed||1)
  const assign=seed?anchorAssignment(ratios,anchors,rand):ratios.map((_,i)=>i%anchors.length)
  const anchorPos=ratios.map((_,i)=>{
    const [ax,ay]=anchors[assign[i]%anchors.length]
    return seed
      ? [Math.min(.93,Math.max(.07,ax+(rand()-.5)*.09)),Math.min(.9,Math.max(.09,ay+(rand()-.5)*.09))]
      : [ax,ay]
  })
  const gap=Math.max(12,Math.min(22,width*.012)),label=collection?0:25,edge=12
  const clearW=Math.min(270,width*.23),clearH=Math.min(240,height*.32)
  const center={left:collection?-10000:(width-clearW)/2,top:(height-clearH)/2,width:clearW,height:clearH-label}
  const overlaps=(a:MasonryRect,b:MasonryRect)=>a.left<b.left+b.width+gap && a.left+a.width+gap>b.left && a.top<b.top+b.height+label+gap && a.top+a.height+label+gap>b.top
  const pack=(unit:number,reverse:boolean)=>{
    const result:MasonryRect[]=[],occupied=[center]
    const order=ratios.map((_,i)=>i).sort((a,b)=>(reverse?-1:1)*(ratios[a]-ratios[b]))
    for(const i of order){
      const area=unit*unit
      const w=Math.sqrt(area*ratios[i]),h=w/ratios[i],maxX=width-w-edge,maxY=height-h-label-edge
      if(maxX<edge || maxY<edge) return null
      const [ax,ay]=anchorPos[i]
      let best:MasonryRect|undefined,score=Infinity
      for(let sample=0;sample<1600;sample++){
        const left=sample===0?Math.max(edge,Math.min(maxX,ax*width-w/2)):edge+((sample*.61803398875)%1)*(maxX-edge)
        const top=sample===0?Math.max(edge,Math.min(maxY,ay*height-h/2)):edge+((sample*.75487766625)%1)*(maxY-edge)
        const distance=((left+w/2)/width-ax)**2+((top+h/2)/height-ay)**2
        if(distance>=score) continue
        const r={left,top,width:w,height:h}
        if(occupied.some(q=>overlaps(r,q))) continue
        best=r;score=distance
      }
      if(!best) return null
      result[i]=best;occupied.push(best)
    }
    return result
  }
  let best=fixedOrbit(ratios,width,height,seed)
  // Even the emergency fallback must obey the same area budget.
  const fallbackArea=Math.min(...best.map(r=>r.width*r.height))
  best=best.map((r,i)=>{
    const w=Math.sqrt(fallbackArea*ratios[i]),h=w/ratios[i]
    return {left:r.left+(r.width-w)/2,top:r.top+(r.height-h)/2,width:w,height:h}
  })
  let bestArea=best.reduce((s,r)=>s+r.width*r.height,0)
  for(const reverse of [false,true]){
    let low=0,high=Math.sqrt(width*height/ratios.length)
    for(let iteration=0;iteration<13;iteration++){
      const mid=(low+high)/2,rects=pack(mid,reverse)
      if(rects){low=mid;const area=rects.reduce((s,r)=>s+r.width*r.height,0);if(area>bestArea){best=rects;bestArea=area}}
      else high=mid
    }
  }
  // Do not grow individual cards into spare pockets: that breaks equal visual
  // weight. Only a larger complete packing may increase the shared area.
  // Equalize actual edge-to-edge gaps, including captions, not center spacing:
  // a landscape card and a portrait card need different center distances.
  const targetGap=Math.max(gap*1.5,Math.sqrt(width*height/ratios.length)*.19)
  const separation=(a:MasonryRect,b:MasonryRect)=>Math.hypot(
    Math.max(0,a.left-b.left-b.width,b.left-a.left-a.width),
    Math.max(0,a.top-b.top-b.height-label,b.top-a.top-a.height-label),
  )
  const samples=Array.from({length:15*9},(_,i)=>({x:(i%15+.5)*width/15,y:(Math.floor(i/15)+.5)*height/9}))
    .filter(p=>p.x<center.left-gap || p.x>center.left+center.width+gap || p.y<center.top-gap || p.y>center.top+center.height+gap)
  const holeCost=(rects:MasonryRect[])=>samples.reduce((sum,p)=>{
    const distance=Math.min(...rects.map(r=>Math.hypot(Math.max(0,r.left-p.x,p.x-r.left-r.width),Math.max(0,r.top-p.y,p.y-r.top-r.height-label))))
    return sum+Math.max(0,distance-targetGap*.7)**2
  },0)*ratios.length/samples.length*3
  const balanceCost=(rects:MasonryRect[])=>{
    const area=rects.reduce((sum,r)=>sum+r.width*r.height,0)
    if (!area) return 0
    const left=rects.reduce((sum,r)=>sum+Math.max(0,Math.min(r.width,width/2-r.left))*r.height,0)/area
    const top=rects.reduce((sum,r)=>sum+Math.max(0,Math.min(r.height,height/2-r.top))*r.width,0)/area
    const cx=rects.reduce((sum,r)=>sum+(r.left+r.width/2)*r.width*r.height,0)/area
    const cy=rects.reduce((sum,r)=>sum+(r.top+(r.height+label)/2)*r.width*r.height,0)/area
    // An odd number of equal-area cards naturally allows one extra on a side.
    const allowance=.5/rects.length
    return rects.length*(
      4*((cx-width/2)**2+(cy-height/2)**2)+
      .5*((width*Math.max(0,Math.abs(left-.5)-allowance))**2+
      (height*Math.max(0,Math.abs(top-.5)-allowance))**2)
    )
  }
  const spacingCost=(rects:MasonryRect[])=>balanceCost(rects)+holeCost(rects)+rects.reduce((sum,r,i)=>{
    const nearest=rects.filter((_,j)=>j!==i).map(q=>separation(r,q)).sort((a,b)=>a-b)
    // Hold the three closest neighbours near the same gap so a card is ringed
    // by even spacing instead of hugging one and stranding the rest; the pull
    // still eases with distance, just far less sharply than before.
    return sum+nearest.slice(0,3).reduce((cost,d,k)=>cost+(d-targetGap*[1,1.25,1.75][k])**2*[1,.46,.15][k],0)
  },0)
  let cost=spacingCost(best)
  for(let pass=0;pass<60;pass++){
    const step=16*Math.pow(.95,pass)+1
    for(let i=0;i<best.length;i++){
      const original=best[i]
      let selected=original
      // Local nudges cannot move a card across an occupied row. Occasionally
      // test whole-screen destinations too, so empty pockets can be filled.
      const destinations=pass===0 || pass===25 ? samples.filter((_,j)=>j%2===0) : []
      for(let direction=0;direction<8+destinations.length;direction++){
        const angle=direction*Math.PI/4
        const point=destinations[direction-8]
        const candidate={...original,left:point?point.x-original.width/2:original.left+Math.cos(angle)*step,top:point?point.y-original.height/2:original.top+Math.sin(angle)*step}
        if(candidate.left<edge || candidate.top<edge || candidate.left+candidate.width>width-edge || candidate.top+candidate.height+label>height-edge || overlaps(candidate,center)) continue
        if(best.some((r,j)=>j!==i && overlaps(candidate,r))) continue
        const trial=best.slice();trial[i]=candidate
        const next=spacingCost(trial)
        if(next<cost){cost=next;selected=candidate}
      }
      best[i]=selected
    }
  }
  // Final tighten: repeatedly pull the single most isolated card toward its
  // nearest neighbour and ease the single most crowded one away, closing the
  // spread of nearest-neighbour gaps without disturbing the already-even bulk.
  const nnOf=(i:number)=>Math.min(...best.map((q,j)=>j===i?Infinity:separation(best[i],q)))
  for(let k=0;k<26;k++){
    const gaps=best.map((_,i)=>nnOf(i))
    for(const [idx,dirSign] of [[gaps.indexOf(Math.max(...gaps)),-1],[gaps.indexOf(Math.min(...gaps)),1]] as [number,number][]){
      const r=best[idx]
      let nj=-1,nd=Infinity
      best.forEach((q,j)=>{if(j===idx)return;const d=separation(r,q);if(d<nd){nd=d;nj=j}})
      if(nj<0)continue
      const q=best[nj],dx=(r.left+r.width/2)-(q.left+q.width/2),dy=(r.top+r.height/2)-(q.top+q.height/2)
      const L=Math.hypot(dx,dy)||1
      const cand={...r,left:r.left+dx/L*dirSign*6,top:r.top+dy/L*dirSign*6}
      if(cand.left<edge || cand.top<edge || cand.left+cand.width>width-edge || cand.top+cand.height+label>height-edge || overlaps(cand,center)) continue
      if(best.some((x,j)=>j!==idx && overlaps(cand,x))) continue
      const trial=best.slice();trial[idx]=cand
      const next=spacingCost(trial)
      if(next<cost){best[idx]=cand;cost=next}
    }
  }
  return best
}
