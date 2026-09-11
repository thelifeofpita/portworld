'use client'

import { useEffect, useRef, useState } from 'react'
import { registerMedia } from '@/lib/mediaPlayback'
import loops from '@/content/duolingo-loops.json'
import styles from './CampaignCase.module.css'

export default function CampaignLoop({ id }: { id: keyof typeof loops }) {
  const clip=loops[id]
  const ref=useRef<HTMLVideoElement>(null)
  const [near,setNear]=useState(false)
  const [visible,setVisible]=useState(false)

  useEffect(()=>{
    const video=ref.current
    if(!video) return
    const prepare=new IntersectionObserver(([entry])=>{
      if(entry.isIntersecting){setNear(true);prepare.disconnect()}
    },{rootMargin:'240px'})
    const visibility=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:0.05})
    prepare.observe(video);visibility.observe(video)
    return ()=>{prepare.disconnect();visibility.disconnect()}
  },[])

  useEffect(()=>{
    const video=ref.current
    if(!video || !near) return
    const controller=registerMedia(video,`duolingo-case-${id}`,visible,clip.duration)
    return ()=>controller.dispose()
  },[id,near,visible,clip.duration])

  return <div className={styles.loop}>
    <video ref={ref} src={near ? clip.src : undefined} poster={clip.poster}
      width={clip.width} height={clip.height} loop muted playsInline controls={false} disablePictureInPicture preload="none"
      aria-label={clip.label} />
  </div>
}
