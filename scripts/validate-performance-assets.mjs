import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import sharp from 'sharp'
const models=JSON.parse(await fs.readFile('content/model-fit.json','utf8'))
for(const [src,fit] of Object.entries(models)){
 const data=await fs.readFile('public'+src.split('?')[0]);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),fit.sha256,`Regenerate model-fit.json after editing ${src}`)
 assert(fit.coverage>0&&fit.coverage<=1)
}
const media=JSON.parse(await fs.readFile('content/media-manifest.json','utf8'))
for(const [src,meta] of Object.entries(media)){
 for(const variant of [meta.previewSrc,meta.detailSrc].filter(Boolean)){
  const data=await fs.readFile('public'+variant)
  assert(variant.includes(crypto.createHash('sha256').update(data).digest('hex').slice(0,12)))
  if(meta.duration){
   const info=JSON.parse(execFileSync('ffprobe',['-v','quiet','-show_format','-of','json','public'+variant],{encoding:'utf8'}))
   assert(Math.abs(Number(info.format.duration)-meta.duration)<.06,`Duration changed for ${src}`)
  }
 }
}
// The can label is no longer kept lossless at its authored 3564px. It is mapped onto
// a drink can inside the 3D scene and never shown flat, and at 4.03MB it was the third
// largest thing the "Behold." loader waited on. What matters now is that it stays
// within the budget that made it worth downsampling, and keeps the aspect ratio the
// UVs were authored against — not that it is pixel-identical to the source PNG.
const label=(await fs.readFile('components/canvas/InSceneProjectModel.tsx','utf8')).match(/\/generated\/surf-can-label-[a-f0-9]+\.webp/)[0]
const labelMeta=await sharp('public'+label).metadata(),sourceMeta=await sharp('public/models/surf-can-label.png').metadata()
assert(labelMeta.width<=2048,`Label is ${labelMeta.width}px wide; budget is 2048`)
assert((await fs.stat('public'+label)).size<600_000,'Label must stay under 600KB')
assert(Math.abs(labelMeta.width/labelMeta.height-sourceMeta.width/sourceMeta.height)<.01,'Label aspect ratio must match the authored UVs')
console.log(`PASS: ${Object.keys(models).length} model hashes/fit areas, ${Object.keys(media).length} media entries, video durations, label budget`)
