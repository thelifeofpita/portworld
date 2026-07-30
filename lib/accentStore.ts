import * as THREE from 'three'

// Meshes whose shader ink renders in the accent colour.
// Populated by Model once the GLTF loads; read by PostProcessing each frame.
// `focused` is the currently active zone mesh — rendered in the focus colour.
export const accentStore: { meshes: THREE.Mesh[], focused: THREE.Mesh | null, sceneVersion: number } = {
  meshes:  [],
  focused: null,
  // Bumped whenever meshes are added/removed from the scene outside of the
  // initial GLTF load (e.g. ProjectCards3D mounting) — PostProcessing's mesh
  // cache re-scans the scene when this changes instead of caching forever.
  sceneVersion: 0,
}
