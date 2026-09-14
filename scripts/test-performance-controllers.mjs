import assert from 'node:assert/strict'
import { RenderQuality } from '../lib/renderQuality.ts'
import { registerMedia } from '../lib/mediaPlayback.ts'
const desktop=new RenderQuality(false)
assert.equal(desktop.tier,1,'Desktop starts at 1.5x supersampling')
for(let i=0;i<3000;i++)desktop.sample(1/120)
assert.equal(desktop.tier,2,'Sustained headroom earns 2x')
for(let i=0;i<100;i++)desktop.sample(.033)
assert.equal(desktop.tier,1)
for(let i=0;i<100;i++)desktop.sample(.033)
assert.equal(desktop.tier,1,'Cooldown prevents repeated downgrades')
for(let i=0;i<300;i++)desktop.sample(.033)
assert.equal(desktop.tier,0)
for(let i=0;i<7400;i++)desktop.sample(1/120)
assert.equal(desktop.tier,1,'A failed tier is retried only after its lockout')
for(let i=0;i<2000;i++)desktop.sample(1/120)
assert.equal(desktop.tier,2,'Sustained headroom restores full quality')
const sixty=new RenderQuality(false)
for(let i=0;i<3000;i++)sixty.sample(1/60)
assert.equal(sixty.tier,1,'A 60Hz display cannot show headroom for 2x, so it keeps 1.5x')
const recover=new RenderQuality(false)
for(let i=0;i<100;i++)recover.sample(.033)
for(let i=0;i<5400;i++)recover.sample(1/60)
assert.equal(recover.tier,1,'Recovering from 1x to the 1.5x default works at 60Hz')
const jitter=new RenderQuality(false)
for(let i=0;i<150;i++)jitter.sample(i%5===0?.02:1/60)
assert.equal(jitter.tier,0,'Frequent small misses (a steady 50-58fps) also step quality down')
assert.deepEqual(new RenderQuality(true).scales,[.75,1,1.5])
let time=0
Object.defineProperty(globalThis,'performance',{value:{now:()=>time*1000},configurable:true})
const document=new EventTarget();document.hidden=false;globalThis.document=document
class Video extends EventTarget {
 currentTime=0;duration=10;readyState=4;paused=true;muted=true;seeks=0
 get seekable(){const video=this;return video.unseekable?{length:0}:{length:1,start:()=>0,end:()=>video.duration}}
 play(){this.paused=false;return Promise.resolve()}
 pause(){this.paused=true}
}
const preview=new Video(),detail=new Video(),second=new Video()
const a=registerMedia(preview,'piece',true,10)
time=3;a.setActive(false);assert(preview.paused)
time=7;const b=registerMedia(detail,'piece',true,10);assert.equal(detail.currentTime,7)
const c=registerMedia(second,'second',true,10);assert(!detail.paused&&!second.paused)
time=12;b.dispose();a.setActive(true);assert.equal(preview.currentTime,2,'Preview resumes elapsed time modulo duration')
document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert(preview.paused&&second.paused)
time=25;document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(preview.currentTime,5)
a.dispose();c.dispose();assert(preview.paused&&second.paused)
{
  // A seek re-fires canplay; a clip that cannot land where it was sent must not re-seek in a loop.
  const stuck=new Video();stuck.unseekable=true
  const d=registerMedia(stuck,'stuck',true,10)
  time=40;stuck.dispatchEvent(new Event('canplay'));stuck.dispatchEvent(new Event('canplay'))
  assert.equal(stuck.currentTime,0,'An unseekable clip is never seeked')
  d.dispose()
  const looping=new Video()
  let sets=0
  Object.defineProperty(looping,'currentTime',{get:()=>0,set:()=>{sets++}})
  const e=registerMedia(looping,'looping',true,10)
  for(let i=0;i<20;i++){time+=.01;looping.dispatchEvent(new Event('canplay'))}
  assert(sets<=1,'A seek that does not land is not re-issued on every canplay')
  time+=1;looping.dispatchEvent(new Event('canplay'))
  assert.equal(sets,2,'It retries after the backoff')
  e.dispose()
}
console.log('PASS: adaptive hysteresis, cooldown, logical clocks, simultaneous detail playback, background resume, cleanup')
