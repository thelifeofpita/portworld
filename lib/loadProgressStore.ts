// Real loading progress for the "Behold." screen's fill sweep.
//
// The fill used to be a fixed 2.6s CSS animation with nothing behind it. That was
// fine when the gate took much longer than 2.6s (the sweep simply finished and
// waited), but once the gated payload dropped from ~30MB to a few MB the sweep
// became the slower of the two and would get cut off mid-stroke on reveal.
//
// The three signals here are exactly the three things app/page.tsx's Loader gate
// waits on, so the bar cannot claim to be further along than the site actually is.
// `projects` is desktop-only — mobile's Projects grid uses static captured images
// and never warms in-scene models — so weights are normalized over whichever
// signals have been activated rather than being fixed fractions of a whole.

export type LoadSignal = 'navigation' | 'projects' | 'playground'

// Weighted toward `playground` because it is the only fine-grained signal: 17
// cards report individually, whereas `navigation` and `projects` are effectively
// milestones (three's LoadingManager counts items, not bytes, so it cannot report
// a partial download). Giving the milestones a large share made the sweep lurch —
// it crept smoothly, then jumped nearly half the bar the instant the environment
// and model resolved. These shares keep the same ordering of events while letting
// the continuous signal carry most of the travel.
const WEIGHTS: Record<LoadSignal, number> = {
  navigation: 0.30,
  projects:   0.15,
  playground: 0.55,
}

// navigation and playground gate on every viewport; projects opts in from Scene.
const active = new Set<LoadSignal>(['navigation', 'playground'])
const fractions: Record<LoadSignal, number> = { navigation: 0, projects: 0, playground: 0 }

let reported = 0
const listeners = new Set<(progress: number) => void>()

export function activateLoadSignal(signal: LoadSignal) {
  if (active.has(signal)) return
  active.add(signal)
  recompute()
}

export function reportLoadProgress(signal: LoadSignal, fraction: number) {
  const next = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0))
  if (next === fractions[signal]) return
  fractions[signal] = next
  recompute()
}

function recompute() {
  let total = 0, weight = 0
  for (const signal of active) {
    total  += WEIGHTS[signal] * fractions[signal]
    weight += WEIGHTS[signal]
  }
  const next = weight > 0 ? total / weight : 0
  // Monotonic on purpose. Activating a signal late (Scene deciding it is on
  // desktop) or a loader re-reporting a lower fraction would otherwise make the
  // sweep visibly retreat, which reads as a stall rather than as progress.
  if (next <= reported) return
  reported = next
  for (const listener of listeners) listener(reported)
}

export function subscribeLoadProgress(listener: (progress: number) => void) {
  listeners.add(listener)
  listener(reported)
  return () => { listeners.delete(listener) }
}
