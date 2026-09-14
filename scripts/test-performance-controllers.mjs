import assert from 'node:assert/strict'
import { RenderQuality } from '../lib/renderQuality.ts'
import { registerMedia } from '../lib/mediaPlayback.ts'
const desktop=new RenderQuality(false)
assert.equal(desktop.tier,1,'Desktop starts at 1.5x supersampling')
for(let i=0;i<1500;i++)desktop.sample(1/60)
assert.equal(desktop.tier,2,'Sustained headroom earns 2x')
for(let i=0;i<100;i++)desktop.sample(.033)
assert.equal(desktop.tier,1)
for(let i=0;i<100;i++)desktop.sample(.033)
assert.equal(desktop.tier,1,'Cooldown prevents repeated downgrades')
for(let i=0;i<300;i++)desktop.sample(.033)
assert.equal(desktop.tier,0)
for(let i=0;i<3700;i++)desktop.sample(1/60)
assert.equal(desktop.tier,1,'A failed tier is retried only after its lockout')
for(let i=0;i<1000;i++)desktop.sample(1/60)
assert.equal(desktop.tier,2,'Sustained headroom restores full quality')
const jitter=new RenderQuality(false)
for(let i=0;i<150;i++)jitter.sample(i%5===0?.02:1/60)
assert.equal(jitter.tier,0,'Frequent small misses (a steady 50-58fps) also step quality down')
assert.deepEqual(new RenderQuality(true).scales,[.75,1,1.5])
let time=0
Object.defineProperty(globalThis,'performance',{value:{now:()=>time*1000},configurable:true})
const document=new EventTarget();document.hidden=false;globalThis.document=document
class Video extends EventTarget {
 currentTime=0;duration=10;readyState=4;paused=true;muted=true
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
console.log('PASS: adaptive hysteresis, cooldown, logical clocks, simultaneous detail playback, background resume, cleanup')
