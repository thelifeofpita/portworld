'use client'

import { useEffect, useRef, useState } from 'react'
import { pickPalette } from '@/lib/paletteSource'
import { subscribeLoadProgress } from '@/lib/loadProgressStore'
import { motion, AnimatePresence } from 'framer-motion'
import styles from './Loader.module.css'

interface LoaderProps {
  visible: boolean
}

export default function Loader({ visible }: LoaderProps) {
  const ref = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(visible)

  // The sweep tracks what the gate is actually waiting on rather than running a
  // fixed-duration animation. Held just short of full while the gate is still
  // closed — arriving at 100% and then sitting there reads as a hang — and
  // released to 100% as the screen begins to fade, so it always completes.
  useEffect(() => {
    const fill = fillRef.current
    if (!fill) return
    if (!visible) { fill.style.width = '100%'; return }
    return subscribeLoadProgress(progress => {
      fill.style.width = `${Math.min(progress, 0.95) * 100}%`
    })
  }, [visible, shown])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let timer: ReturnType<typeof setTimeout>
    let cancelled = false
    const reset = () => {
      el.style.removeProperty('--bg-color')
      el.style.removeProperty('--fg-color')
      el.style.removeProperty('--accent-base-color')
    }
    if (!visible) {
      // Land on the inherited, server-selected theme before revealing the scene.
      el.style.setProperty('--palette-step', reducedMotion ? '0ms' : '50ms')
      reset()
      timer = setTimeout(() => setShown(false), reducedMotion ? 0 : 70)
    } else if (!reducedMotion) {
      let step = 0
      const cycle = async () => {
        const palette = await pickPalette()
        if (cancelled) return
        // A rapid opening burst, then increasingly distinct pauses between palettes:
        // 40, 60, 90, 135, 203, 304, 456, 683, 1025, 1100ms.
        const interval = Math.min(1100, 40 * 1.5 ** step++)
        el.style.setProperty('--palette-step', '50ms')
        el.style.setProperty('--bg-color', palette.white)
        el.style.setProperty('--fg-color', palette.black)
        el.style.setProperty('--accent-base-color', palette.red)
        timer = setTimeout(cycle, interval)
      }
      void cycle()
    }
    return () => { cancelled = true; clearTimeout(timer); reset() }
  }, [visible])

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          ref={ref}
          className={styles.loader}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          aria-label="Loading"
          role="status"
        >
          <div className={styles.textWrap}>
            {/* Base layer — unfilled colour */}
            <span className={styles.textBase}>Behold.</span>
            {/* Fill layer — clips from left to right */}
            <span ref={fillRef} className={styles.textFill} aria-hidden="true">Behold.</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
