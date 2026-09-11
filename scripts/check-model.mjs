#!/usr/bin/env node
// Sanity-checks a .glb exported from Blender before it goes into the site.
// Catches the exact failure mode that hit the Duolingo export twice: a
// material with no baseColorTexture AND no baseColorFactor silently renders
// as flat white in three.js, with no error anywhere in the pipeline.
//
// Usage: npm run check-model -- public/models/duolingo.glb

import { readFileSync, statSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('Usage: npm run check-model -- <path-to.glb>')
  process.exit(1)
}

const buf = readFileSync(path)
if (buf.readUInt32LE(0) !== 0x46546c67) {
  console.error('Not a .glb (bad magic bytes) — this script only reads binary glTF.')
  process.exit(1)
}

let json = null
let binLength = 0
let offset = 12
while (offset < buf.length) {
  const chunkLength = buf.readUInt32LE(offset)
  const chunkType    = buf.readUInt32LE(offset + 4)
  const chunkData    = buf.subarray(offset + 8, offset + 8 + chunkLength)
  if (chunkType === 0x4e4f534a) json = JSON.parse(chunkData.toString('utf8'))       // 'JSON'
  if (chunkType === 0x004e4942) binLength = chunkLength                            // 'BIN'
  offset += 8 + chunkLength
}
if (!json) { console.error('No JSON chunk found.'); process.exit(1) }

const sizeKB = (statSync(path).size / 1024).toFixed(0)
const warnings = []
const notes = []

console.log(`\n${path}  —  ${sizeKB} KB\n`)

const meshCount = (json.meshes ?? []).length
const vertexCount = (json.accessors ?? [])
  .filter(a => a.type === 'VEC3')
  .reduce((sum, a, i, arr) => i === 0 ? a.count : sum, 0) // rough, first VEC3 accessor as a sanity signal
console.log(`meshes: ${meshCount}`)

const materials = json.materials ?? []
console.log(`materials: ${materials.length}\n`)

materials.forEach((m, i) => {
  const pbr = m.pbrMetallicRoughness ?? {}
  const hasBaseColorTexture = !!pbr.baseColorTexture
  const hasBaseColorFactor  = Array.isArray(pbr.baseColorFactor)
  const factor = pbr.baseColorFactor
  const isDefaultWhite = hasBaseColorFactor && factor.slice(0, 3).every(c => c > 0.98)
  const name = m.name ?? `material[${i}]`

  let status
  if (hasBaseColorTexture) {
    status = 'OK — textured'
  } else if (hasBaseColorFactor && !isDefaultWhite) {
    status = `OK — flat color rgb(${factor.slice(0, 3).map(c => Math.round(c * 255)).join(', ')})`
  } else if (hasBaseColorFactor && isDefaultWhite) {
    status = 'WARN — flat white (check if this is intentional)'
    warnings.push(`"${name}" is flat white — likely lost its color on export`)
  } else {
    status = 'FAIL — no texture, no baseColorFactor (renders flat white)'
    warnings.push(`"${name}" has NO color data at all — Base Color didn't reach the exporter`)
  }
  console.log(`  ${name.padEnd(24)} ${status}`)
})

// Images: flag any that reference an external file rather than being embedded
// in the .glb's own BIN chunk — an external URI is exactly what broke the
// wood texture on the Duolingo USD export (relative "./textures/..." path
// that didn't travel with the file).
const images = json.images ?? []
if (images.length) {
  console.log(`\nimages: ${images.length}`)
  images.forEach(img => {
    if (img.uri && !img.uri.startsWith('data:')) {
      warnings.push(`image "${img.name ?? img.uri}" is an EXTERNAL reference ("${img.uri}") — not embedded in the .glb, will break if that file isn't shipped alongside`)
    } else {
      console.log(`  ${(img.name ?? '(unnamed)').padEnd(24)} embedded ✓`)
    }
  })
} else {
  notes.push('no images at all — fine if every material above shows a flat color on purpose')
}

if (json.extensionsUsed?.includes('KHR_draco_mesh_compression') || json.extensionsUsed?.includes('EXT_meshopt_compression')) {
  notes.push('geometry is compressed (Draco/meshopt) — good for a production build')
}

console.log('')
if (warnings.length) {
  console.log(`${warnings.length} issue(s):`)
  warnings.forEach(w => console.log(`  ✗ ${w}`))
} else {
  console.log('No color/texture issues found.')
}
if (notes.length) notes.forEach(n => console.log(`  · ${n}`))
console.log('')

process.exit(warnings.length ? 1 : 0)
