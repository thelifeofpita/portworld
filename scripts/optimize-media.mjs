// Reproducible derivatives; originals are never overwritten.
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'
const root='public', output='public/generated'
await fs.mkdir(output,{recursive:true})
const manifest={}
async function hashed(temp,stem,ext){const data=await fs.readFile(temp);const hash=crypto.createHash('sha256').update(data).digest('hex').slice(0,12);const name=`${stem}-${hash}.${ext}`;await fs.rename(temp,path.join(output,name));return `/generated/${name}`}
async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory()){await walk(file);continue}const ext=path.extname(file).toLowerCase(),src='/'+path.relative(root,file),stem=path.relative(root,file).replace(/[^a-zA-Z0-9]/g,'-');if(['.png','.jpg','.jpeg','.webp'].includes(ext)){
 const meta=await sharp(file).metadata();const variants=[]
 for(const width of [...new Set([320,640,1280,Math.min(meta.width,2400)].map(w=>Math.min(w,meta.width)))].sort((a,b)=>a-b)){
 const temp=path.join(output,`${stem}-${width}.tmp`)
 await sharp(file).resize({width,withoutEnlargement:true}).webp({quality:88,effort:5}).toFile(temp)
 variants.push({src:await hashed(temp,`${stem}-${width}`,'webp'),width})
 }
 manifest[src]={width:meta.width,height:meta.height,previewSrc:variants[Math.min(1,variants.length-1)].src,detailSrc:variants.at(-1).src,srcSet:variants.map(v=>`${v.src} ${v.width}w`).join(', ')}
 }else if(ext==='.mp4'||ext==='.webm'){
 const probe=JSON.parse(execFileSync('ffprobe',['-v','quiet','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));const video=probe.streams.find(s=>s.codec_type==='video');if(!video)continue
 const record={width:video.width,height:video.height,duration:Number(probe.format.duration),playbackId:src}
 const sourceBytes=(await fs.stat(file)).size
 // Card previews are small and looping, so they get a frame-rate cap and a bitrate
 // ceiling. Without them, re-encoding noisy 60fps source at a low CRF produced
 // "previews" LARGER than their own originals (animals.mp4: 5.67MB in, 12.67MB out),
 // which then sat on the critical path behind the "Behold." loader. The guard below
 // is the real protection — any transcode that fails to beat its source is discarded
 // and the manifest points back at the original file.
 for(const [label,size,crf,fps,maxrate] of [['preview',480,30,30,'1200k'],...(file.endsWith('neck-chain.mp4')?[['detail',1080,20,null,null]]:[])]){
 const temp=path.join(output,`${stem}-${label}.mp4`)
 // The frame-rate cap belongs in the filter chain, not as an output `-r`: `-r 30`
 // rounds the tail and stretched these clips by exactly two frames (+0.067s),
 // which drifts them out of the shared per-piece media clock that preview and
 // detail both position against. `fps=30` reproduces the source duration exactly.
 execFileSync('ffmpeg',['-v','error','-y','-i',file,'-map','0:v:0',
  '-vf',`scale='min(${size},iw)':-2${fps?`,fps=${fps}`:''}`,
  '-c:v','libx264','-preset','slow','-crf',String(crf),
  ...(maxrate?['-maxrate',maxrate,'-bufsize','2400k']:[]),
  '-pix_fmt','yuv420p','-an','-movflags','+faststart',temp])
 const bytes=(await fs.stat(temp)).size
 if(bytes>=sourceBytes*0.9){
  await fs.rm(temp)
  record[`${label}Src`]=src
  console.warn(`  ! ${stem} ${label}: ${(bytes/1e6).toFixed(2)}MB vs ${(sourceBytes/1e6).toFixed(2)}MB source — keeping the original`)
 }else record[`${label}Src`]=await hashed(temp,`${stem}-${label}`,'mp4')
 }
 manifest[src]=record
 }
}}
await walk('public/playground')
await fs.writeFile('content/media-manifest.json',JSON.stringify(manifest,null,2)+'\n')
console.log(`Generated metadata and variants for ${Object.keys(manifest).length} assets`)

// Surf model textures. The label was previously kept at its authored 3564x3094 and
// encoded losslessly, which cost 4.03MB — on the critical path, for a texture mapped
// onto a drink can that is never more than a few hundred pixels tall on screen. 2048
// at q90 is indistinguishable there. The normal/roughness maps are deliberately left
// as authored: they carry data rather than colour, and at ~200KB each the saving does
// not justify risking shading artifacts.
for(const [file,stem,width] of [
 ['public/models/surf-can-label.png','surf-can-label',2048],
 ['public/models/surf-phone-screen.jpg','surf-phone-screen',null],
]){
 const temp=path.join(output,`${stem}.tmp`)
 await sharp(file).resize(width?{width,withoutEnlargement:true}:undefined).webp({quality:90,effort:6}).toFile(temp)
 const before=(await fs.stat(file)).size,after=(await fs.stat(temp)).size
 console.log(`${stem}: ${(before/1e6).toFixed(2)}MB -> ${(after/1e6).toFixed(2)}MB`,await hashed(temp,stem,'webp'))
}
