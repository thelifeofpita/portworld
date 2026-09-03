import BackInSmoothlyDetail from './BackInSmoothly'
import SurfTheSpikeDetail from './SurfTheSpike'

// Projects whose entry sets `customLayout` (content/projectsContent.ts) render
// one of these bespoke full-page case studies instead of the generic carousel
// detail view. Each component takes { onPrev, onNext, onClose }.
//
// Add a page: build the component, add it here, and widen the `customLayout`
// union in content/projectsContent.ts — ContentPanel.tsx (desktop) and
// MobilePage.tsx (mobile) both resolve against this map, so nothing else
// needs to change.
export const CUSTOM_LAYOUTS = {
  backInSmoothly: BackInSmoothlyDetail,
  surfTheSpike:   SurfTheSpikeDetail,
} as const

export type CustomLayoutKey = keyof typeof CUSTOM_LAYOUTS
