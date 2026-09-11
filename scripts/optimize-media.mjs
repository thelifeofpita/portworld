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
 for(const [label,size,crf] of [['preview',480,22],...(file.endsWith('neck-chain.mp4')?[['detail',1080,20]]:[])]){
 const temp=path.join(output,`${stem}-${label}.mp4`)
 execFileSync('ffmpeg',['-v','error','-y','-i',file,'-map','0:v:0','-vf',`scale='min(${size},iw)':-2`,'-c:v','libx264','-preset','fast','-crf',String(crf),'-pix_fmt','yuv420p','-an','-movflags','+faststart',temp])
 record[`${label}Src`]=await hashed(temp,`${stem}-${label}`,'mp4')
 }
 manifest[src]=record
 }
}}
await walk('public/playground')
await fs.writeFile('content/media-manifest.json',JSON.stringify(manifest,null,2)+'\n')
console.log(`Generated metadata and variants for ${Object.keys(manifest).length} assets`)

// Keep the authored label texels exactly; only change the lossless encoding.
const label = 'public/models/surf-can-label.png'
const labelTemp = path.join(output, 'surf-can-label.tmp')
await sharp(label).webp({lossless:true,effort:6}).toFile(labelTemp)
console.log('Lossless label:', await hashed(labelTemp, 'surf-can-label', 'webp'))
