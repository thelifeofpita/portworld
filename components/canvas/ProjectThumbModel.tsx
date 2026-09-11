'use client'

import { Suspense, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Center, Environment, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// Slowly spins the model and, once (on first frame after mount), points the
// camera back far enough to frame its bounding sphere — so any model dropped
// in here fills the card regardless of its own export scale.
function SpinningModel({ src }: { src: string }) {
  const { scene } = useGLTF(src)
  const spinRef = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const fitted = useRef(false)

  useFrame((_, delta) => {
    if (!spinRef.current) return
    spinRef.current.rotation.y += delta * 0.5

    if (!fitted.current) {
      fitted.current = true
      const box = new THREE.Box3().setFromObject(spinRef.current)
      const sphere = box.getBoundingSphere(new THREE.Sphere())
      const cam = camera as THREE.PerspectiveCamera
      const dist = sphere.radius / Math.sin((cam.fov * Math.PI / 180) / 2)
      cam.position.set(0, 0, dist * 1.35)
      cam.near = Math.max(0.01, dist * 0.05)
      cam.far = dist * 10
      cam.updateProjectionMatrix()
    }
  })

  return (
    <group ref={spinRef}>
      <Center>
        <primitive object={scene} />
      </Center>
    </group>
  )
}

interface ProjectThumbModelProps {
  src: string
}

// Drop-in replacement for a project card's flat thumbnail image — a small,
// self-contained R3F canvas rendering a live-rotating .glb. Pointer events are
// disabled so it stays purely decorative and never fights the card's own
// drag/tap handling (see ProjectCard in ContentPanel.tsx — currently dead
// there since every project now has a bigModel, but kept as the fallback for
// a project that doesn't). Mobile Projects renders real in-scene models
// instead (see MobilePage.tsx's MobileProjectSlot + InSceneProjectModel),
// not this — that path needs the full studio lighting/materials this small
// generic-lit canvas doesn't have.
export default function ProjectThumbModel({ src }: ProjectThumbModelProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 30 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.5]}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      onCreated={({ gl }) => {
        // A lost context here must not throw or freeze the tab — this card
        // simply reverts to nothing visible, unlike the main Scene canvas
        // which reloads the page to recover.
        gl.domElement.addEventListener('webglcontextlost', e => e.preventDefault())
      }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 4]} intensity={1.1} />
      <directionalLight position={[-4, 2, -4]} intensity={0.35} />
      <Suspense fallback={null}>
        <Environment files="/env/studio_small_03_1k.hdr" />
        <SpinningModel src={src} />
      </Suspense>
    </Canvas>
  )
}
