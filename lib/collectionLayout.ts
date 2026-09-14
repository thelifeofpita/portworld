import { fitCollection } from './fitCollection'
import type { MasonryRect } from './fitMasonry'

// Collection layouts come from an exhaustive packing search that took ~500ms
// on the main thread for the larger collections, freezing the page as a
// collection opened. The result depends only on the pieces' aspect ratios and
// the stage size, so it is cached by those and computed in a worker; a browser
// that cannot start the worker falls back to computing it here.
type Job = { key: string; ratios: number[]; width: number; height: number; resolve: (rects: MasonryRect[]) => void }
const cache = new Map<string, MasonryRect[]>()
const inflight = new Map<string, Promise<MasonryRect[]>>()
const waiting = new Map<number, Job>()
let worker: Worker | null | undefined
let nextId = 0

const keyOf = (ratios: number[], width: number, height: number) => `${width}x${height}:${ratios.join(',')}`

function settle(key: string, rects: MasonryRect[], resolve: (rects: MasonryRect[]) => void) {
  cache.set(key, rects)
  inflight.delete(key)
  resolve(rects)
}

function startWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    // Prebuilt plain-JS worker (scripts/build-layout-worker.mjs): Turbopack
    // copies a new URL('./x.ts') worker target verbatim instead of compiling it.
    worker = new Worker('/workers/collection-layout.js')
    worker.onmessage = (event: MessageEvent<{ id: number; rects: MasonryRect[] }>) => {
      const job = waiting.get(event.data.id)
      if (!job) return
      waiting.delete(event.data.id)
      settle(job.key, event.data.rects, job.resolve)
    }
    worker.onerror = () => {
      worker?.terminate()
      worker = null
      for (const [id, job] of waiting) {
        waiting.delete(id)
        settle(job.key, fitCollection(job.ratios, job.width, job.height), job.resolve)
      }
    }
  } catch {
    worker = null
  }
  return worker
}

export function cachedCollectionLayout(ratios: number[], width: number, height: number): MasonryRect[] | undefined {
  return cache.get(keyOf(ratios, width, height))
}

export function requestCollectionLayout(ratios: number[], width: number, height: number): Promise<MasonryRect[]> {
  const key = keyOf(ratios, width, height)
  const cached = cache.get(key)
  if (cached) return Promise.resolve(cached)
  const pending = inflight.get(key)
  if (pending) return pending
  const promise = new Promise<MasonryRect[]>(resolve => {
    const target = startWorker()
    if (!target) { settle(key, fitCollection(ratios, width, height), resolve); return }
    const id = ++nextId
    waiting.set(id, { key, ratios, width, height, resolve })
    target.postMessage({ id, ratios, width, height })
  })
  inflight.set(key, promise)
  return promise
}
