'use client'

import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { rotStore } from '@/lib/rotationStore'
import { accentStore } from '@/lib/accentStore'
import { posStore } from '@/lib/posStore'
import { silhouetteStore } from '@/lib/silhouetteStore'
import { zoneStore } from '@/lib/zoneStore'
import { modelScrollStore } from '@/lib/modelScrollStore'
import type { Zone } from '@/types'

// ── Accent meshes & zone mapping ──────────────────────────────────────────────
const ACCENT_MESH_NAMES = ['rightFoot', 'leftHand', 'head']

const ACCENT_ZONE: Record<string, Zone> = {
  leftHand:  0, // Projects
  rightFoot: 1, // About & Contact
  head:      2, // Playground
}

useGLTF.preload('/models/modelSeparated.glb')

const CHROME_MATERIAL = new THREE.MeshStandardMaterial({
  metalness: 1,
  roughness: 0.2,
  color: new THREE.Color(0xd4d4d4),
  envMapIntensity: 2.5,
})

const DRAG_SENSITIVITY = 0.008
const SLERP_DRAG = 0.1
const SLERP_SNAP = 0.04
const RAD2DEG = 180 / Math.PI

// ── Pre-allocated scratch objects — never re-created, safe because JS is single-threaded ──
const _v3a   = new THREE.Vector3()
const _v3b   = new THREE.Vector3()
const _euler = new THREE.Euler()
const _box3  = new THREE.Box3()
const _qa    = new THREE.Quaternion()
const _qb    = new THREE.Quaternion()
const _qc    = new THREE.Quaternion()

interface ModelProps {
  onZoneChange: (zone: Zone) => void
  onZoneReset?: () => void
  onAsciiToggle?: () => void
  yOffset?: number
}

export default function Model({ onZoneChange, onZoneReset, onAsciiToggle, yOffset = 0 }: ModelProps) {
  const { scene } = useGLTF('/models/modelSeparated.glb')
  const groupRef = useRef<THREE.Group>(null)
  const { gl, camera } = useThree()
  const cameraRef = useRef(camera)

  // Quaternion rotation — no gimbal lock, POV-aware
  const currentQuat = useRef(new THREE.Quaternion())
  const targetQuat = useRef(new THREE.Quaternion())

  // Maps zone → accent mesh (for material swap) and rest-frame world position
  // (stored at load time when currentQuat = identity, used for snap math)
  const accentMeshMap  = useRef<Map<Zone, THREE.Mesh>>(new Map())
  const accentRestPos  = useRef<Map<Zone, THREE.Vector3>>(new Map())

  const isDragging    = useRef(false)
  const isSnapping    = useRef(false)
  const lastX         = useRef(0)
  const lastY         = useRef(0)
  const dragMoved     = useRef(false)
  const activeZone    = useRef<Zone | -1>(-1)
  const meshesReady   = useRef(false)
  const hasInteracted = useRef(false)

  // Keep camera ref in sync without re-creating callbacks
  useEffect(() => {
    cameraRef.current = camera
  }, [camera])

  // Compute bounding box center (for pivot) + sampled vertex positions + normals (for silhouette).
  // Both arrays are in group-local centered space (scene-world pos/dir + centerOffset/normalMatrix),
  // so applying currentQuat to any entry gives its current world-space value.
  const { centerOffset, samplePts, sampleNormals } = useMemo(() => {
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const c = new THREE.Vector3()
    box.getCenter(c)
    c.negate() // centerOffset = -bbox_center

    // Sample actual vertex positions AND normals — normals let us cull back-facing
    // vertices per-frame (much more accurate than a z-position threshold).
    const MAX_SAMPLES = 2048
    const positions: number[] = []
    const normals: number[] = []
    const _vt = new THREE.Vector3()
    const _nt = new THREE.Vector3()
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const geo = child.geometry
      const attr    = geo.attributes.position
      const normAttr = geo.attributes.normal
      if (!attr) return
      // Normal matrix = inverse transpose of world matrix (handles non-uniform scale).
      const normalMatrix = normAttr
        ? new THREE.Matrix3().getNormalMatrix(child.matrixWorld)
        : null
      // Sample ~80 vertices per mesh uniformly to stay within budget
      const stride = Math.max(1, Math.floor(attr.count / 80))
      for (let i = 0; i < attr.count && positions.length < MAX_SAMPLES * 3; i += stride) {
        _vt.fromBufferAttribute(attr, i).applyMatrix4(child.matrixWorld).add(c)
        positions.push(_vt.x, _vt.y, _vt.z)
        if (normAttr && normalMatrix) {
          _nt.fromBufferAttribute(normAttr, i).applyMatrix3(normalMatrix).normalize()
          normals.push(_nt.x, _nt.y, _nt.z)
        } else {
          // No normals in geometry — fall back to position direction as crude proxy
          normals.push(_vt.x, _vt.y, _vt.z)
        }
      }
    })

    return {
      centerOffset: [c.x, c.y, c.z] as [number, number, number],
      samplePts:     new Float32Array(positions),
      sampleNormals: new Float32Array(normals),
    }
  }, [scene])

  // Apply chrome material and register accent meshes (material swap only here).
  // Rest positions are computed in useFrame once the scene graph is fully set up.
  useEffect(() => {
    accentStore.meshes = []
    accentMeshMap.current.clear()
    accentRestPos.current.clear()
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.material = CHROME_MATERIAL
      child.castShadow = true
      if (!ACCENT_MESH_NAMES.includes(child.name)) return
      accentStore.meshes.push(child)
      const zone = ACCENT_ZONE[child.name]
      if (zone !== undefined) accentMeshMap.current.set(zone, child)
    })
  }, [scene])

  const onPointerDown = useCallback((e: PointerEvent) => {
    if (e.button !== 0) return  // only left-click starts a drag
    isDragging.current = true
    isSnapping.current = false
    dragMoved.current  = false
    lastX.current = e.clientX
    lastY.current = e.clientY
    gl.domElement.style.cursor = 'grabbing'
  }, [gl])

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastX.current
    const dy = e.clientY - lastY.current
    lastX.current = e.clientX
    lastY.current = e.clientY
    if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved.current = true

    // Rotate around camera-space axes so drag direction matches what you see
    _v3b.setFromMatrixColumn(cameraRef.current.matrix, 1) // up
    _v3a.setFromMatrixColumn(cameraRef.current.matrix, 0) // right
    _qa.setFromAxisAngle(_v3b, dx * DRAG_SENSITIVITY)
    _qb.setFromAxisAngle(_v3a, dy * DRAG_SENSITIVITY)
    targetQuat.current.premultiply(_qa).premultiply(_qb)
  }, [])

  // Snap so the given zone's mesh faces the camera, preserving current roll.
  const snapToZone = useCallback((zone: Zone) => {
    const restPos = accentRestPos.current.get(zone)
    if (!restPos) return
    const len = restPos.length()
    if (len <= 0.01) return

    _v3a.copy(restPos).divideScalar(len)             // restDir
    _qa.setFromUnitVectors(_v3a, _v3b.set(0, 0, 1)) // qMinimal

    // Preserve the current roll around the snap axis
    _qc.copy(_qa).invert()
    _qb.copy(targetQuat.current).multiply(_qc)       // qDelta
    const dLen = Math.sqrt(_qb.z * _qb.z + _qb.w * _qb.w)
    if (dLen > 0.001) {
      _qc.set(0, 0, _qb.z / dLen, _qb.w / dLen)     // qSpin
    } else {
      _qc.identity()
    }
    targetQuat.current.copy(_qc.multiply(_qa))
    isSnapping.current  = true
    hasInteracted.current = true
  }, [])

  // Expose snapToZone so ZoneNav (outside the Canvas) can call it via zoneStore
  useEffect(() => {
    zoneStore.snapToZone = snapToZone
    return () => { zoneStore.snapToZone = null }
  }, [snapToZone])

  const onPointerUp = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    gl.domElement.style.cursor = 'grab'

    // Pure click (no movement) — don't activate zones; shader/bg toggles handle that
    if (!dragMoved.current) return

    // Find which accent mesh is closest to screen center at the drag endpoint
    const cam = cameraRef.current
    let snapZone: Zone | null = null
    let bestDist = Infinity

    accentRestPos.current.forEach((restPos, zone) => {
      _v3a.copy(restPos).applyQuaternion(targetQuat.current).project(cam)
      const dist = Math.sqrt(_v3a.x * _v3a.x + _v3a.y * _v3a.y)
      if (dist < bestDist) { bestDist = dist; snapZone = zone }
    })

    if (snapZone !== null) snapToZone(snapZone as Zone)
  }, [gl, snapToZone])

  useEffect(() => {
    const el = gl.domElement
    el.style.cursor = 'grab'
    const onDragStart = (e: DragEvent) => e.preventDefault()
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('dragstart',   onDragStart)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('dragstart',   onDragStart)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [gl, onPointerDown, onPointerMove, onPointerUp])

  useFrame((_, delta) => {
    if (!groupRef.current) return

    // dt-normalise: factor tuned at 60 fps → frame-rate-independent equivalent
    const dt = Math.min(delta, 0.1) // clamp spikes (tab unfocus etc.)
    const snapFactor = 1 - Math.pow(1 - SLERP_SNAP * 2, dt * 60)
    const dragFactor = 1 - Math.pow(1 - SLERP_DRAG * 2, dt * 60)
    currentQuat.current.slerp(targetQuat.current, isSnapping.current ? snapFactor : dragFactor)
    groupRef.current.quaternion.copy(currentQuat.current)

    // Update rotation HUD
    _euler.setFromQuaternion(currentQuat.current, 'YXZ')
    rotStore.xDeg = ((_euler.x * RAD2DEG) % 360 + 360) % 360
    rotStore.yDeg = ((_euler.y * RAD2DEG) % 360 + 360) % 360

    // Compute rest positions once — bbox centers are constant in model-local space.
    // (getWorldPosition returns the pivot for all meshes; bbox center gives the
    // actual per-part location. Done here rather than useEffect because the scene
    // graph must be fully ready first.)
    if (accentRestPos.current.size < accentMeshMap.current.size) {
      _qa.copy(currentQuat.current).invert()
      accentMeshMap.current.forEach((mesh, zone) => {
        _box3.setFromObject(mesh)
        _box3.getCenter(_v3a)
        _v3a.y -= yOffset + modelScrollStore.extraWorldY  // remove full group y before unrotating → model-local position
        let pos = accentRestPos.current.get(zone)
        if (!pos) { pos = new THREE.Vector3(); accentRestPos.current.set(zone, pos) }
        pos.copy(_v3a).applyQuaternion(_qa)
      })
    }

    // Zone: which accent mesh faces the camera most directly — determined by the
    // z-component of the rotated rest-position in model-local space. This is purely
    // rotation-dependent so scroll translation never causes a spurious zone change.
    let closestZone: Zone = activeZone.current === -1 ? 0 : activeZone.current
    let bestZ = -Infinity
    accentRestPos.current.forEach((restPos, zone) => {
      _v3a.copy(restPos).applyQuaternion(currentQuat.current)
      if (_v3a.z > bestZ) { bestZ = _v3a.z; closestZone = zone }
      // Publish CSS-pixel position for ZoneNav lines (needs full world position)
      _v3a.y += yOffset + modelScrollStore.extraWorldY
      _v3a.project(camera)
      posStore[zone].x = (_v3a.x + 1) / 2 * window.innerWidth
      posStore[zone].y = (1 - _v3a.y) / 2 * window.innerHeight
    })
    // Mark meshes as ready the first frame all rest positions are populated.
    if (!meshesReady.current &&
        accentMeshMap.current.size > 0 &&
        accentRestPos.current.size >= accentMeshMap.current.size) {
      meshesReady.current = true
    }

    const ready = meshesReady.current && hasInteracted.current

    accentStore.focused  = ready ? (accentMeshMap.current.get(closestZone) ?? null) : null
    zoneStore.activeZone = ready ? closestZone : null

    // Fire onZoneChange only after first interaction, and on every subsequent zone switch.
    if (ready && closestZone !== activeZone.current) {
      activeZone.current = closestZone
      onZoneChange(closestZone)
    }

    // Publish silhouette — project front-facing sampled vertices for a tight boundary.
    // _v3a and _v3b are both free here (zone loop has finished using them).
    // Use vertex normals to cull back-facing samples: a vertex whose normal points
    // away from the camera contributes nothing to the visible outline.
    {
      silhouetteStore.cx = window.innerWidth  / 2
      silhouetteStore.cy = window.innerHeight / 2
      const pts = silhouetteStore.pts
      let count = 0
      const nSamples = samplePts.length / 3
      for (let i = 0; i < nSamples && count < pts.length / 2; i++) {
        // Transform vertex normal by current rotation; skip if back-facing.
        // Threshold -0.1 keeps silhouette-edge vertices (normal ⊥ view) in the set.
        _v3a.set(sampleNormals[i * 3], sampleNormals[i * 3 + 1], sampleNormals[i * 3 + 2])
          .applyQuaternion(currentQuat.current)
        if (_v3a.z < -0.1) continue
        // Transform position and project to CSS pixels.
        _v3b.set(samplePts[i * 3], samplePts[i * 3 + 1], samplePts[i * 3 + 2])
          .applyQuaternion(currentQuat.current)
        _v3b.project(camera)
        pts[count * 2    ] = (_v3b.x + 1) / 2 * window.innerWidth
        pts[count * 2 + 1] = (1 - _v3b.y) / 2 * window.innerHeight
        count++
      }
      silhouetteStore.count = count
    }
  })

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (dragMoved.current) return
    const zone = ACCENT_ZONE[e.object.name]
    if (zone !== undefined) {
      snapToZone(zone)
    } else {
      onAsciiToggle?.()
    }
  }, [onAsciiToggle, snapToZone])

  const handleContextMenu = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.nativeEvent.preventDefault()
    e.stopPropagation()
    // Reset to neutral: identity quaternion = model looking straight ahead
    targetQuat.current.identity()
    isSnapping.current  = true
    hasInteracted.current = false
    activeZone.current  = -1
    onZoneReset?.()
  }, [onZoneReset])

  return (
    <group ref={groupRef} onClick={handleClick} onContextMenu={handleContextMenu}>
      {/* Inner group offsets the mesh so its bounding box center sits at origin */}
      <group position={centerOffset}>
        <primitive object={scene} />
      </group>
    </group>
  )
}
