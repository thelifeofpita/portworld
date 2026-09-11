import * as THREE from 'three'

// Closed-form CSS-px <-> world-space conversion, valid ONLY for this app's
// camera invariant: a PerspectiveCamera fixed at (0,0,z) with identity
// rotation, always facing the world origin along -Z (Scene.tsx's <Canvas>
// never sets a `rotation` in its camera prop, so R3F's one-time
// lookAt(0,0,0) call produces the identity quaternion; CameraZoom only ever
// mutates position.z afterward). Same assumption Model.tsx's own
// .project(camera) calls and ScrollingGroup's halfH computation already
// depend on — do not reuse if the camera ever gains X/Y translation or its
// own rotation.

export function screenToWorld(
  pxCss: number,
  pyCss: number,
  targetZ: number,
  camera: THREE.PerspectiveCamera,
  viewportW: number,
  viewportH: number,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const ndcX = (pxCss / viewportW) * 2 - 1
  const ndcY = 1 - (pyCss / viewportH) * 2
  const tanV = Math.tan((camera.fov * Math.PI / 180) / 2)
  const tanH = tanV * (viewportW / viewportH)
  const dist = camera.position.z - targetZ
  return out.set(ndcX * tanH * dist, ndcY * tanV * dist, targetZ)
}

// CSS px width/height -> world-space width/height at the same target Z plane.
export function cssSizeToWorld(
  wCss: number,
  hCss: number,
  targetZ: number,
  camera: THREE.PerspectiveCamera,
  viewportW: number,
  viewportH: number,
): { width: number; height: number } {
  const tanV = Math.tan((camera.fov * Math.PI / 180) / 2)
  const tanH = tanV * (viewportW / viewportH)
  const dist = camera.position.z - targetZ
  return {
    width: wCss * (2 * tanH * dist) / viewportW,
    height: hCss * (2 * tanV * dist) / viewportH,
  }
}

// Inverse of cssSizeToWorld — world-space width/height at the target Z plane
// -> CSS px on screen. Used to find a model's REAL on-screen footprint from
// its own world-space bounding-sphere radius, rather than assuming it matches
// the nominal DOM slot rect it was fit to — a tall/narrow model fit-by-width
// (or fit-by-height) to a differently-proportioned slot can visibly overflow
// that slot's own bounds, so code that gates effects (glow reach, texture
// passthrough) to "this model's own area" needs the true projected size, not
// the slot's.
export function worldSizeToCssSize(
  wWorld: number,
  hWorld: number,
  targetZ: number,
  camera: THREE.PerspectiveCamera,
  viewportW: number,
  viewportH: number,
): { width: number; height: number } {
  const tanV = Math.tan((camera.fov * Math.PI / 180) / 2)
  const tanH = tanV * (viewportW / viewportH)
  const dist = camera.position.z - targetZ
  return {
    width: wWorld * viewportW / (2 * tanH * dist),
    height: hWorld * viewportH / (2 * tanV * dist),
  }
}
