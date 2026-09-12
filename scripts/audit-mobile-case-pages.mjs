// Opens all six case-study pages at 390x844 and reports mechanical layout
// faults, so these don't have to be caught by eye in a screenshot:
//
//   LETTERBOX  a contained image/video whose box is >6% taller than its own
//              aspect ratio needs. Usually means the width/height attributes
//              won as presentational hints because the CSS set only
//              `aspect-ratio: auto` and no `height: auto` — this found ~840px
//              of void per Surf the Spike photo and ~390px per Pick a Side
//              mockup.
//   HORIZ      media extending past the overlay's content box. Expect hits on
//              Duolingo: its .stillCrop children are deliberately over-wide
//              inside an `overflow: hidden` box.
//   TINY       anything rendering under 120px wide, i.e. too small to read.
//
// Needs a server on :3001 (`npx next start -p 3001` after a build).
// Run: node scripts/audit-mobile-case-pages.mjs

import { chromium } from 'playwright'
const SLOTS = [0,1,2,3,4,5]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => { const l = document.querySelector('[class*="loader"]'); return !l || getComputedStyle(l).opacity === '0' }, { timeout: 180000 }).catch(()=>{})
await page.evaluate(() => { const el = [...document.querySelectorAll('div')].find(e => e.children.length === 0 && e.textContent.trim() === 'Projects'); el?.click() })
await page.waitForTimeout(4000)

for (const i of SLOTS) {
  await page.evaluate(i => document.querySelector(`[data-project-index="${i}"] button`).click(), i)
  await page.waitForTimeout(3500)
  await page.evaluate(async () => { const ov=document.querySelector('[role=dialog]'); for(let y=0;y<ov.scrollHeight;y+=300){ov.scrollTop=y;await new Promise(r=>setTimeout(r,100))} ov.scrollTop=0 })
  await page.waitForTimeout(2500)
  const out = await page.evaluate(() => {
    const ov = document.querySelector('[role=dialog]')
    const name = (ov.querySelector('h1')?.textContent || '?').trim()
    const bad = [], hoz = []
    for (const el of ov.querySelectorAll('img, video')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const nw = el.naturalWidth || el.videoWidth, nh = el.naturalHeight || el.videoHeight
      const cs = getComputedStyle(el)
      const src = (el.currentSrc||el.src||'').split('/').pop()
      if (nw && nh) {
        const want = r.width * nh / nw
        const dev = Math.abs(r.height - want) / want
        // only a problem when the box is taller than the content and we're containing
        if (dev > 0.06 && cs.objectFit === 'contain')
          bad.push({ src, box: `${Math.round(r.width)}x${Math.round(r.height)}`, natural: `${nw}x${nh}`, expectedH: Math.round(want), ar: cs.aspectRatio, fit: cs.objectFit })
      }
      if (r.right > ov.clientWidth + 1 || r.left < -1) hoz.push({ src, left: Math.round(r.left), right: Math.round(r.right) })
    }
    // tiny media: anything whose rendered width is under 120px
    const tiny = [...ov.querySelectorAll('img, video')].map(el=>{const r=el.getBoundingClientRect();return {src:(el.currentSrc||el.src||'').split('/').pop(),w:Math.round(r.width),h:Math.round(r.height)}}).filter(m=>m.w>0&&m.w<120)
    return { name, scrollHeight: ov.scrollHeight, bad, hoz, tiny }
  })
  console.log(`\n=== ${out.name}  scrollH=${out.scrollHeight}`)
  if (out.bad.length) console.log('  LETTERBOX/height-attr:', JSON.stringify(out.bad))
  if (out.hoz.length) console.log('  HORIZ OVERFLOW:', JSON.stringify(out.hoz))
  if (out.tiny.length) console.log('  TINY(<120px):', JSON.stringify(out.tiny))
  if (!out.bad.length && !out.hoz.length && !out.tiny.length) console.log('  clean')
}
await browser.close()
