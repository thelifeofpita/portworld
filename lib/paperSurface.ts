import * as THREE from 'three'

// Seamless, deterministic paper relief. This affects light, not printed ink.
export function createPaperNormal() {
  const size = 256
  let seed = 731
  const noise = new Float32Array(size * size)
  for (let i = 0; i < noise.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    noise[i] = seed / 4294967296
  }
  const sample = (x: number, y: number) => noise[((y + size) % size) * size + (x + size) % size]
  const height = (x: number, y: number) => (
    sample(x, y) * .35 + sample(x - 1, y) * .2 +
    sample(x + 1, y) * .2 + sample(x, y - 1) * .125 + sample(x, y + 1) * .125
  )
  const pixels = new Uint8Array(size * size * 4)
  const normal = new THREE.Vector3()
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    normal.set((height(x - 1, y) - height(x + 1, y)) * 2,
      (height(x, y - 1) - height(x, y + 1)) * 2, 1).normalize()
    const offset = (y * size + x) * 4
    pixels[offset] = Math.round((normal.x * .5 + .5) * 255)
    pixels[offset + 1] = Math.round((normal.y * .5 + .5) * 255)
    pixels[offset + 2] = Math.round((normal.z * .5 + .5) * 255)
    pixels[offset + 3] = 255
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat)
  texture.name = 'Magazine — fine paper fibres'
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(3, 4)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}
