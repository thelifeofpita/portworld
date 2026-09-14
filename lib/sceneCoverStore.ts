// Whether something opaque currently covers the whole 3D canvas (a desktop
// case-study page once its open animation has finished). Scene.tsx stops the
// render loop while covered: rendering the scene, its shadows and the
// full-screen post-processing behind a page nobody can see through kept the
// main thread ~75% busy and caused 60-220ms frames while scrolling case pages.
const listeners = new Set<() => void>()

export const sceneCoverStore = { covered: false }

export function setSceneCovered(covered: boolean) {
  if (sceneCoverStore.covered === covered) return
  sceneCoverStore.covered = covered
  listeners.forEach(listener => listener())
}

export function subscribeSceneCover(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
