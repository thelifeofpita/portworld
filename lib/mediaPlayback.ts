/** A logical clock outlives decoders and preview/detail URL changes. */
type Clock = { at: number; position: number }
type Entry = { video: HTMLVideoElement; id: string; active: boolean; duration?: number; sync: () => void; lastSeekAt: number }
const clocks = new Map<string, Clock>()
const entries = new Set<Entry>()
const now = () => performance.now() / 1000
function position(id: string, duration: number) {
  let clock = clocks.get(id)
  if (!clock) { clock = { at: now(), position: 0 }; clocks.set(id, clock) }
  return (clock.position + now() - clock.at) % duration
}
function canSeekTo(video: HTMLVideoElement, time: number) {
  const ranges = video.seekable
  for (let i = 0; i < ranges.length; i++) if (time >= ranges.start(i) && time <= ranges.end(i)) return true
  return false
}
// A seek re-fires canplay, which runs sync again. When the media cannot land
// where it was sent (not seekable yet, or a host without byte-range support)
// currentTime stays put, the drift check fails again, and the clip re-seeks on
// every canplay: hundreds of seeks a second across the gallery, saturating the
// decoder threads. So only seek to a reachable time, and at most once per
// SEEK_BACKOFF_S per clip (a piece resumes far less often than that).
const SEEK_BACKOFF_S = .5
function sync(entry: Entry) {
  const { video, id } = entry
  if (!entry.active || document.hidden) { video.pause(); return }
  const duration = video.duration || entry.duration
  if (duration && Number.isFinite(duration) && video.readyState >= 1) {
    const target = position(id, duration)
    if ((video.paused || Math.abs(video.currentTime - target) > .25) && canSeekTo(video, target) && now() - entry.lastSeekAt >= SEEK_BACKOFF_S) {
      entry.lastSeekAt = now()
      video.currentTime = target
    }
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
  const entry: Entry = {video, id, active, duration, sync: () => sync(entry), lastSeekAt: -Infinity}
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
