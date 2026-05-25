import type { Zone } from '@/types'

// Model.tsx registers snapToZone here on mount so ZoneNav (a DOM sibling,
// outside the Canvas) can trigger snapping without any prop drilling.
// activeZone is null until the model finishes loading and detects a zone.
export const zoneStore: {
  snapToZone: ((zone: Zone) => void) | null
  activeZone: Zone | null
} = {
  snapToZone: null,
  activeZone: null,
}
