'use client'

// Background-prefetches whatever the initial "Behold" warm-up phase doesn't
// already cover, so tapping open ANY project or playground item — later,
// once the user is actually browsing — very rarely shows content popping in.
//
// PlaygroundGallery.tsx's own warm-up already eagerly decodes each grid
// card's first two preview pieces before releasing the loader (see its
// `warming`-gated Preview/onDecoded logic) — that part already works. What's
// missing is everything BEYOND those first two pieces (an opened item's
// extra photos/videos) and the six custom-layout projects' own photos, none
// of which start fetching until their detail actually mounts. This module
// primes the browser's HTTP cache for all of that, at low priority, once the
// loader has already lifted — so it never competes with first paint.
import { playgroundContent } from '@/content/playgroundContent'
import { pieces } from '@/lib/playgroundMedia'
import { projectsContent } from '@/content/projectsContent'
import campaignMedia from '@/content/campaign-page-media.json'
import backInSmoothlyMedia from '@/content/back-in-smoothly-media.json'
import duolingoLoops from '@/content/duolingo-loops.json'
import { SURF_THE_SPIKE_IMAGES, PICK_A_SIDE_IMAGES, BACK_IN_SMOOTHLY_IMAGES } from '@/lib/projectImageLists'

function primeImage(src: string) {
  const img = new Image()
  img.decoding = 'async'
  img.src = src
}

// Every playground media source beyond what PlaygroundGallery's own warm-up
// already decoded. Must mirror Preview's onDecoded gate EXACTLY
// (`indices.slice(0, 2)`, not the whole previewIndices array) — an item like
// Cooler Venus (`previewIndices:[0,1,2,3]`) only actually warms positions
// 0-1 today; 2-3 still need prefetching here.
function remainingPlaygroundMedia(): string[] {
  const out: string[] = []
  for (const item of playgroundContent) {
    const all = pieces(item)
    const indices = item.previewIndices ?? all.map((_, i) => i)
    const warmed = new Set(indices.slice(0, 2))
    all.forEach((piece, i) => {
      if (warmed.has(i)) return
      // Full video bytes are disproportionate for a "reduce pop-in" nicety —
      // the poster frame is what actually shows before playback starts.
      out.push(piece.type === 'video' ? (piece.poster ?? piece.src) : piece.src)
    })
  }
  return out
}

// Every project detail image not already warmed by the 3D thumbnail's own
// warm-up (Scene.tsx's preparedProjects/InSceneProjectModel machinery, which
// only covers the GLB model itself, not these 2D case-study photos).
// Cast the same way PlaygroundGallery.tsx casts media-manifest.json — these
// are auto-generated manifests, only the fields actually read here matter.
const campaign        = campaignMedia as Record<string, { src: string }>
const backInSmoothly  = backInSmoothlyMedia as Record<string, { src: string }>
const duoLoops        = duolingoLoops as Record<string, { poster: string }>

function remainingProjectMedia(): string[] {
  const manifestSrcs = [
    ...Object.values(campaign).map(a => a.src),
    ...Object.values(backInSmoothly).map(a => a.src),
  ]
  const posterSrcs = Object.values(duoLoops).map(c => c.poster)
  const genericSrcs = projectsContent.flatMap(p => p.images)
  return [
    ...manifestSrcs,
    ...posterSrcs,
    ...genericSrcs,
    ...SURF_THE_SPIKE_IMAGES,
    ...PICK_A_SIDE_IMAGES,
    ...BACK_IN_SMOOTHLY_IMAGES,
  ]
}

let started = false

/** Call once, after the initial reveal (`warming` going false) — idempotent. */
export function startMobileWarmup() {
  if (started) return
  started = true
  // Projects first — opening a project is the more common first interaction
  // right after landing, so its photos should win the race to finish warming.
  const queue = [...remainingProjectMedia(), ...remainingPlaygroundMedia()]
  // Fired in modest chunks via setTimeout, NOT requestIdleCallback — this
  // site's 3D canvas runs a continuous 60fps render loop (Scene.tsx), so the
  // main thread is rarely genuinely "idle" the way requestIdleCallback
  // expects. That meant warming could take the better part of a minute
  // (repeatedly falling through to its 2s timeout) — long enough that
  // tapping a project shortly after landing still showed content popping
  // in, which is exactly what this exists to prevent. Fetching/decoding an
  // <img> is mostly off-main-thread work (network + async decode) anyway,
  // so there's little reason to throttle beyond a light stagger that keeps
  // the very first chunk of real requests (whatever the user does right
  // after landing) from queuing behind one giant burst.
  const CHUNK = 8
  let i = 0
  const step = () => {
    const end = Math.min(i + CHUNK, queue.length)
    for (; i < end; i++) primeImage(queue[i])
    if (i < queue.length) setTimeout(step, 60)
  }
  step()
}
