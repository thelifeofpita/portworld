// The site's one established "ease out" curve — previously duplicated
// verbatim as MobilePage.tsx's EASE_OUT and ContentPanel.tsx's PANEL_EXIT.
// Individual call sites still own their own duration (0.25s/0.3s differ by
// context); this only centralizes the shared cubic-bezier shape.
export const EASE_OUT = [0.22, 1, 0.36, 1] as const
