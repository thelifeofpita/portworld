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
const label=(await fs.readFile('components/canvas/InSceneProjectModel.tsx','utf8')).match(/\/generated\/surf-can-label-[a-f0-9]+\.webp/)[0]
assert.deepEqual(await sharp('public/models/surf-can-label.png').ensureAlpha().raw().toBuffer(),await sharp('public'+label).ensureAlpha().raw().toBuffer(),'Lossless label pixels must match')
console.log(`PASS: ${Object.keys(models).length} model hashes/fit areas, ${Object.keys(media).length} media entries, video durations, lossless label pixels`)
