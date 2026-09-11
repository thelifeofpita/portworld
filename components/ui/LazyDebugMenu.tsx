 'use client'
import dynamic from 'next/dynamic'
const DebugMenu = dynamic(() => import('./DebugMenu'), { ssr: false })
export default function LazyDebugMenu() {
  return process.env.NODE_ENV === 'development' ? <DebugMenu /> : null
}
