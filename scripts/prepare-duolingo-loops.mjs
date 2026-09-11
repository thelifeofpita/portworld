import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const root=process.env.CAMPAIGN_SOURCE_ROOT || '/Users/pita/Library/CloudStorage/GoogleDrive-josedph27@gmail.com/My Drive'
const source='CASES/duolingo/JOSE+PITA.mp4'
const clips=[
  {id:'iceCream',start:67,duration:3,label:'Rotating Duo ice cream',blend:false},
  {id:'sticks',start:46,duration:3.6,label:'Camera moving through the lesson sticks',blend:true},
]
await mkdir('public/generated',{recursive:true})
const manifest={}
for(const clip of clips){
  const input=path.join(root,source)
  const output=path.join(tmpdir(),`duolingo-${clip.id}-loop.mp4`)
  // One complete authored turn. The camera pass has a short wrap dissolve,
  // retaining forward camera movement rather than reversing the footage.
  const filter=clip.blend
    ? '[0:v]fps=30,scale=1280:720,setsar=1,split[a][b];[a]trim=start=0.3,setpts=PTS-STARTPTS[main];[b]trim=end=0.3,setpts=PTS-STARTPTS[head];[main][head]xfade=transition=fade:duration=0.3:offset=3,format=yuv420p[out]'
    : '[0:v]fps=30,scale=1280:720,setsar=1,format=yuv420p[out]'
  execFileSync('ffmpeg',['-v','error','-y','-ss',String(clip.start),'-t',String(clip.duration),'-i',input,'-filter_complex',filter,'-map','[out]','-an','-c:v','libx264','-preset','slow','-crf','19','-movflags','+faststart',output])
  const bytes=await readFile(output)
  const hash=createHash('sha256').update(bytes).digest('hex').slice(0,12)
  const src=`/generated/duolingo-${clip.id}-loop-${hash}.mp4`
  await writeFile('public'+src,bytes)
  const posterTemp=path.join(tmpdir(),`duolingo-${clip.id}-poster.png`)
  execFileSync('ffmpeg',['-v','error','-y','-i',output,'-frames:v','1',posterTemp])
  const posterBytes=await sharp(posterTemp).webp({quality:90}).toBuffer()
  const posterHash=createHash('sha256').update(posterBytes).digest('hex').slice(0,12)
  const poster=`/generated/duolingo-${clip.id}-poster-${posterHash}.webp`
  await writeFile('public'+poster,posterBytes)
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',output],{encoding:'utf8'}))
  manifest[clip.id]={src,poster,width:1280,height:720,duration:Number(probe.format.duration),bytes:bytes.length,label:clip.label,source,start:clip.start,end:clip.start+clip.duration,edit:clip.blend?'300 ms wrap dissolve; original forward camera motion':'One complete original rotation'}
  console.log(clip.id,manifest[clip.id])
}
await writeFile('content/duolingo-loops.json',JSON.stringify(manifest,null,2)+'\n')
