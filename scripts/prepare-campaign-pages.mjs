import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Source files are read only. Override for another local copy of the drive.
const root = process.env.CAMPAIGN_SOURCE_ROOT || '/Users/pita/Library/CloudStorage/GoogleDrive-josedph27@gmail.com/My Drive'
const twix = 'MAD/ADS/hatTwix/'
const duo = 'CASES/duolingo/'
const verified = 'MAD/ADS/giffgaff/'
const selections = [
  ['twixLogo', twix+'imgs/hatTwixByTwix01.png', '35', 'Hat Twix by Twix campaign logo'],
  ['twixHenry', twix+'ooh/henry.png', '65', 'Thierry Henry: One goal was good. Two was even better.'],
  ['twixZidane', twix+'ooh/zidane.png', '65', 'Zinedine Zidane: One goal was good. Two was even better.'],
  ['twixBale', twix+'ooh/bale.png', '65', 'Gareth Bale: One goal was good. Two was even better.'],
  ['twixPub', twix+'ooh/Artboard5.png', '65', 'The Henry Hat Twix poster in a football pub'],
  ['twixSocialPsg', twix+'igntiktok/IG 3.png', '68–75', 'PSG social campaign mockup celebrating a Hat Twix'],
  ['twixSocialDinamo', twix+'igntiktok/IG 6.png', '70', 'Dinamo social campaign mockup celebrating two goals'],
  ['twixSocialArsenal', twix+'imgs/433/drive-download-20260308T133932Z-1-001/IG POST 1.png', '75', 'Arsenal social campaign mockup with Hat Twix highlighted'],
  ['twixTweets', twix+'imgs/tweets3/X1.png', 'Social extension', 'Hat Twix campaign tweets about the new name for two goals'],
  ['twixTweetStats', twix+'imgs/tweets3/X10.png', 'Social extension', 'Hat Twix campaign tweet: career stats look twice as impressive'],
  ['twixTiktok', twix+'igntiktok/T2.jpg', 'Social extension', 'TikTok campaign mockup: Legendary CR7 Hat Twixes'],
  ['duoProduct', duo+'stills/ycly.jpg', '65–85', 'The frosted Duo-shaped ice cream with its wooden stick'],
  ['duoReminder', duo+'JOSE+PITA.mp4', '45', 'Ice cream stick engraved with Did you do your Duolingo today?', 45],
  ['duoLessons', duo+'stills/Frame 13.jpg', '47–52', 'Three sticks with lessons: gelato, l’addition, and siesta'],
  ['duoFrench', duo+'stills/stick_1.png', '46', 'Ask for l’addition, not the check: French lesson on a stick'],
  ['duoSpanish', duo+'stills/stick_02.png', '47', 'Take a siesta, not just a nap: Spanish lesson on a stick'],
  ['duoItalian', duo+'stills/stick_03.png', '44', 'Ask for a gelato, not an ice cream: Italian lesson on a stick'],
  ['duoWinner', duo+'stills/sticks.png', '50', 'Super Winner reward stick alongside the language lessons'],
  ['verifiedVendor1', verified+'imgs/badges/badge1.png', '45–55', 'Big Issue vendor wearing the Put in a good word badge'],
  ['verifiedVendor2', verified+'imgs/badges/badge2.png', '45–55', 'Big Issue vendor in a flat cap wearing the reference badge'],
  ['verifiedVendor3', verified+'imgs/badges/badge3.png', '45–55', 'Big Issue vendor in a pink hat wearing the reference badge'],
  ['verifiedBillboard', verified+'imgs/ooh/billboard1.6.png', '70', 'The look of reliability: Martin’s Verified billboard'],
  ['verifiedLinkedin', verified+'imgs/ooh/linkedinFeed.png', '75–80', 'The look of dedication: Susan’s Verified LinkedIn mockup'],
  ['verifiedBoard', verified+'imgs/ooh/communityBoard.png', '75–80', 'The look of consistency: Will’s Verified community noticeboard'],
]
await mkdir('public/generated', { recursive: true })
const editedInputs = {
  twixSocialPsg: 'assets/campaign-edits/hat-twix-psg.png',
  twixSocialDinamo: 'assets/campaign-edits/hat-twix-dinamo.png',
  twixSocialArsenal: 'assets/campaign-edits/hat-twix-arsenal.png',
}
const manifest = {}
for (const [id, source, timestamp, alt, frame] of selections) {
  let input = editedInputs[id] || path.join(root, source)
  if (frame !== undefined) {
    const still = path.join(tmpdir(), `campaign-${id}.png`)
    execFileSync('ffmpeg', ['-v','error','-y','-ss',String(frame),'-i',input,'-frames:v','1',still])
    input = still
  }
  const metadata = await sharp(input).metadata()
  const widths = [...new Set([480, 960, 1600].map(w => Math.min(w, metadata.width)))].sort((a,b)=>a-b)
  const variants = []
  for (const width of widths) {
    const { data, info } = await sharp(input).rotate().resize({width,withoutEnlargement:true}).webp({quality:90,alphaQuality:100}).toBuffer({resolveWithObject:true})
    const hash = createHash('sha256').update(data).digest('hex').slice(0,12)
    const src = `/generated/case-${id}-${width}-${hash}.webp`
    await writeFile('public'+src, data)
    variants.push({src,width:info.width,height:info.height,bytes:data.length})
  }
  const largest = variants.at(-1)
  manifest[id] = {
    source, localCaseTimestamp: timestamp,
    transformation: editedInputs[id] ? 'Image edit: yellow Hat Twix highlights and selection-outline cleanup; responsive WebP from reviewed edit' : frame !== undefined ? `Still extracted at ${frame}s; responsive WebP, complete frame retained` : 'Responsive WebP; full artwork and existing alpha retained',
    ...(editedInputs[id] ? { editedSource: editedInputs[id] } : {}),
    editorialReference: id.startsWith('twix') ? 'VykD83mmSTo' : id.startsWith('duo') ? 'bWRIjCEHXJk' : 'HwCWeJ_ZcvQ',
    alt, width:largest.width,height:largest.height,src:largest.src,
    srcSet:variants.map(v=>`${v.src} ${v.width}w`).join(', '), variants,
  }
  console.log(id, variants.reduce((n,v)=>n+v.bytes,0))
}
await writeFile('content/campaign-page-media.json', JSON.stringify(manifest,null,2)+'\n')
