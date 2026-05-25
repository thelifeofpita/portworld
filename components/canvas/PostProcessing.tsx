'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { bgStore } from '@/lib/bgStore'
import { accentStore } from '@/lib/accentStore'

// ─── ASCII atlas ──────────────────────────────────────────────────────────────

const ASCII_CHARS = ' .\'`-,:;!|i1tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'
const ATLAS_CELL  = 64 // px per character cell — high-res for crisp sampling

async function buildAsciiAtlas(): Promise<THREE.CanvasTexture> {
  // Load Heming before drawing so canvas uses it
  const face = new FontFace('Heming', 'url(/fonts/HemingVariable.woff2) format("woff2"), url(/fonts/HemingVariable.ttf) format("truetype")')
  await face.load()
  document.fonts.add(face)

  const n      = ASCII_CHARS.length
  const canvas = document.createElement('canvas')
  canvas.width  = n * ATLAS_CELL
  canvas.height = ATLAS_CELL
  const ctx     = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle    = '#fff'
  ctx.font         = `${Math.round(ATLAS_CELL * 1.2)}px Heming`
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ASCII_CHARS.split('').forEach((ch, i) => {
    ctx.fillText(ch, i * ATLAS_CELL + ATLAS_CELL / 2, ATLAS_CELL / 2)
  })
  const tex        = new THREE.CanvasTexture(canvas)
  tex.minFilter    = THREE.LinearFilter
  tex.magFilter    = THREE.LinearFilter
  return tex
}

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAG = /* glsl */`
uniform sampler2D uScene;
uniform sampler2D uAsciiAtlas;
uniform sampler2D uAccentMask;  // R=unfocused accent, G=focused accent, black elsewhere
uniform vec2      uResolution;
uniform float     uCharCount;
uniform float     uTransition; // 0=1-bit  1=ASCII  2=halftone  (3=wrap back to 1-bit)
uniform float     uBgLum;      // 1 = white bg, 0 = black bg (lerped)
uniform float     uDpr;        // device pixel ratio — normalises gl_FragCoord to CSS px

const vec3 ACCENT_BASE  = vec3(0.949, 0.047, 0.122); // #F20C1F — unfocused
const vec3 ACCENT_FOCUS = vec3(0.949, 0.875, 0.047); // #F2DF0C — focused

vec3 accentInk(vec2 uv, vec3 baseInk, float scale) {
  vec4  mask       = texture2D(uAccentMask, uv);
  float total      = mask.r + mask.g;
  float isAccent   = step(0.01, total) * scale;
  float focusRatio = mask.g / max(total, 0.001); // 0=unfocused, 1=focused
  vec3  accentColor = mix(ACCENT_BASE, ACCENT_FOCUS, focusRatio);
  return mix(baseInk, accentColor, isAccent);
}

float bayer4(vec2 pos) {
  int x = int(mod(pos.x, 4.0));
  int y = int(mod(pos.y, 4.0));
  int i = y * 4 + x;
  if (i ==  0) return  0.0; if (i ==  1) return  8.0;
  if (i ==  2) return  2.0; if (i ==  3) return 10.0;
  if (i ==  4) return 12.0; if (i ==  5) return  4.0;
  if (i ==  6) return 14.0; if (i ==  7) return  6.0;
  if (i ==  8) return  3.0; if (i ==  9) return 11.0;
  if (i == 10) return  1.0; if (i == 11) return  9.0;
  if (i == 12) return 15.0; if (i == 13) return  7.0;
  if (i == 14) return 13.0;
  return 5.0;
}

void main() {
  // Normalise to CSS pixels so block sizes are DPR-independent
  vec2 coord = gl_FragCoord.xy / uDpr;

  // ── 1-bit (2px blocks) ────────────────────────────────────────────────────
  vec2  bp1    = floor(coord / 2.0);
  vec2  uv1    = (bp1 * 2.0 + 1.0) / uResolution;
  float lum1   = dot(texture2D(uScene, uv1).rgb, vec3(0.299, 0.587, 0.114));
  float bit    = step((bayer4(bp1) + 0.5) / 16.0, lum1);
  float isInk1 = abs(bit - uBgLum);
  vec3  ink1   = accentInk(uv1, vec3(1.0 - uBgLum), 1.0);
  vec3  oneBit = mix(vec3(uBgLum), ink1, isInk1);
  // Suppress dithering for pixels that match the background colour.
  // transWeight was previously used here but only reached 1.0 at the midpoint,
  // leaving visible dots through most of the transition. Removing it is safe:
  // at stable white/black, mix(white,white,1) and mix(black,black,1) are no-ops.
  float bgProx = step(0.05, abs(lum1 - uBgLum));
  oneBit = mix(vec3(uBgLum), oneBit, bgProx);

  // ── ASCII (8px blocks) ────────────────────────────────────────────────────
  float cs   = 8.0;
  vec2  bp8  = floor(coord / cs);
  vec2  uv8  = (bp8 * cs + cs * 0.5) / uResolution;
  float lum8 = dot(texture2D(uScene, uv8).rgb, vec3(0.299, 0.587, 0.114));

  float density = abs(lum8 - uBgLum);
  float smMax   = mix(0.35, 1.0, uBgLum);
  density = smoothstep(0.01, smMax, density);

  float bayerBlock  = (bayer4(bp8) + 0.5) / 16.0;
  float noiseWeight = smoothstep(0.02, 0.08, density);
  float idx     = density * (uCharCount - 1.0) + (bayerBlock - 0.5) * 5.0 * noiseWeight;
  float charIdx = floor(clamp(idx, 0.0, uCharCount - 1.0));
  vec2  bf      = fract(coord / cs);
  float atlasU  = (charIdx + bf.x) / uCharCount;
  float ink     = texture2D(uAsciiAtlas, vec2(atlasU, bf.y)).r;
  float pixel   = mix(ink, 1.0 - ink, uBgLum);
  float inkAmt8 = abs(pixel - uBgLum);
  vec3  ink8    = accentInk(uv8, vec3(1.0 - uBgLum), 1.0);
  vec3  ascii   = mix(vec3(uBgLum), ink8, inkAmt8);

  // ── Halftone (4px cells) ──────────────────────────────────────────────────
  float hcs  = 4.0;
  vec2  hbp   = floor(coord / hcs);
  vec2  hctr  = hbp * hcs + hcs * 0.5;
  float hlum  = dot(texture2D(uScene, hctr / uResolution).rgb, vec3(0.299, 0.587, 0.114));
  float hdens = abs(hlum - uBgLum);
  hdens = smoothstep(0.01, mix(0.35, 1.0, uBgLum), hdens);
  float radius   = hdens * hcs * 0.55;
  float circle   = 1.0 - smoothstep(radius - 0.5, radius + 0.5, length(coord - hctr));
  float inkAmtH  = abs(mix(circle, 1.0 - circle, uBgLum) - uBgLum);
  vec3  inkH     = accentInk(hctr / uResolution, vec3(1.0 - uBgLum), 1.0);
  vec3  halftone = mix(vec3(uBgLum), inkH, inkAmtH);

  // ── Blend: cycle 0→1→2 with wrap segment 2→3 = halftone→1-bit ────────────
  float t = uTransition;
  vec3  result;
  if (t <= 1.0) {
    result = mix(oneBit, ascii, t);
  } else if (t <= 2.0) {
    result = mix(ascii, halftone, t - 1.0);
  } else {
    result = mix(halftone, oneBit, t - 2.0);
  }
  gl_FragColor = vec4(result, 1.0);
}
`

// ─── Component ────────────────────────────────────────────────────────────────

export default function PostProcessing({ mode = 0 }: { mode?: 0|1|2 }) {
  const { gl, scene, camera, size } = useThree()
  const transition  = useRef(0)
  const transTarget = useRef(0)
  const prevMode    = useRef<0|1|2>(0)
  const [atlasTexture, setAtlasTexture] = useState<THREE.CanvasTexture | null>(null)

  // ── Render targets ───────────────────────────────────────────────────────
  // Sized in CSS pixels (not physical) — the shader normalises gl_FragCoord
  // by uDpr, so block density stays consistent across DPR values.
  const { target, maskTarget } = useMemo(() => ({
    target:     new THREE.WebGLRenderTarget(size.width, size.height, { minFilter: THREE.LinearFilter,  magFilter: THREE.LinearFilter,  stencilBuffer: false }),
    maskTarget: new THREE.WebGLRenderTarget(size.width, size.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, stencilBuffer: false }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  // Per-mesh materials: color encodes blend (R=unfocused weight, G=focused weight).
  // Created lazily in useFrame and lerped toward 0/1 each frame.
  const accentMats   = useRef<Map<THREE.Mesh, { mat: THREE.MeshBasicMaterial; blend: number }>>(new Map())
  const maskBlackMat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x000000 }), [])
  // Pre-allocated black background for mask renders — prevents scene.background
  // (which lerps during bg transitions) from leaking into the mask clear color.
  const maskBg       = useMemo(() => new THREE.Color(0, 0, 0), [])

  // Scene mesh cache — populated once on first rendered frame, avoids traverse() every frame.
  const sceneMeshes   = useRef<THREE.Mesh[]>([])
  const origMats      = useRef<Array<THREE.Material | THREE.Material[]>>([])
  const meshesScanned = useRef(false)

  const { quadScene, quadCamera, material } = useMemo(() => {
    // Blank 1×1 placeholder until the real atlas loads
    const placeholder = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    placeholder.needsUpdate = true

    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const material   = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        uScene:      { value: null },
        uAsciiAtlas: { value: placeholder },
        uAccentMask: { value: null },
        uResolution: { value: new THREE.Vector2(size.width, size.height) },
        uCharCount:  { value: ASCII_CHARS.length },
        uTransition: { value: 0 },
        uBgLum:      { value: 1 },
        uDpr:        { value: gl.getPixelRatio() },
      },
      depthTest:  false,
      depthWrite: false,
    })
    const quadScene = new THREE.Scene()
    quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
    return { quadScene, quadCamera, material }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the atlas asynchronously and update the uniform once ready
  useEffect(() => {
    let cancelled = false
    buildAsciiAtlas().then((tex) => {
      if (!cancelled) {
        material.uniforms.uAsciiAtlas.value = tex
        setAtlasTexture(tex)
      }
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material])

  // Update transition target when mode cycles; handle 2→0 wrap via segment 2→3
  useEffect(() => {
    if (mode === 0 && prevMode.current === 2) {
      transTarget.current = 3
    } else {
      transTarget.current = mode
    }
    prevMode.current = mode
  }, [mode])

  useEffect(() => {
    target.setSize(size.width, size.height)
    maskTarget.setSize(size.width, size.height)
    material.uniforms.uResolution.value.set(size.width, size.height)
    material.uniforms.uDpr.value = gl.getPixelRatio()
  }, [size, gl, target, maskTarget, material])

  useEffect(() => () => {
    target.dispose()
    maskTarget.dispose()
    accentMats.current.forEach(({ mat }) => mat.dispose())
    maskBlackMat.dispose()
    material.dispose()
    atlasTexture?.dispose()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, material])

  useFrame((_, delta) => {
    const dt      = Math.min(delta, 0.1)
    const tTrans  = 1 - Math.pow(1 - 0.14, dt * 60)
    const tAccent = 1 - Math.pow(1 - 0.16, dt * 60)

    // Snap wrap: once halftone→1-bit segment completes, reset both refs to 0
    if (transTarget.current === 3 && transition.current > 2.97) {
      transition.current = 0
      transTarget.current = 0
    }
    transition.current += (transTarget.current - transition.current) * tTrans

    // Render scene to RT
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(scene, camera)

    // Lerp per-mesh blend toward focused (1) or unfocused (0) each frame.
    // R channel = unfocused weight, G channel = focused weight.
    accentStore.meshes.forEach(mesh => {
      let entry = accentMats.current.get(mesh)
      if (!entry) {
        entry = { mat: new THREE.MeshBasicMaterial(), blend: 0 }
        accentMats.current.set(mesh, entry)
      }
      entry.blend += ((mesh === accentStore.focused ? 1 : 0) - entry.blend) * tAccent
      entry.mat.color.setRGB(1 - entry.blend, entry.blend, 0)
    })

    // Build mesh cache on first frame — scene is static after model loads
    if (!meshesScanned.current) {
      sceneMeshes.current = []
      scene.traverse(obj => { if (obj instanceof THREE.Mesh) sceneMeshes.current.push(obj) })
      origMats.current.length = sceneMeshes.current.length
      meshesScanned.current = true
    }

    // Render accent mask — single pass with material swap (no z-fighting, correct depth).
    // Temporarily override scene.background with black so gl.clear() always produces
    // a black mask background — if we leave it as the lerping scene bg color, the mask
    // gets a grey clear during white↔black transitions, which the shader misreads as
    // accent ink everywhere (grey R+G > 0.01 threshold), producing red background dots.
    const meshList = sceneMeshes.current
    const matList  = origMats.current
    for (let i = 0; i < meshList.length; i++) {
      matList[i] = meshList[i].material
      const entry = accentMats.current.get(meshList[i])
      meshList[i].material = entry ? entry.mat : maskBlackMat
    }
    const savedBg   = scene.background
    scene.background = maskBg
    gl.setRenderTarget(maskTarget)
    gl.clear()
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    scene.background = savedBg
    for (let i = 0; i < meshList.length; i++) { meshList[i].material = matList[i] }

    // Apply post-processing
    material.uniforms.uScene.value      = target.texture
    material.uniforms.uAccentMask.value = maskTarget.texture
    material.uniforms.uTransition.value = transition.current
    material.uniforms.uBgLum.value      = bgStore.luminance
    gl.render(quadScene, quadCamera)
  }, 1)

  return null
}
