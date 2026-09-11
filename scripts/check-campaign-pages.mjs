import { chromium, webkit } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const engine = process.env.TEST_ENGINE || 'chromium'
const base = process.env.TEST_BASE_URL || 'http://localhost:3001'
const output = `/tmp/campaign-check-${engine}`
await mkdir(output,{recursive:true})
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit' ? {headless:true} : {channel:'chrome',headless:true})
const results = []
try {
  const selectedWidths=process.argv.find(a=>a.startsWith('--widths='))?.split('=')[1].split(',').map(Number)
  for (const [width,height] of (process.env.TEST_PHONE_ONLY ? [[390,844],[430,932]] : [[1440,900],[1920,1080],[390,844],[430,932]]).filter(([w])=>!selectedWidths || selectedWidths.includes(w))) {
    const page = await browser.newPage({viewport:{width,height}, reducedMotion: width === 430 ? 'reduce' : 'no-preference'})
    const errors = []
    page.on('pageerror',e=>errors.push(e.stack || e.message))
    await page.goto(base+'/?materialAudit=1',{waitUntil:'domcontentloaded'})
    await page.getByRole('status',{name:'Loading'}).waitFor({state:'hidden',timeout:90000})
    await page.getByText('Projects',{exact:true}).dispatchEvent('click')
    await page.waitForTimeout(2500)
    await page.screenshot({path:`${output}/${width}-overview.png`})
    if(width<700) await page.getByAltText('Duolingo: Your Coolest Lesson Yet.',{exact:true}).click()
    else {
      const slot=page.locator('[class*="bigProjectModelSlot"]').nth(1)
      for(const offset of [0,-20,20]) {
        const b=await slot.boundingBox()
        await page.mouse.move(b.x+b.width/2+offset,b.y+b.height/2)
        await page.waitForTimeout(600)
        await page.mouse.click(b.x+b.width/2+offset,b.y+b.height/2)
        await page.waitForTimeout(800)
        if(await page.locator('[data-campaign=duolingo]').count()) break
      }
    }
    const campaigns = [
      ['duolingo','Your Coolest Lesson Yet.','bWRIjCEHXJk',6,'rgb(88, 204, 2)'],
      ['verified','Verified.','HwCWeJ_ZcvQ',6,'rgb(227, 6, 19)'],
      ['hatTwix','Hat Twix.','VykD83mmSTo',8,'rgb(244, 193, 69)'],
    ]
    for (const [id,title,film,count,color] of campaigns) {
      const heading=page.getByRole('heading',{level:1,name:title,exact:true})
      await heading.waitFor({timeout:30000})
      await heading.scrollIntoViewIfNeeded()
      await page.waitForTimeout(800)
      const panel=page.locator(`[data-campaign="${id}"]`)
      assert.equal(await panel.evaluate(el=>getComputedStyle(el).backgroundColor),color)
      assert.equal(await panel.locator('iframe').count(),1)
      assert((await panel.locator('iframe').getAttribute('src')).includes(film))
      assert.equal(await panel.getByRole('navigation').count(),2)
      assert.equal(await panel.locator('h2').count(),0,'No extra section headings')
      assert.equal(await panel.locator('p').count(),1,'Only the introductory subtitle remains')
      const nav=panel.getByRole('navigation',{name:'Project navigation'}).first()
      assert(await nav.locator('button').evaluateAll(bs=>bs.every(b=>getComputedStyle(b).padding==='0px')),'Navigation matches reference button spacing')
      const alignment=await nav.evaluate(el=>{const r=el.getBoundingClientRect();return [...el.querySelectorAll('button')].map(b=>{const q=b.getBoundingClientRect();return {centerX:q.x+q.width/2-(r.x+r.width/2),centerY:q.y+q.height/2-(r.y+r.height/2)}})})
      assert(alignment.every(b=>Math.abs(b.centerY)<1) && Math.abs(alignment[1].centerX)<1,'Navigation buttons align with a centered close')
      const innerWidth=await panel.locator('header').evaluate(el=>el.getBoundingClientRect().width)
      await page.screenshot({path:`${output}/${width}-${id}-top.png`})
      if(id==='hatTwix' && width>=700) {
        assert.equal(await panel.evaluate(el=>getComputedStyle(el.closest('[role=dialog]')).backgroundColor),color,'Outer panel and page must share the gold background')
      }
      if(id==='duolingo') {
        const videos=panel.locator('video')
        assert.equal(await videos.count(),2)
        const row=videos.first().locator('xpath=../..')
        await row.scrollIntoViewIfNeeded()
        await page.waitForTimeout(500)
        assert.equal(await row.locator('button').count(),0,'Loops have no playback controls')
        assert(await videos.evaluateAll(vs=>vs.every(v=>!v.controls)),'Native controls are disabled')
        await page.waitForFunction(()=>[...document.querySelectorAll('[data-campaign=duolingo] video')].every(v=>v.readyState>=2 && !v.paused),{},{timeout:15000})
        const before=await videos.evaluateAll(vs=>vs.map(v=>v.currentTime))
        await page.waitForTimeout(650)
        const after=await videos.evaluateAll(vs=>vs.map(v=>v.currentTime))
        assert(after.every((t,i)=>Math.abs(t-before[i])>0.15),'Both visible loops advance')
        assert(await videos.evaluateAll(vs=>vs.every(v=>v.muted && v.loop && v.playsInline)))
        await page.screenshot({path:`${output}/${width}-duolingo-loops.png`})
        await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))})
        assert(await videos.evaluateAll(vs=>vs.every(v=>v.paused)),'Hidden tab suspends both decoders')
        await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))})
        if(width<700) await page.evaluate(()=>window.scrollTo(0,0))
        else await heading.scrollIntoViewIfNeeded()
        await page.waitForTimeout(500)
        assert(await videos.evaluateAll(vs=>vs.every(v=>v.paused)),'Offscreen loops pause')
      }
      const images=panel.locator('img')
      assert.equal(await images.count(),count)
      for(let i=0;i<count;i++) {
        const img=images.nth(i)
        await (id==='duolingo' ? img.locator('..') : img).scrollIntoViewIfNeeded()
        await img.evaluate(el=>el.decode())
        const data=await img.evaluate(el=>{
          const b=(el.closest("[data-duo-crop]") || el).getBoundingClientRect()
          return {x:b.x,right:b.right,width:b.width,height:b.height,w:Number(el.getAttribute("width")),h:Number(el.getAttribute("height")),alt:el.alt,loading:el.loading,nw:el.naturalWidth,nh:el.naturalHeight,fit:getComputedStyle(el).objectFit}
        })
        assert(data.x>=-1 && data.right<=width+1,`${id} image ${i} overflows at ${width}`)
        assert(data.alt && data.loading==='lazy' && data.nw>0)
        if(width>=1100 && !(id==='verified' && i===3)) assert(data.width<innerWidth*0.65,`${id}: supporting mockup should not fill the page`)
        if(id==='hatTwix' && i===4) {
          const yellow=await img.evaluate(el=>{const c=document.createElement('canvas');c.width=el.naturalWidth;c.height=el.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(el,0,0);const a=ctx.getImageData(c.width/2,0,Math.floor(c.width/2),c.height).data;let n=0;for(let j=0;j<a.length;j+=4)if(a[j]>225 && a[j+1]>200 && a[j+2]<120)n++;return n});
          assert(yellow>30,'Hat Twix mentions need visible yellow highlights');
        }
        assert(id==='duolingo' || data.fit==='cover' || Math.abs((data.width/data.height)/(data.w/data.h)-1)<0.01,`${id} image ${i} is distorted: ${JSON.stringify(data)}`)
        if(i===0 || i===count-1){await page.waitForTimeout(700);await page.screenshot({path:`${output}/${width}-${id}-media-${i}.png`})}
      }
      const boxes=await images.evaluateAll(els=>els.map(el=>{const r=(el.closest("[data-duo-crop]") || el).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}))
      const equalHeight=bs=>Math.max(...bs.map(b=>b.h))-Math.min(...bs.map(b=>b.h))<1
      if(id==='verified') {
        assert.equal(await panel.locator('[aria-label*="Close-up"]').count(),0)
        assert(equalHeight(boxes.slice(0,3)) && equalHeight(boxes.slice(4,6)),'Portraits and lower pair have equal heights')
        assert(boxes.slice(0,3).every(b=>Math.abs(b.w/b.h-0.8)<0.01),'Portrait crops focus on the jackets')
        if(width>=700) assert(boxes[3].w>innerWidth*0.98 && boxes[4].y===boxes[5].y,'Big billboard above one aligned pair')
      }
      if(id==='hatTwix') {
        assert.equal(await panel.locator('img[src*="twixPub"]').count(),0)
        assert(equalHeight(boxes.slice(1,4)),'Three print artworks align in height')
        if(width>=700) assert(boxes[4].x<boxes[5].x && boxes[5].x<boxes[7].x,'Instagram, tweets and TikTok share one row')
      }
      if(id==='duolingo') {
        assert.equal(await panel.locator('img[src*="duoLessons"]').count(),0,'No baked triptych')
        assert(boxes.every(b=>Math.abs(b.w/b.h-8/9)<0.01),'All stills use taller crops')
        if(width>=700) assert(Math.max(...boxes.map(b=>b.y))-Math.min(...boxes.map(b=>b.y))<1,'Individual stills share one row')
      }
      const next=panel.getByRole('button',{name:'Next project',exact:true}).last()
      await next.scrollIntoViewIfNeeded()
      await next.focus()
      await page.keyboard.press('Enter')
      await panel.waitFor({state:'detached',timeout:20000})
      assert.equal(await page.locator(`iframe[src*="${film}"]`).count(),0,'Closed film remains mounted')
      results.push({engine,width,campaign:id,images:count,status:'pass'})
    }
    // Traverse the approved reference layouts and return to the new pages.
    for(const title of ['Pick a side.','Back in smoothly.','Surf the spike.']) {
      const referenceHeading=page.getByRole('heading',{level:1,name:title,exact:true})
      await referenceHeading.waitFor({timeout:20000})
      await page.waitForTimeout(500)
      await page.screenshot({path:`${output}/${width}-reference-${title.replaceAll(' ','-')}.png`})
      await referenceHeading.locator('xpath=../..').getByRole('button',{name:'Next project',exact:true}).first().click()
      await referenceHeading.waitFor({state:'detached'})
    }
    await page.getByRole('heading',{level:1,name:'Your Coolest Lesson Yet.',exact:true}).waitFor({timeout:20000})
    await page.locator('[data-campaign=duolingo]').getByRole('button',{name:'Previous project',exact:true}).first().click()
    await page.locator('[data-campaign=duolingo]').waitFor({state:'detached'})
    await page.getByRole('heading',{level:1,name:'Surf the spike.',exact:true}).waitFor({timeout:20000})
    await page.getByRole('heading',{level:1,name:'Surf the spike.',exact:true}).locator('xpath=../..').getByRole('button',{name:'Next project',exact:true}).first().click()
    await page.getByRole('heading',{level:1,name:'Surf the spike.',exact:true}).waitFor({state:'detached'})
    await page.getByRole('heading',{level:1,name:'Your Coolest Lesson Yet.',exact:true}).waitFor({timeout:20000})
    await page.locator('[data-campaign=duolingo]').getByRole('button',{name:'Close',exact:true}).first().click()
    await page.locator('[data-campaign]').waitFor({state:'detached'})
    assert.equal(await page.locator('iframe[src*="youtube.com/embed"]').count(),0)
    assert.deepEqual(errors,[])
    await page.close()
    console.log('PASS',engine,width,'three campaign layouts, media, six-project navigation, keyboard, iframe cleanup')
  }
  await writeFile(`${output}/results.json`,JSON.stringify(results,null,2))
} finally { await browser.close() }
