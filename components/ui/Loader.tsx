'use client'

import { motion, AnimatePresence } from 'framer-motion'
import styles from './Loader.module.css'

interface LoaderProps {
  visible: boolean
}

export default function Loader({ visible }: LoaderProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
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
