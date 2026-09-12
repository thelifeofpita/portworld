// Single source of truth for mobile layout numbers that both the DOM page
// (MobilePage.tsx / MobilePage.module.css) and the 3D scene (Scene.tsx) have
// to agree on. These used to be declared independently in each file, which is
// exactly the kind of drift that silently breaks the model's scroll fade.

// Fraction of the viewport height the model occupies at the top of the mobile
// page. Mirrored by .mobileCanvasArea's `height: 45vh` in MobilePage.module.css
// — that CSS value is the one thing this can't import, so keep them in step.
export const MOBILE_CANVAS_VH = 0.45

// Whether a full-screen mobile overlay (a project case study) is currently
// covering the page. Scene.tsx's ScrollingGroup reads this to hide the model
// outright: while an overlay is up the document doesn't scroll, so the
// scroll-driven fade below can't be trusted to have carried the model away.
// Plain mutable object read per-frame, same pattern as modelScrollStore.
export const mobileOverlayStore = { open: false }
