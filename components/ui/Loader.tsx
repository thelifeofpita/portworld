'use client'

import { useEffect, useRef, useState } from 'react'
import { pickPalette } from '@/lib/paletteSource'
import { motion, AnimatePresence } from 'framer-motion'
import styles from './Loader.module.css'

interface LoaderProps {
  visible: boolean
}

export default function Loader({ visible }: LoaderProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(visible)
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
          transition={{ duration: 0.6, ease: 'easeOut' }}
          aria-label="Loading"
          role="status"
        >
          <div className={styles.textWrap}>
            {/* Base layer — unfilled colour */}
            <span className={styles.textBase}>Behold.</span>
            {/* Fill layer — clips from left to right */}
            <span className={styles.textFill} aria-hidden="true">Behold.</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
