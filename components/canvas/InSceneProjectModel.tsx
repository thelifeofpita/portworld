'use client'

import { useEffect, useMemo, useRef } from 'react'
import { startupWarmup } from '@/lib/startupWarmup'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Center, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { screenToWorld, cssSizeToWorld, worldSizeToCssSize } from '@/lib/screenToWorld'
import { bigProjectSlotStore } from '@/lib/bigProjectSlotStore'
import { bigProjectGlowStore } from '@/lib/bigProjectGlowStore'
import { bigProjectFootprintStore } from '@/lib/bigProjectFootprintStore'
import { bigProjectExpandStore } from '@/lib/bigProjectExpandStore'
import { accentStore } from '@/lib/accentStore'
import { zoneTransitionStore } from '@/lib/zoneTransitionStore'
import { surfMaterialValues } from '@/lib/surfMaterialValues'
import modelFit from '@/content/model-fit.json'
import duoSheen from '@/content/duolingo-sheen.json'
import { createPaperNormal } from '@/lib/paperSurface'

// A project's own live 3D model, rendered directly inside the main scene
// (Scene.tsx) rather than in a separate DOM-composited <Canvas> — this is
// what lets its hover highlight be a true per-pixel silhouette dither via
// the SAME shared post-processing shader every other card's glow already
// uses (see PostProcessing.tsx's bigModelSilhouetteDist), instead of an
// approximation. Two approximations were tried and found lacking first: a
// rectangular quad-corner halo (this isn't a rectangle) and a hand-rolled
// SVG dithered drop-shadow (right shape, visibly worse dither quality).
//
// Position/size/rotation are driven entirely by bigProjectSlotStore, which
// ContentPanel.tsx publishes every frame from an invisible DOM spacer's live
// rect — deliberately NOT reimplementing that CSS layout's formulas here
// (silhouette-based column centering, the card-width formula, the -20%
// breakout inset), since the DOM/CSS stays the single source of truth, same
// as every other cross-boundary store in this codebase.
// Match the cards’ fade while the padded hit target provides immediate detection.
const HOVER_SMOOTH = 0.14
const HIT_PADDING_PX = 20
const skipMeshRaycast: THREE.Mesh['raycast'] = () => {}

interface InSceneProjectModelProps {
  onPrepared?: () => void
  index: number
  src: string
  baseRotationYDeg?: number // fixed yaw added on top of the cursor-tilt rotation — see projectsContent.ts
  sizeBoost?: number // multiplies the fitted scale — see the `scale` comment below for why this, not rotation, is the actual "make it bigger" lever
}

export default function InSceneProjectModel({ index, src, baseRotationYDeg = 0, sizeBoost = 1, onPrepared }: InSceneProjectModelProps) {
  const paperNormal = useMemo(() => src.includes('verified-magazine') ? createPaperNormal() : null, [src])
  useEffect(() => () => paperNormal?.dispose(), [paperNormal])
  const { scene: source } = useGLTF(src, '/draco/')
  const [screenMap, labelMap] = useTexture(src.includes('surfthespike') ? ['/models/surf-phone-screen.jpg', '/generated/surf-can-label-8c79184d109a.webp'] : [])
  const [canRoughness, popperNormal, flashNormal, canNormal] = useTexture(src.includes('surfthespike') ? ['/models/surf-can-roughness.png', '/models/surf-popper-normal.png', '/models/surf-flash-normal.png', '/models/surf-can-metal-normal.png'] : [])
  const sheenMaps = useTexture(src.includes('duolingo') ? Object.values(duoSheen).map(entry => entry.src) : [])
  const scene = useMemo(() => {
    for (const map of [screenMap, labelMap]) {
      if (!map) continue
      map.flipY = false
      map.colorSpace = THREE.SRGBColorSpace
      map.needsUpdate = true
    }
    for (const map of [canRoughness, popperNormal, flashNormal, canNormal, ...sheenMaps]) {
      if (!map) continue
      map.flipY = false
      map.colorSpace = THREE.NoColorSpace
      map.needsUpdate = true
    }
    const model = source.clone(true)
    if (src.includes('surfthespike')) {
      // Only these two objects belong to the source Blender "assets" scene.
      // The former export also pulled objects from unrelated scenes.
      for (const child of [...model.children]) {
        if (!['Google_Pixel_9_Pro_XL003', 'Google Pixel 9 Pro XL.003', 'Can'].includes(child.name)) model.remove(child)
      }
      const can = model.getObjectByName('Can')
      if (can) can.position.x = 0
    }
    model.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return
      // One padded hit volume owns interaction; detailed triangles only render.
      obj.raycast = skipMeshRaycast
      obj.layers.set(1)
      obj.castShadow = true
      obj.receiveShadow = true
      obj.userData.projectMaskId = (index + 1) / 16
      const tune = (original: THREE.Material) => {
        const mat = original.clone() as THREE.MeshPhysicalMaterial
        // Keep the exported normal map, normal strength, tangents, and
        // roughness map. Lighting changes must not flatten the surface.
        if (mat.normalMap) mat.normalMap.colorSpace = THREE.NoColorSpace
        mat.envMapIntensity = 0.04
        if (src.includes('duolingo')) {
          const mapIndex = Object.keys(duoSheen).indexOf(obj.name)
          if (mapIndex >= 0) {
            mat.sheenRoughnessMap = sheenMaps[mapIndex]
            mat.sheenRoughness = 1 // multiply by the baked linear alpha channel
          }
        }
        if (src.includes('back-in-smoothly-monitor') && mat.name.includes('moulded housing')) {
          mat.roughness = .65
          mat.metalness = .03
        }
        if (src.includes('back-in-smoothly-monitor') && mat.name.includes('LCD')) {
          // An LCD supplies its own image light; full diffuse studio light
          // on top of that would bleach the yellow campaign artwork.
          mat.color.setRGB(.035, .035, .035)
          mat.emissiveIntensity = 1.1
          mat.roughness = .18
          mat.specularIntensity = .12
          mat.clearcoat = .025
        }
        if (src.includes('pick-a-side-fries') && mat.name.includes('textured red card')) {
          // Preserve the baked grain at small preview sizes and avoid the
          // broad glossy stripe masking that normal response.
          mat.normalScale.set(2, 2)
          mat.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <roughnessmap_fragment>',
              '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.65);'
            )
          }
          mat.customProgramCacheKey = () => 'pick-a-side-paper-grain-v1'
        }
        if (src.includes('verified-magazine')) {
          // Fine paper relief beneath the existing glossy coating; leave
          // the artwork and authored roughness variations untouched.
          if (paperNormal && !mat.normalMap) {
            mat.normalMap = paperNormal
            mat.normalScale.set(.2, .2)
          }
          // Bright diffuse paper without the environment reflection veiling
          // the printed artwork at grazing cursor angles.
          mat.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <lights_fragment_maps>',
              '#include <lights_fragment_maps>\nradiance *= 0.25;'
            )
          }
          mat.customProgramCacheKey = () => 'verified-paper-reflections-v1'
        }
        if (src.includes('surfthespike')) {
          const authored = surfMaterialValues[mat.name]
          if (authored) {
            mat.map = null
            mat.color.setRGB(...authored.color)
            mat.metalness = authored.metalness
            mat.roughness = authored.roughness
          }
          if (mat.name === 'silver 1.001') mat.normalMap = popperNormal
          if (mat.name === 'silver 1') mat.normalMap = canNormal
          if (mat.name === 'GP9XL_Flash.001') {
            mat.normalMap = flashNormal
            mat.map = null
            mat.color.setRGB(0.8, 0.8, 0.8)
          }
          if (mat.name === 'Label') {
            mat.map = labelMap
            mat.color.set(0xffffff)
            // Printed aluminium, adapted to the web studio while retaining
            // the source fingerprint roughness and metal normal detail.
            mat.metalness = .78
            mat.roughness = 1
            mat.roughnessMap = canRoughness
            // A little ink diffusion and a satin floor keep the printed
            // aluminium readable outside the studio's narrow bright strips.
            // Remapping (not clamping) retains every fingerprint variation.
            mat.onBeforeCompile = shader => {
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <roughnessmap_fragment>',
                '#include <roughnessmap_fragment>\nroughnessFactor = 0.16 + 0.74 * roughnessFactor;'
              )
            }
            mat.customProgramCacheKey = () => 'surf-printed-aluminium-v2'
          } else if (mat.name.startsWith('GP9XL_Screen')) {
            mat.map = screenMap
            mat.emissiveMap = screenMap
            mat.emissive.set(0xffffff)
            mat.emissiveIntensity = 1.5
            mat.metalness = 0
            mat.roughness = 0.01
            mat.roughnessMap = null
            mat.color.set(0xffffff)
          }
          return mat
        }
        // The popsicle's authored sheen and coating supply its frozen finish.
        // Keep those GLB values instead of applying the generic subdued finish.
        if (!src.includes('duolingo')) {
          if ('sheen' in mat) mat.sheen = 0.06
          if ('clearcoat' in mat) mat.clearcoat = Math.min(mat.clearcoat, 0.22)
        }
        return mat
      }
      obj.material = Array.isArray(obj.material) ? obj.material.map(tune) : tune(obj.material)
    })
    return model
  }, [source, src, index, screenMap, labelMap, canRoughness, popperNormal, flashNormal, canNormal, paperNormal, sheenMaps])
  const { camera, size, raycaster, scene: renderScene, gl } = useThree()
  useEffect(() => {
    if (!src.includes('duolingo') && !src.includes('surfthespike') && !src.includes('verified-') && !src.includes('pick-a-side-fries') && !src.includes('back-in-smoothly-monitor')) return
    scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      materials.forEach(material => {
        const mat = material as THREE.MeshStandardMaterial
        // With an inherited environment, Three uses scene.environmentIntensity
        // instead of material.envMapIntensity. An explicit map makes this
        // model's reflection/fill control effective without changing Twix.
        mat.envMap = renderScene.environment
        // The magazine's white paper needs the same studio environment as
        // Twix's footballs; the old patch's 0.2 fill made it look grey.
        mat.envMapIntensity = src.includes('verified-') ? 1 : src.includes('duolingo') ? 0.16 : mat.name === 'Label' ? 0.65 : 0.45
        if (src.includes('surfthespike')) {
          mat.envMapIntensity = mat.name === 'Label' || mat.name.startsWith('silver') ? 1 : 0.45
          // Turn the studio's broad softbox toward the aluminium rather
          // than reflecting its unlit wall down the visible side of the can.
          if (mat.name === 'Label' || mat.name.startsWith('silver')) mat.envMapRotation.y = 0
        }
        if (src.includes('pick-a-side-fries')) mat.envMapIntensity = mat.name.startsWith('Material.010') ? 1 : 0.65
        if (src.includes('back-in-smoothly-monitor')) mat.envMapIntensity = mat.name.includes('LCD') ? .12 : .7
        mat.needsUpdate = true
      })
    })
  }, [scene, renderScene, src])
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !location.search.includes('materialAudit') || !src.includes('duolingo')) return
    const auditWindow = window as unknown as { __duoAudit?: { model: THREE.Group; renderScene: THREE.Scene } }
    auditWindow.__duoAudit = { model: scene, renderScene }
    return () => { delete auditWindow.__duoAudit }
  }, [scene, renderScene, src])

  const outerRef = useRef<THREE.Group>(null)
  const innerRef = useRef<THREE.Group>(null)
  const hitTargetRef = useRef<THREE.Mesh>(null)
  useEffect(() => () => {
    const materials = new Set<THREE.Material>()
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    })
    materials.forEach(material => material.dispose())
  }, [scene])

  const warmFrames = useRef(0)
  useEffect(() => {
    startupWarmup.projects.add(index)
    return () => { startupWarmup.projects.delete(index) }
  }, [index])

  const fitRadius = useRef<number | null>(null)
  const fitSize = useRef(new THREE.Vector3())
  const fitArea = useRef(1)
  const hoverProgress = useRef(0)
  const hovered = useRef(false)

  // Bumps the mask-pass mesh cache to rescan the scene now that this model's
  // meshes exist — PostProcessing.tsx's cache is otherwise built once on the
  // very first frame and never rebuilt (sceneVersion is read but was never
  // incremented anywhere in this codebase before this), so a model loading
  // asynchronously behind its own Suspense would silently never get the
  // flat-black mask material and could leak false accent-recoloring.
  useEffect(() => {
    camera.layers.enable(1)
    raycaster.layers.enable(1)
    scene.traverse(obj => {
      if (obj instanceof THREE.Mesh) obj.userData.projectMaskId = (index + 1) / 16
    })
    accentStore.sceneVersion++
    return () => {
      accentStore.sceneVersion++
      delete bigProjectGlowStore.entries[index]
      if (bigProjectGlowStore.activeIndex === index) bigProjectGlowStore.activeIndex = null
    }
  }, [scene, index, camera, raycaster])

  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hovered.current = true
    bigProjectGlowStore.activeIndex = index
    gl.domElement.style.cursor = 'pointer'
  }
  const onPointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hovered.current = false
    if (bigProjectGlowStore.activeIndex === index) {
      bigProjectGlowStore.activeIndex = null
      gl.domElement.style.cursor = 'grab'
    }
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const slot = bigProjectSlotStore[index]
    if (slot) bigProjectExpandStore.onExpand?.(index, slot)
  }

  useFrame((_, delta) => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    if (fitRadius.current === null) {
      // Box3().setFromObject measures in WORLD space, via outer's current
      // matrixWorld — which on this first real measurement still reflects
      // the scale-0 hidden state from every preceding frame (the !slot
      // branch above forces outer.scale to 0, and matrixWorld isn't
      // recomputed until after all useFrame callbacks run). Force it to an
      // identity scale for the measurement; it's overwritten below anyway.
      outer.scale.setScalar(1)
      outer.updateMatrixWorld(true)
      // Fit only the artwork; invisible interaction geometry must not affect its size.
      const box = new THREE.Box3().setFromObject(scene)
      const sphere = box.getBoundingSphere(new THREE.Sphere())
      fitRadius.current = Math.max(sphere.radius, 0.0001)
      box.getSize(fitSize.current)
      const metadata = (modelFit as Record<string, { coverage: number }>)[src]
      fitArea.current = Math.max((metadata?.coverage ?? 1) * fitSize.current.x * fitSize.current.y, .0001)

    }

    if (warmFrames.current < 3) {
      // Sub-pixel, not display size: the first render still runs the full GPU
      // program compile + texture upload (what actually costs hundreds of ms),
      // but nothing shows — so these warm frames are safe to run after Behold
      // has already lifted, while models 2..N warm in the background. The fit
      // math above is measured independently at scale 1 and is unaffected.
      outer.scale.setScalar(1e-4 / fitRadius.current!)
      outer.updateMatrixWorld(true)
      if (++warmFrames.current === 3) {
        startupWarmup.projects.delete(index)
        onPrepared?.()
      } else return
    }

    const slot = bigProjectSlotStore[index]
    const inProjectsZone = zoneTransitionStore.displayedZone === 0
    if (!slot || !inProjectsZone || zoneTransitionStore.projectsOpacity <= .0001) {
      outer.scale.setScalar(0)
      hovered.current = false
      hoverProgress.current = 0
      if (bigProjectGlowStore.activeIndex === index) {
        bigProjectGlowStore.activeIndex = null
        gl.domElement.style.cursor = 'grab'
      }
      bigProjectGlowStore.entries[index] = null
      bigProjectFootprintStore.entries[index] = null
      return
    }


    const cx = slot.left + slot.width / 2
    const cy = slot.top + slot.height / 2
    const pos = screenToWorld(cx, cy, 0, camera as THREE.PerspectiveCamera, size.width, size.height)
    const targetSize = cssSizeToWorld(slot.width, slot.height, 0, camera as THREE.PerspectiveCamera, size.width, size.height)
    // Equal visible area, with width/height safety limits for narrow props.
    // Cache the neutral footprint so pointer tilt never pumps the scale.
    // NOTE: this is computed from fitArea/fitSize, which are measured ONCE
    // on the model's first frame at its default (unrotated) pose (see
    // fitRadius.current === null above) and then cached — baseRotationYDeg/
    // slot.tiltYDeg only ever change inner's rotation afterward, never
    // re-trigger this measurement. Rotating a model changes which silhouette
    // it shows at this scale, not the scale itself — sizeBoost below is the
    // actual "make it bigger" lever.
    const scale = Math.min(
      Math.sqrt(targetSize.width * targetSize.height * (src.includes('verified-magazine') || src.includes('back-in-smoothly-monitor') ? .62 : .48) / fitArea.current),
      targetSize.width / fitSize.current.x,
      targetSize.height * 1.30 / fitSize.current.y,
    ) * sizeBoost

    outer.position.copy(pos)
    // A zero local tilt is not front-facing away from the viewport centre:
    // the perspective camera sees the model from the side. Aim the neutral
    // parent frame at the camera, then apply cursor-relative tilt inside it.
    outer.lookAt(camera.position)
    // The DOM slot already inherits the section's directional drift and
    // camera-pull scale. Fade in the compositor, never grow from a point.
    outer.scale.setScalar(scale)
    // Padding stays twenty CSS pixels at every viewport/quality tier.
    const padding = HIT_PADDING_PX * targetSize.width / Math.max(slot.width * scale, .0001)
    hitTargetRef.current?.scale.set(fitSize.current.x + padding * 2, fitSize.current.y + padding * 2, fitSize.current.z + padding * 2)

    inner.rotation.y = THREE.MathUtils.degToRad(baseRotationYDeg + slot.tiltYDeg)
    inner.rotation.x = THREE.MathUtils.degToRad(-slot.tiltXDeg) // negated — visually confirmed correct (cursor below → bows down, cursor above → tilts back)
    // Screen-plane roll — see the rollDeg comment in bigProjectSlotStore.ts
    // for why this (not tiltYDeg) is what actually reads as "rotated" for a
    // flat/small object. Applied on `inner`, after outer.lookAt above, so it
    // rolls around the view axis the camera is already looking down.
    inner.rotation.z = THREE.MathUtils.degToRad(slot.rollDeg ?? 0)

    // Keep a conservative sphere for hover broad-phase bounds only. Actual
    // outline pixels still come from the rendered per-object silhouette.
    const worldDiameter = fitRadius.current * 2 * scale
    const { width: cssDiameter } = worldSizeToCssSize(worldDiameter, worldDiameter, 0, camera as THREE.PerspectiveCamera, size.width, size.height)
    const radius = cssDiameter / 2
    bigProjectFootprintStore.entries[index] = { screenCx: cx, screenCy: cy, radius }

    const f = 1 - Math.pow(1 - HOVER_SMOOTH, Math.min(delta, 0.1) * 60)
    hoverProgress.current += ((hovered.current ? 1 : 0) - hoverProgress.current) * f
    if (hoverProgress.current > 0.001) {
      bigProjectGlowStore.entries[index] = {
        screenCx: cx,
        screenCy: cy,
        radius,
        opacity: hoverProgress.current,
      }
    } else {
      bigProjectGlowStore.entries[index] = null
    }
  })

  return (
    <group ref={outerRef}>
      <group ref={innerRef} onPointerOver={onPointerOver} onPointerOut={onPointerOut} onClick={onClick}>
        {/* Invisible geometry participates in raycasting, never in beauty/mask/shadow rendering. */}
        <mesh ref={hitTargetRef} visible={false} userData={{ projectHitTarget: index }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial />
        </mesh>
        <Center>
          <primitive object={scene} />
        </Center>
      </group>
    </group>
  )
}
