import * as THREE from 'three'

// Meshes whose shader ink renders in the accent colour.
// Populated by Model once the GLTF loads; read by PostProcessing each frame.
// `focused` is the currently active zone mesh — rendered in the focus colour.
export const accentStore: { meshes: THREE.Mesh[], focused: THREE.Mesh | null } = {
  meshes:  [],
  focused: null,
}
