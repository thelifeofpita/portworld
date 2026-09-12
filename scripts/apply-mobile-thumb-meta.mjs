// Third step of the mobile-thumbnail pipeline: copies what
// process-mobile-project-thumbs.mjs measured into content/projectsContent.ts.
//
// This used to be done by hand, which is error-prone in a specific way: the
// numbers are meaningless unless they match the image they were measured from,
// and the filenames are now content-hashed, so a stale mobileThumb path points
// at a file that no longer exists. Doing it mechanically keeps the two in step.
//
// Usage: node scripts/apply-mobile-thumb-meta.mjs
//   (after capture-mobile-project-thumbs.mjs and process-mobile-project-thumbs.mjs)
import { readFile, writeFile } from 'node:fs/promises'

const META_PATH = '/tmp/mobile-thumb-width-pct.json'
const TARGET = 'content/projectsContent.ts'

const meta = JSON.parse(await readFile(META_PATH, 'utf8'))
let src = await readFile(TARGET, 'utf8')
let changed = 0

for (const [name, m] of Object.entries(meta)) {
  // Anchor on the piece's own name, which survives in the hashed filename
  // (duolingo-ab12cd34ef56.webp), and rewrite the whole field group after it.
  const pattern = new RegExp(
    `mobileThumb:(\\s*)'/projects/mobile-thumbs/${name}(?:-[0-9a-f]{12})?\\.webp',\\n` +
    `(\\s*)mobileThumbWidthPct: [\\d.]+,\\n` +
    `\\s*mobileThumbAspect: [\\d.]+,\\n` +
    `\\s*mobileThumbSrcSet: '[^']*',\\n` +
    `\\s*mobileThumbWidth: \\d+,\\n` +
    `\\s*mobileThumbHeight: \\d+,\\n`,
  )
  const replacement =
    `mobileThumb:$1'${m.src}',\n` +
    `$2mobileThumbWidthPct: ${m.widthPct},\n` +
    `$2mobileThumbAspect: ${m.aspect},\n` +
    `$2mobileThumbSrcSet: '${m.srcSet}',\n` +
    `$2mobileThumbWidth: ${m.width},\n` +
    `$2mobileThumbHeight: ${m.height},\n`

  if (!pattern.test(src)) {
    console.error(`FAILED to locate ${name} in ${TARGET} — left untouched`)
    process.exitCode = 1
    continue
  }
  src = src.replace(pattern, replacement)
  changed++
  console.log(`${name.padEnd(18)} ${m.src}  ${m.widthPct}% aspect=${m.aspect}`)
}

await writeFile(TARGET, src)
console.log(`\nupdated ${changed}/${Object.keys(meta).length} entries in ${TARGET}`)
