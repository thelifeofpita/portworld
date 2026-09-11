/** A logical clock outlives decoders and preview/detail URL changes. */
type Clock = { at: number; position: number }
type Entry = { video: HTMLVideoElement; id: string; active: boolean; duration?: number; sync: () => void }
const clocks = new Map<string, Clock>()
const entries = new Set<Entry>()
const now = () => performance.now() / 1000
function position(id: string, duration: number) {
  let clock = clocks.get(id)
  if (!clock) { clock = { at: now(), position: 0 }; clocks.set(id, clock) }
  return (clock.position + now() - clock.at) % duration
}
function sync(entry: Entry) {
  const { video, id } = entry
  if (!entry.active || document.hidden) { video.pause(); return }
  const duration = video.duration || entry.duration
  if (duration && Number.isFinite(duration) && video.readyState >= 1) {
    const target = position(id, duration)
    if (video.paused || Math.abs(video.currentTime - target) > .25) video.currentTime = target
  }
  video.muted = true
  void video.play().catch(() => {})
}
function syncAll() { for (const entry of entries) sync(entry) }
export function initializeMediaClock(id: string) {
  if (!clocks.has(id)) clocks.set(id, { at: now(), position: 0 })
}
export function registerMedia(video: HTMLVideoElement, id: string, active: boolean, duration?: number) {
  initializeMediaClock(id)
  const entry: Entry = {video, id, active, duration, sync: () => sync(entry)}
  entries.add(entry)
  if (entries.size === 1) {
    document.addEventListener('visibilitychange', syncAll)
    document.addEventListener('pointerdown', syncAll)
  }
  video.addEventListener('loadedmetadata', entry.sync)
  video.addEventListener('canplay', entry.sync)
  sync(entry)
  return {
    setActive(value: boolean) { if (entry.active !== value) { entry.active = value; sync(entry) } },
    dispose() {
      video.pause(); entries.delete(entry)
      video.removeEventListener('loadedmetadata', entry.sync); video.removeEventListener('canplay', entry.sync)
      if (!entries.size) { document.removeEventListener('visibilitychange', syncAll); document.removeEventListener('pointerdown', syncAll) }
    },
  }
}
