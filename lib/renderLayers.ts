// three.js object layers used by the composited render in PostProcessing.tsx.
//  0: the navigation model and its lights (default layer)
//  1: in-scene project models and their key/fill/rim rig (InSceneProjectModel)
//  2: the accent/ID mask pass: every mesh, plus exactly the navigation lights.
//
// three.js bumps its light-state version whenever a pass sees a different
// number of lights than the pass before it, and every lit material then
// rebuilds its program parameters and cache key. The three passes used to see
// 2, 3 and 5 directional lights, so that happened three times per frame for
// every material. Giving the navigation pass a zero-intensity balancing light
// and the mask pass exactly the navigation lights makes all three identical
// (3 directional, 1 shadow), so the version never moves.
export const MASK_LAYER = 2
