'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

// A looping, muted case-study clip that only downloads once it is near the
// viewport and only decodes while it is actually on screen — the same gating
// CampaignLoop uses, minus the shared media clock (these clips have no second
// instance to stay in step with). Autoplaying every clip on mount kept all of a
// case page's videos decoding while scrolled out of view, which dropped long
// pages such as Back in smoothly and Pick a side to single-digit frame rates.
export default function LazyLoopVideo({ src, poster, className, style, width, height, 'aria-label': ariaLabel }: {
  src: string
  poster?: string
  className?: string
  style?: CSSProperties
  width?: number
  height?: number
  'aria-label'?: string
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    // React does not reflect `muted` onto the element reliably, and a play()
    // call is only allowed without a gesture when the element really is muted.
    video.muted = true
    let visible = false
    const play = () => { if (visible) void video.play().catch(() => {}) }
    const prepare = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNear(true); prepare.disconnect() }
    }, { rootMargin: '600px' })
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) play()
      else video.pause()
    })
    prepare.observe(video)
    visibility.observe(video)
    video.addEventListener('loadeddata', play)
    return () => {
      prepare.disconnect()
      visibility.disconnect()
      video.removeEventListener('loadeddata', play)
    }
  }, [])

  return (
    <video ref={ref} src={near ? src : undefined} poster={poster} className={className} style={style}
      width={width} height={height} loop muted playsInline disablePictureInPicture
      preload={near ? 'auto' : 'none'} aria-label={ariaLabel} />
  )
}
