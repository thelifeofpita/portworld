import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

// Full artwork from the artist's original posts, not Instagram square previews.
const sources = [
  ['Cqg7PD2oDK1', 'king-of-my-own-world/1458091'],
  ['CqwNm0YtvHl', '2-17-pm-december-6th-1992/1459106'],
  ['Cq6chiJobGK', 'chained-up-to-reality/1459791'],
  ['CrlKQNvoV25', 'wings-of-captivity/1462170'],
  ['CtmVSNEoEq3', 'invasion/1469355'],
  ['CtuDx8tMPMh', 'going-for-a-walk/1469845'],
  ['Ct1s7TjoKC3', 'urban-transmutation/1470306'],
]
for (const [id, topic] of sources) {
  const data = JSON.parse(execFileSync('curl', ['-fsSL', 'https://blenderartists.org/t/' + topic + '.json'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }))
  const html = data.post_stream.posts[0].cooked
  const url = html.match(/class="lightbox" href="([^"]+)/)?.[1]
  if (!url) throw new Error('Missing original: ' + id)
  const original = execFileSync('curl', ['-fsSL', url], { maxBuffer: 30 * 1024 * 1024 })
  await sharp(original).resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toFile('public/playground/full-' + id + '.webp')
  console.log(id, url)
}
