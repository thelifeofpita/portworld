import type { Zone } from '@/types'

// Target orientations for each zone (in degrees)
export const ZONE_TARGETS: Record<Zone, { xDeg: number; yDeg: number }> = {
  0: { xDeg: 355, yDeg: 290 }, // Projects
  1: { xDeg: 320, yDeg: 40  }, // About & Contact
  2: { xDeg: 5,   yDeg: 50  }, // Playground
}

// Minimum circular distance between two angles (0–360)
function angularDist(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

// Returns whichever zone target is closest to the current X/Y rotation
export function getZone(xDeg: number, yDeg: number): Zone {
  let bestZone: Zone = 0
  let bestDist = Infinity

  for (const [key, target] of Object.entries(ZONE_TARGETS)) {
    const dx = angularDist(xDeg, target.xDeg)
    const dy = angularDist(yDeg, target.yDeg)
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < bestDist) {
      bestDist = dist
      bestZone = Number(key) as Zone
    }
  }

  return bestZone
}
