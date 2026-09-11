import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const manifest={}
for (const name of ['body','eyes','feet','mask','pockets','beek_up','beek_down']) {
 const {data,info}=await sharp(`/tmp/duolingo-sheen/${name}.png`).removeAlpha().raw().toBuffer({resolveWithObject:true})
 const rgba=Buffer.alloc(info.width*info.height*4,255)
 let min=255,max=0
 for(let i=0;i<info.width*info.height;i++) { const value=data[i*info.channels]; rgba[i*4+3]=Math.max(1,value); min=Math.min(min,value);max=Math.max(max,value) }
 if(max-min<30)throw new Error(`${name}: missing roughness variation`)
 // Three/glTF read sheen roughness from alpha, in linear color space.
 const png=await sharp(rgba,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer()
 const hash=createHash('sha256').update(png).digest('hex').slice(0,12)
 const url=`/generated/duolingo-${name}-sheen-${hash}.png`
 await writeFile(`public${url}`,png)
 manifest[name]={src:url,width:info.width,height:info.height,range:[min/255,max/255]}
 console.log(name,png.length,'bytes',min,max)
}
await writeFile('content/duolingo-sheen.json',JSON.stringify(manifest,null,2)+'\n')
