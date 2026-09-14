import { fitCollection } from './fitCollection'

// Runs the exhaustive collection packing search (see fitCollection.ts) off the
// main thread. Same function, same inputs, so the layout is identical; only
// the thread it blocks changes.
self.onmessage = (event: MessageEvent<{ id: number; ratios: number[]; width: number; height: number }>) => {
  const { id, ratios, width, height } = event.data
  self.postMessage({ id, rects: fitCollection(ratios, width, height) })
}
