'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { bgStore } from '@/lib/bgStore'
import { fgStore } from '@/lib/fgStore'
import { accentStore } from '@/lib/accentStore'
import { cardGlowStore } from '@/lib/cardGlowStore'
import { playgroundGlowStore } from '@/lib/playgroundGlowStore'
import { zoneTransitionStore } from '@/lib/zoneTransitionStore'
import { debugStore, hexToRgb01 } from '@/lib/debugStore'

// Matches cardGlowStore's fixed 6-slot entries array (one per project card).
const MAX_GLOW_CARDS = 6
// Matches playgroundGlowStore's small dynamic-pool size (see that file).
const MAX_PLAYGROUND_GLOW = 4

// ─── ASCII atlas ──────────────────────────────────────────────────────────────

const ASCII_CHARS = ' .\'`-,:;!|i1tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'
const ATLAS_CELL  = 64 // px per character cell — high-res for crisp sampling

async function buildAsciiAtlas(): Promise<THREE.CanvasTexture> {
  // Load Heming before drawing so canvas uses it
  const face = new FontFace('Heming', 'url(/fonts/HemingVariable.woff2) format("woff2"), url(/fonts/HemingVariable.ttf) format("truetype")')
  await face.load()
  document.fonts.add(face)

  const n      = ASCII_CHARS.length
  const canvas = document.createElement('canvas')
  canvas.width  = n * ATLAS_CELL
  canvas.height = ATLAS_CELL
  const ctx     = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle    = '#fff'
  ctx.font         = `${Math.round(ATLAS_CELL * 1.2)}px Heming`
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ASCII_CHARS.split('').forEach((ch, i) => {
    ctx.fillText(ch, i * ATLAS_CELL + ATLAS_CELL / 2, ATLAS_CELL / 2)
  })
  const tex        = new THREE.CanvasTexture(canvas)
  tex.minFilter    = THREE.LinearFilter
  tex.magFilter    = THREE.LinearFilter
  return tex
}

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAG = /* glsl */`
uniform sampler2D uScene;
uniform sampler2D uAsciiAtlas;
// R/G = weighted accent (model hand/foot/head): unfocused/focused blend.
// A = ~0 normal, or ~1 empty background (forced by Three's Color-background
//     clear) — both treated as "no special mode" below.
uniform sampler2D uAccentMask;
uniform vec2      uResolution;
uniform float     uCharCount;
uniform float     uTransition; // 0=1-bit  1=ASCII  2=halftone  (3=wrap back to 1-bit)
uniform vec3      uBgColor;    // debug-configurable background color (was: white/black only)
uniform vec3      uInkColor;   // debug-configurable ink/foreground color
uniform vec3      uAccentBase;  // unfocused accent — debug-configurable, default #F20C1F
uniform vec3      uAccentFocus; // focused accent   — debug-configurable, default #F2DF0C
uniform float     uDpr;        // device pixel ratio — normalises gl_FragCoord to CSS px
// Outer card glow — live tilted QUADS (CSS px, DOM top-left origin, 4 corners
// per card: top-left/top-right/bottom-right/bottom-left) + accent colors,
// published by ContentPanel.tsx's ProjectCard via cardGlowStore (DOM
// measurement, including reading the card's own rotateX/rotateY, can't happen
// inside the R3F render loop). Corners rather than an axis-aligned rect so the
// glow hugs the card's actual tilted shape — a rotated rectangle's bounding
// box is visibly bigger than the rectangle itself once rotateX/rotateY are
// nonzero, which read as the glow floating in a box around the card instead
// of hugging it. uCardActive gates entries the store currently has nothing
// published for (fewer than 6 cards mounted, or a card mid-close) — an
// all-zero quad would otherwise glow around screen-space (0,0).
uniform vec2      uCardP0[6]; // top-left
uniform vec2      uCardP1[6]; // top-right
uniform vec2      uCardP2[6]; // bottom-right
uniform vec2      uCardP3[6]; // bottom-left
uniform vec3      uCardColor[6];        // rest-state color (the project's own accent/brand color)
uniform vec3      uCardHoverColor[6];   // color the glow wipes toward on hover (sitewide focus accent)
uniform float     uCardHoverProgress[6]; // 0..1, smoothed by ContentPanel.tsx — drives the wipe below
uniform float     uCardActive[6];
uniform float     uGlowOpacity; // 0..1 — whole glow layer's fade, follows the Projects zone blend
// Playground cards' hover-only glow — see playgroundGlowStore.ts. No rest
// color / no wipe: the glow simply doesn't exist until hovered, so its own
// opacity (0..1, smoothed) doubles as the density multiplier that fades it
// in/out — reusing the same "density drives the per-mode dither pattern"
// mechanism as everything else instead of a separate crossfade. A small
// dynamic pool (MAX_PLAYGROUND_GLOW slots) rather than one slot per item,
// since Playground can have far more items than fit a fixed per-item array.
uniform vec2      uPgCardP0[4];
uniform vec2      uPgCardP1[4];
uniform vec2      uPgCardP2[4];
uniform vec2      uPgCardP3[4];
uniform float     uPgCardOpacity[4];
uniform float     uPgCardActive[4];
uniform vec3      uPgGlowColor;    // single shared color — sitewide focus accent, same as Projects' hover color
uniform float     uPgGlowOpacity;  // 0..1 — whole layer's fade, follows the Playground zone blend

const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const float GLOW_RADIUS    = 14.0; // CSS px — outer glow falloff distance from a card's own edge (Projects) — matches Playground/About's size
const float PG_GLOW_RADIUS = 14.0; // CSS px — same, Playground's hover-only glow
// Density is capped below 1.0 even right at the card's own edge (dist=0) —
// pinning it to a true 1.0 there left a visibly flat, fully-inked band
// before the falloff curve really started to read as fading (smoothstep is
// nearly flat near its own 0/1 ends), reported as "a space where it's 100%
// ink." Remapping the whole curve into [0, GLOW_PEAK_DENSITY] keeps the
// glow's total reach at GLOW_RADIUS (still 0 exactly there) while making
// the densest point visibly grainy/dithered instead of solid.
const float GLOW_PEAK_DENSITY = 0.5;

// Halftone dot radius = density * hcs * GLOW_HALFTONE_SCALE. The main model's
// own halftone pass (below) reaches hdens=1.0 and uses a 0.55 scale, so its
// dots grow to ~2.2px — most of a 4px cell — at full density, giving real
// size gradation from chunky to nothing. The glow's density is capped at
// GLOW_PEAK_DENSITY (0.5, see above) for the 1-bit/ASCII coverage look, but
// reusing that same low ceiling for the halftone dot radius (with the old
// 0.6 scale) topped dots out at ~1.2px — small enough, relative to the 0.6px
// AA feather on each dot's own edge, that they never read as visibly
// different sizes; the only thing that visibly changed with distance was how
// many cells had a dot at all, which looks like an opacity fade, not a
// halftone (reported: "the dots aren't different sizes... just fade out with
// opacity"). Scaled up so density=GLOW_PEAK_DENSITY still reaches ~2.2px —
// matching the main pass's own max dot size — while density's own falloff
// curve (unchanged) still carries the radius smoothly down to 0.
const float GLOW_HALFTONE_SCALE = 1.1;

// Three.js renders this app's scene into an offscreen WebGLRenderTarget (not
// the default framebuffer), which always uses LinearSRGBColorSpace for its
// output encoding — i.e. no linear->sRGB re-encode ever happens for anything
// drawn into it (confirmed against three's WebGLPrograms.js: outputColorSpace
// is only renderer.outputColorSpace when currentRenderTarget === null).
// Meanwhile THREE.Color (built from a hex/CSS string, e.g. a card's material
// color) IS automatically sRGB-decoded to linear by ColorManagement — with no
// corresponding re-encode anywhere downstream, that decode is a one-way trip:
// measured empirically, a plain #806040 fill rendered out as (55,30,13), an
// exact match for a double sRGB decode. Everything else in this shader (the
// 1-bit/ASCII/halftone dithering) never shows this because thresholding a
// value against a background is invariant under any monotonic tone curve —
// it only becomes visible where uScene's raw luminance is compared directly
// against bgColorCorrected/inkColorCorrected below. This function is the
// missing re-encode, applied only at that read.
vec3 linearToSRGB(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, step(c, vec3(0.0031308)));
}

vec3 accentInk(vec2 uv, vec3 baseInk, float scale) {
  vec4  mask       = texture2D(uAccentMask, uv);
  float total      = mask.r + mask.g;
  float isWeighted = step(0.01, total) * scale;
  float focusRatio = mask.g / max(total, 0.001); // 0=unfocused, 1=focused
  vec3  weightedColor = mix(uAccentBase, uAccentFocus, focusRatio);
  return mix(baseInk, weightedColor, isWeighted);
}

float bayer4(vec2 pos) {
  int x = int(mod(pos.x, 4.0));
  int y = int(mod(pos.y, 4.0));
  int i = y * 4 + x;
  if (i ==  0) return  0.0; if (i ==  1) return  8.0;
  if (i ==  2) return  2.0; if (i ==  3) return 10.0;
  if (i ==  4) return 12.0; if (i ==  5) return  4.0;
  if (i ==  6) return 14.0; if (i ==  7) return  6.0;
  if (i ==  8) return  3.0; if (i ==  9) return 11.0;
  if (i == 10) return  1.0; if (i == 11) return  9.0;
  if (i == 12) return 15.0; if (i == 13) return  7.0;
  if (i == 14) return 13.0;
  return 5.0;
}

// Distance from p to the segment (a,b) — used by quadExteriorDist below to
// build a proper polygon SDF (not just an axis-aligned box one) for the
// outer-glow pass, since a tilted card's screen quad is a general
// (non-axis-aligned) convex quadrilateral, not a rect.
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Distance from p to the nearest point on the convex quad a-b-c-d (0.0 if p
// is inside it) — a-b-c-d must be wound consistently (all CW or all CCW),
// which projectCardCorners() in cardGlowStore.ts guarantees since it applies
// the identical transform to all 4 corners of a rectangle. Near a corner, the
// nearest point on the two adjacent edges naturally lands on that corner's
// vertex (segDist's h clamps to 0 or 1), giving the outer glow's falloff a
// pleasant rounded-corner shape instead of a boxy one.
float quadExteriorDist(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
  float dist = min(min(segDist(p, a, b), segDist(p, b, c)), min(segDist(p, c, d), segDist(p, d, a)));
  float s1 = sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  float s2 = sign((c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x));
  float s3 = sign((d.x - c.x) * (p.y - c.y) - (d.y - c.y) * (p.x - c.x));
  float s4 = sign((a.x - d.x) * (p.y - d.y) - (a.y - d.y) * (p.x - d.x));
  float inside = step(0.0, s1 * s2) * step(0.0, s2 * s3) * step(0.0, s3 * s4);
  return mix(dist, 0.0, inside);
}

// Cheap 2D->1D pseudo-random hash, stable across frames for a given cell
// coordinate (pure function of input, no seeding) — used by the hover
// color-wipe below to reveal cells in random order rather than bayer4's
// fixed ordered pattern.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Flips a coord-space point (gl_FragCoord/uDpr, bottom-up) into DOM-space
// (top-down, matching getBoundingClientRect()) — same flip as domCoord
// below, factored out so per-cell centers can be converted too.
vec2 toDomSpace(vec2 p) {
  return vec2(p.x, uResolution.y - p.y);
}

// Renders one project card's outer glow ring — a live tilted quad hugging
// the card's actual on-screen shape, colored by the project's own brand
// color at rest and wiping to the sitewide hover accent on hover (see the
// memory note on why the wipe is a random per-cell reveal, not radial or a
// smooth blend). Takes explicit per-card values (not array-indexed) — see
// main()'s 6 unrolled calls below, one literal index each.
vec3 renderProjectCard(
  vec3 base, vec2 p0, vec2 p1, vec2 p2, vec2 p3,
  vec3 cardColor, vec3 hoverColor, float hoverProgress, float isActive,
  vec2 coord, vec2 bp1, vec2 bp8, vec2 hbp, vec2 hctr, vec2 bf, float bayerBlock,
  float hcs, float t, vec2 cellCenter1, vec2 cellCenter8, vec2 cellCenterH
) {
  if (isActive < 0.5) return base;

  float dist1 = quadExteriorDist(cellCenter1, p0, p1, p2, p3);
  float density1 = GLOW_PEAK_DENSITY * (1.0 - smoothstep(0.0, GLOW_RADIUS, dist1));
  float glowBayer1 = (bayer4(bp1) + 0.5) / 16.0;
  float glowOneBit = step(glowBayer1, density1);

  float dist8 = quadExteriorDist(cellCenter8, p0, p1, p2, p3);
  float density8 = GLOW_PEAK_DENSITY * (1.0 - smoothstep(0.0, GLOW_RADIUS, dist8));
  float glowNoiseWeight = smoothstep(0.02, 0.08, density8);
  float glowIdx     = density8 * (uCharCount - 1.0) + (bayerBlock - 0.5) * 5.0 * glowNoiseWeight;
  float glowCharIdx = floor(clamp(glowIdx, 0.0, uCharCount - 1.0));
  float glowAtlasU  = (glowCharIdx + bf.x) / uCharCount;
  float glowAscii   = texture2D(uAsciiAtlas, vec2(glowAtlasU, bf.y)).r;

  float distH = quadExteriorDist(cellCenterH, p0, p1, p2, p3);
  float densityH = GLOW_PEAK_DENSITY * (1.0 - smoothstep(0.0, GLOW_RADIUS, distH));
  float glowRadiusPx = densityH * hcs * GLOW_HALFTONE_SCALE;
  float glowHalftone = 1.0 - smoothstep(glowRadiusPx - 0.6, glowRadiusPx + 0.6, length(coord - hctr));

  float glowMask;
  if (t <= 1.0)      glowMask = mix(glowOneBit, glowAscii, t);
  else if (t <= 2.0) glowMask = mix(glowAscii, glowHalftone, t - 1.0);
  else               glowMask = mix(glowHalftone, glowOneBit, t - 2.0);

  float wipeOneBit   = step(hash21(bp1), hoverProgress);
  float wipeAscii    = step(hash21(bp8), hoverProgress);
  float wipeHalftone = step(hash21(hbp), hoverProgress);
  float wipeMask;
  if (t <= 1.0)      wipeMask = mix(wipeOneBit, wipeAscii, t);
  else if (t <= 2.0) wipeMask = mix(wipeAscii, wipeHalftone, t - 1.0);
  else               wipeMask = mix(wipeHalftone, wipeOneBit, t - 2.0);
  vec3 glowColor = mix(cardColor, hoverColor, wipeMask);

  return mix(base, glowColor, glowMask * uGlowOpacity);
}

void main() {
  // Normalise to CSS pixels so block sizes are DPR-independent
  vec2 coord = gl_FragCoord.xy / uDpr;

  // uBgColor/uInkColor come from THREE.Color objects (bgStore/fgStore,
  // written by Scene.tsx's BackgroundSync) — THREE's ColorManagement
  // auto-decodes sRGB->linear the moment those are .set() from a hex
  // string, same mechanism as gotcha #4 above (linearToSRGB's own comment).
  // uAccentBase/uAccentFocus don't have this problem — they're built via
  // hexToRgb01() (a plain /255 normalize, no THREE.Color involved) — which
  // is exactly why accent-colored pixels (the model's hand/foot/head
  // hotspots) matched their CSS counterparts (e.g. the "PITA" byline, same
  // hex) while bg/ink-colored pixels visibly didn't: reported live as a
  // screenshot where the dithered body color was a noticeably different,
  // more saturated hue than "THELIFEOF" despite both nominally being
  // --fg-color. This shader writes gl_FragColor directly with no automatic
  // re-encode on output (same reasoning as linearToSRGB()'s own comment
  // below), so that decode is never undone — correcting once here, right
  // after the uniforms are read, keeps every downstream use (including the
  // luminance-threshold math, which needs to match what's actually
  // displayed, not a linear-space number) consistent.
  vec3 bgColorCorrected  = linearToSRGB(uBgColor);
  vec3 inkColorCorrected = linearToSRGB(uInkColor);

  // Single scalar used for all luminance-threshold math below — the actual
  // composited colors always come from uBgColor/uInkColor (debug-configurable).
  float uBgLum = dot(bgColorCorrected, LUMA);
  // Binary light/dark read of the background, used wherever the code below
  // needs a clean 0/1 polarity flip rather than a continuous blend weight.
  // uBgLum itself is only ever exactly 0 or 1 for the site's original white/
  // black themes — for a debug-menu custom background sitting at some mid
  // luminance (e.g. a mid-tone red), using uBgLum directly as a MIX WEIGHT
  // (as this file used to) blends every ink pixel partway back toward the
  // background color instead of choosing cleanly between them, which reads
  // as "the model is just a lighter tint of the background." bgPolarity fixes
  // that by always resolving to a hard 0 or 1.
  float bgPolarity = step(0.5, uBgLum);

  // ── 1-bit (2px blocks) ────────────────────────────────────────────────────
  vec2  bp1    = floor(coord / 2.0);
  vec2  uv1    = (bp1 * 2.0 + 1.0) / uResolution;
  // uScene is the offscreen beauty-pass render target, which never gets a
  // linear->sRGB re-encode (see the comment above linearToSRGB()) — every
  // read from it needs this correction, not just the bypass photoColor path
  // below, or its luminance won't agree with bgColorCorrected/inkColorCorrected
  // (which now ARE corrected) even for a pixel that's visually just flat bg,
  // making gap1 nonzero everywhere and dithering the whole background.
  float lum1   = dot(linearToSRGB(texture2D(uScene, uv1).rgb), LUMA);
  float bayer1 = (bayer4(bp1) + 0.5) / 16.0;
  float gap1   = abs(lum1 - uBgLum);
  // Rescale the raw gap against the max gap actually achievable for this
  // background's luminance — e.g. a bg at 0.75 can never be more than 0.75
  // away from a black pixel (lum1=0), or 0.25 away from a white one (lum1=1).
  // Without this, the raw gap caps out below 1.0 for any bg that isn't pure
  // black/white (the norm now that bg is a randomized palette color, not
  // always literal white), so even a model's darkest shadow pixel could only
  // ever reach partial ink coverage — reading as visible background speckle
  // through what should be solid ink, instead of the flat dark fill you'd
  // get from a bg that WAS pure white. Dividing by the ceiling lets a pixel
  // at maximum possible contrast from bg always reach true 100% coverage.
  // Reduces to the exact original bitBg-XOR formula when uBgLum is 0 or 1
  // (the site's original white/black-only design).
  float gapCeiling1 = max(uBgLum, 1.0 - uBgLum);
  float density1    = clamp(gap1 / gapCeiling1, 0.0, 1.0);
  float isInk1 = step(bayer1, density1);
  vec3  ink1   = accentInk(uv1, inkColorCorrected, 1.0);
  vec3  oneBit = mix(bgColorCorrected, ink1, isInk1);
  // Suppress dithering for pixels that match the background colour.
  // transWeight was previously used here but only reached 1.0 at the midpoint,
  // leaving visible dots through most of the transition. Removing it is safe:
  // at stable white/black, mix(white,white,1) and mix(black,black,1) are no-ops.
  float bgProx = step(0.05, gap1);
  oneBit = mix(bgColorCorrected, oneBit, bgProx);

  // ── ASCII (8px blocks) ────────────────────────────────────────────────────
  float cs   = 8.0;
  vec2  bp8  = floor(coord / cs);
  vec2  uv8  = (bp8 * cs + cs * 0.5) / uResolution;
  float lum8 = dot(linearToSRGB(texture2D(uScene, uv8).rgb), LUMA);

  float density = abs(lum8 - uBgLum);
  float smMax   = mix(0.35, 1.0, uBgLum);
  density = smoothstep(0.01, smMax, density);

  float bayerBlock  = (bayer4(bp8) + 0.5) / 16.0;
  float noiseWeight = smoothstep(0.02, 0.08, density);
  float idx     = density * (uCharCount - 1.0) + (bayerBlock - 0.5) * 5.0 * noiseWeight;
  float charIdx = floor(clamp(idx, 0.0, uCharCount - 1.0));
  vec2  bf      = fract(coord / cs);
  float atlasU  = (charIdx + bf.x) / uCharCount;
  float ink     = texture2D(uAsciiAtlas, vec2(atlasU, bf.y)).r;
  float pixel   = mix(ink, 1.0 - ink, bgPolarity);
  float inkAmt8 = abs(pixel - bgPolarity);
  vec3  ink8    = accentInk(uv8, inkColorCorrected, 1.0);
  vec3  ascii   = mix(bgColorCorrected, ink8, inkAmt8);

  // ── Halftone (4px cells) ──────────────────────────────────────────────────
  float hcs  = 4.0;
  vec2  hbp   = floor(coord / hcs);
  vec2  hctr  = hbp * hcs + hcs * 0.5;
  float hlum  = dot(linearToSRGB(texture2D(uScene, hctr / uResolution).rgb), LUMA);
  float hdens = abs(hlum - uBgLum);
  hdens = smoothstep(0.01, mix(0.35, 1.0, uBgLum), hdens);
  float radius   = hdens * hcs * 0.55;
  float circle   = 1.0 - smoothstep(radius - 0.5, radius + 0.5, length(coord - hctr));
  float inkAmtH  = abs(mix(circle, 1.0 - circle, bgPolarity) - bgPolarity);
  vec3  inkH     = accentInk(hctr / uResolution, inkColorCorrected, 1.0);
  vec3  halftone = mix(bgColorCorrected, inkH, inkAmtH);

  // ── Blend: cycle 0→1→2 with wrap segment 2→3 = halftone→1-bit ────────────
  float t = uTransition;
  vec3  result;
  if (t <= 1.0) {
    result = mix(oneBit, ascii, t);
  } else if (t <= 2.0) {
    result = mix(ascii, halftone, t - 1.0);
  } else {
    result = mix(halftone, oneBit, t - 2.0);
  }

  // ── Project cards — outer glow ring, handled by renderProjectCard() (see
  // its own comment for why). uCardP0-3 (built from the card's actual
  // rotateX/rotateY-projected corners, see cardGlowStore.ts's
  // projectCardCorners) are in DOM-space (top-left origin, matching
  // getBoundingClientRect()) — toDomSpace() converts coord-space points into
  // that same space to compare against them. Density/distance sampled ONCE
  // per dither cell — at that cell's own center, exactly like the main
  // passes above sample uScene at uv1/uv8/hctr — not per-pixel at the raw
  // fragment position: sampling per-pixel let density drift within a single
  // cell (most visibly along a tilted card's diagonal edge), so a cell could
  // straddle the bayer/circle threshold mid-cell and render as a partial
  // sliver instead of a clean dot/glyph/circle ("pixels... getting cut so
  // they end up looking like thin rectangles"). bp1/bp8/hbp are already the
  // CELL index (constant across each cell), so converting each mode's own
  // cell center to DOM space once here and reusing it for every card fixes
  // that.
  vec2 cellCenter1 = toDomSpace(bp1 * 2.0 + 1.0);
  vec2 cellCenter8 = toDomSpace(bp8 * cs + cs * 0.5);
  vec2 cellCenterH = toDomSpace(hctr);
  for (int i = 0; i < 6; i++) {
    result = renderProjectCard(result, uCardP0[i], uCardP1[i], uCardP2[i], uCardP3[i], uCardColor[i], uCardHoverColor[i], uCardHoverProgress[i], uCardActive[i], coord, bp1, bp8, hbp, hctr, bf, bayerBlock, hcs, t, cellCenter1, cellCenter8, cellCenterH);
  }

  // ── Playground cards' hover-only glow — same quad-hugging + dithered
  // falloff technique as the Projects loop above, but with the per-card
  // opacity (uPgCardOpacity, each card's own smoothed hover progress) folded
  // directly into density instead of a color wipe — there's only one color
  // here (uPgGlowColor), so "appearing" is just density rising from 0.
  for (int i = 0; i < 4; i++) {
    if (uPgCardActive[i] < 0.5) continue;

    float pgDist1 = quadExteriorDist(cellCenter1, uPgCardP0[i], uPgCardP1[i], uPgCardP2[i], uPgCardP3[i]);
    float pgDensity1 = GLOW_PEAK_DENSITY * uPgCardOpacity[i] * (1.0 - smoothstep(0.0, PG_GLOW_RADIUS, pgDist1));
    float pgBayer1 = (bayer4(bp1) + 0.5) / 16.0;
    float pgOneBit = step(pgBayer1, pgDensity1);

    float pgDist8 = quadExteriorDist(cellCenter8, uPgCardP0[i], uPgCardP1[i], uPgCardP2[i], uPgCardP3[i]);
    float pgDensity8 = GLOW_PEAK_DENSITY * uPgCardOpacity[i] * (1.0 - smoothstep(0.0, PG_GLOW_RADIUS, pgDist8));
    float pgNoiseWeight = smoothstep(0.02, 0.08, pgDensity8);
    float pgIdx     = pgDensity8 * (uCharCount - 1.0) + (bayerBlock - 0.5) * 5.0 * pgNoiseWeight;
    float pgCharIdx = floor(clamp(pgIdx, 0.0, uCharCount - 1.0));
    float pgAtlasU  = (pgCharIdx + bf.x) / uCharCount;
    float pgAscii   = texture2D(uAsciiAtlas, vec2(pgAtlasU, bf.y)).r;

    float pgDistH = quadExteriorDist(cellCenterH, uPgCardP0[i], uPgCardP1[i], uPgCardP2[i], uPgCardP3[i]);
    float pgDensityH = GLOW_PEAK_DENSITY * uPgCardOpacity[i] * (1.0 - smoothstep(0.0, PG_GLOW_RADIUS, pgDistH));
    float pgRadius   = pgDensityH * hcs * GLOW_HALFTONE_SCALE;
    float pgHalftone = 1.0 - smoothstep(pgRadius - 0.6, pgRadius + 0.6, length(coord - hctr));

    if (max(pgDensity1, max(pgDensity8, pgDensityH)) <= 0.0) continue;

    float pgMask;
    if (t <= 1.0)      pgMask = mix(pgOneBit, pgAscii, t);
    else if (t <= 2.0) pgMask = mix(pgAscii, pgHalftone, t - 1.0);
    else               pgMask = mix(pgHalftone, pgOneBit, t - 2.0);

    result = mix(result, uPgGlowColor, pgMask * uPgGlowOpacity);
  }

  gl_FragColor = vec4(result, 1.0);
}
`

// ─── Component ────────────────────────────────────────────────────────────────

export default function PostProcessing({ mode = 0 }: { mode?: 0|1|2 }) {
  const { gl, scene, camera, size } = useThree()
  const transition  = useRef(0)
  const transTarget = useRef(0)
  const prevMode    = useRef<0|1|2>(0)
  const [atlasTexture, setAtlasTexture] = useState<THREE.CanvasTexture | null>(null)

  // ── Render targets ───────────────────────────────────────────────────────
  // Sized in CSS pixels (not physical) — the shader normalises gl_FragCoord
  // by uDpr, so block density stays consistent across DPR values.
  // target uses NearestFilter (not the Linear it had before) — every sample
  // of uScene in FRAG happens at an exact block-center/pixel coordinate
  // (uv1/uv8/hctr), never in between texels, so bilinear filtering here
  // bought nothing but a smearing/bleed radius of a texel or so around any
  // high-contrast edge.
  const { target, maskTarget } = useMemo(() => ({
    target:     new THREE.WebGLRenderTarget(size.width, size.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, stencilBuffer: false }),
    maskTarget: new THREE.WebGLRenderTarget(size.width, size.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, stencilBuffer: false }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  // Per-mesh materials: color encodes blend (R=unfocused weight, G=focused weight).
  // Created lazily in useFrame and lerped toward 0/1 each frame. Opacity is
  // pinned to 0 (the "normal" alpha band — see uAccentMask comment in FRAG)
  // so these meshes never get misread as anything other than normal.
  //
  // blending: NoBlending (with transparent left false) is required for `opacity`
  // to actually reach the written alpha channel: Three's WebGLPrograms marks a
  // material "opaque" — which hardcodes the shader's output alpha to 1.0 — when
  // transparent===false AND blending===NormalBlending (the default pairing).
  // Explicitly setting NoBlending breaks that pairing (so opacity survives into
  // alpha) while keeping transparent:false, so the GPU still does a plain
  // overwrite instead of actually blending this color against the black mask
  // clear (which would premultiply the RGB by opacity — corrupting the color
  // these pixels are meant to carry as data, not visible translucency).
  const accentMats   = useRef<Map<THREE.Mesh, { mat: THREE.MeshBasicMaterial; blend: number }>>(new Map())
  const maskBlackMat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending }), [])
  // Pre-allocated black background for mask renders — prevents scene.background
  // (which lerps during bg transitions) from leaking into the mask clear color.
  const maskBg       = useMemo(() => new THREE.Color(0, 0, 0), [])

  // Scene mesh cache — populated on first rendered frame and re-scanned whenever
  // accentStore.sceneVersion changes, avoiding a traverse() every single frame
  // while still staying correct when meshes are added after the initial GLTF load.
  const sceneMeshes    = useRef<THREE.Mesh[]>([])
  const origMats       = useRef<Array<THREE.Material | THREE.Material[]>>([])
  const meshesScanned  = useRef(false)
  const scannedVersion = useRef(-1)

  const { quadScene, quadCamera, material } = useMemo(() => {
    // Blank 1×1 placeholder until the real atlas loads
    const placeholder = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    placeholder.needsUpdate = true

    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const material   = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        uScene:      { value: null },
        uAsciiAtlas: { value: placeholder },
        uAccentMask: { value: null },
        uResolution: { value: new THREE.Vector2(size.width, size.height) },
        uCharCount:  { value: ASCII_CHARS.length },
        uTransition: { value: 0 },
        uBgColor:    { value: new THREE.Vector3(1, 1, 1) },
        uInkColor:   { value: new THREE.Vector3(0, 0, 0) },
        uAccentBase:  { value: new THREE.Vector3(...hexToRgb01(debugStore.accentBaseColor)) },
        uAccentFocus: { value: new THREE.Vector3(...hexToRgb01(debugStore.accentFocusColor)) },
        uDpr:        { value: gl.getPixelRatio() },
        uCardP0:      { value: Array.from({ length: MAX_GLOW_CARDS }, () => new THREE.Vector2()) },
        uCardP1:      { value: Array.from({ length: MAX_GLOW_CARDS }, () => new THREE.Vector2()) },
        uCardP2:      { value: Array.from({ length: MAX_GLOW_CARDS }, () => new THREE.Vector2()) },
        uCardP3:      { value: Array.from({ length: MAX_GLOW_CARDS }, () => new THREE.Vector2()) },
        uCardColor:        { value: Array.from({ length: MAX_GLOW_CARDS }, () => new THREE.Vector3()) },
        uCardHoverColor:   { value: Array.from({ length: MAX_GLOW_CARDS }, () => new THREE.Vector3()) },
        uCardHoverProgress: { value: new Array(MAX_GLOW_CARDS).fill(0) },
        uCardActive:  { value: new Array(MAX_GLOW_CARDS).fill(0) },
        uGlowOpacity: { value: 0 },
        uPgCardP0:      { value: Array.from({ length: MAX_PLAYGROUND_GLOW }, () => new THREE.Vector2()) },
        uPgCardP1:      { value: Array.from({ length: MAX_PLAYGROUND_GLOW }, () => new THREE.Vector2()) },
        uPgCardP2:      { value: Array.from({ length: MAX_PLAYGROUND_GLOW }, () => new THREE.Vector2()) },
        uPgCardP3:      { value: Array.from({ length: MAX_PLAYGROUND_GLOW }, () => new THREE.Vector2()) },
        uPgCardOpacity: { value: new Array(MAX_PLAYGROUND_GLOW).fill(0) },
        uPgCardActive:  { value: new Array(MAX_PLAYGROUND_GLOW).fill(0) },
        uPgGlowColor:   { value: new THREE.Vector3(...hexToRgb01(debugStore.accentFocusColor)) },
        uPgGlowOpacity: { value: 0 },
      },
      depthTest:  false,
      depthWrite: false,
    })
    const quadScene = new THREE.Scene()
    quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
    return { quadScene, quadCamera, material }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the atlas asynchronously and update the uniform once ready
  useEffect(() => {
    let cancelled = false
    buildAsciiAtlas().then((tex) => {
      if (!cancelled) {
        material.uniforms.uAsciiAtlas.value = tex
        setAtlasTexture(tex)
      }
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material])

  // Update transition target when mode cycles; handle 2→0 wrap via segment 2→3
  useEffect(() => {
    if (mode === 0 && prevMode.current === 2) {
      transTarget.current = 3
    } else {
      transTarget.current = mode
    }
    prevMode.current = mode
  }, [mode])

  useEffect(() => {
    target.setSize(size.width, size.height)
    maskTarget.setSize(size.width, size.height)
    material.uniforms.uResolution.value.set(size.width, size.height)
    material.uniforms.uDpr.value = gl.getPixelRatio()
  }, [size, gl, target, maskTarget, material])

  useEffect(() => () => {
    target.dispose()
    maskTarget.dispose()
    accentMats.current.forEach(({ mat }) => mat.dispose())
    maskBlackMat.dispose()
    material.dispose()
    atlasTexture?.dispose()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, material])

  useFrame((_, delta) => {
    const dt      = Math.min(delta, 0.1)
    const tTrans  = 1 - Math.pow(1 - 0.14, dt * 60)
    const tAccent = 1 - Math.pow(1 - 0.16, dt * 60)

    // Snap wrap: once halftone→1-bit segment completes, reset both refs to 0
    if (transTarget.current === 3 && transition.current > 2.97) {
      transition.current = 0
      transTarget.current = 0
    }
    transition.current += (transTarget.current - transition.current) * tTrans

    // Render scene to RT
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(scene, camera)

    // Lerp per-mesh blend toward focused (1) or unfocused (0) each frame.
    // R channel = unfocused weight, G channel = focused weight.
    accentStore.meshes.forEach(mesh => {
      let entry = accentMats.current.get(mesh)
      if (!entry) {
        entry = { mat: new THREE.MeshBasicMaterial({ opacity: 0, blending: THREE.NoBlending }), blend: 0 }
        accentMats.current.set(mesh, entry)
      }
      entry.blend += ((mesh === accentStore.focused ? 1 : 0) - entry.blend) * tAccent
      entry.mat.color.setRGB(1 - entry.blend, entry.blend, 0)
    })

    // Build mesh cache on first frame, and re-build whenever the scene structure
    // changes (accentStore.sceneVersion) — otherwise meshes added later would be
    // skipped by the mask-swap loop below and leak their true lit color into the
    // accent mask.
    if (!meshesScanned.current || scannedVersion.current !== accentStore.sceneVersion) {
      sceneMeshes.current = []
      scene.traverse(obj => { if (obj instanceof THREE.Mesh) sceneMeshes.current.push(obj) })
      origMats.current.length = sceneMeshes.current.length
      meshesScanned.current  = true
      scannedVersion.current = accentStore.sceneVersion
    }

    // Render accent mask — single pass with material swap (no z-fighting, correct depth).
    // Temporarily override scene.background with black so gl.clear() always produces
    // a black mask background — if we leave it as the lerping scene bg color, the mask
    // gets a grey clear during white↔black transitions, which the shader misreads as
    // accent ink everywhere (grey R+G > 0.01 threshold), producing red background dots.
    const meshList = sceneMeshes.current
    const matList  = origMats.current
    for (let i = 0; i < meshList.length; i++) {
      const mesh = meshList[i]
      matList[i] = mesh.material
      const accentEntry = accentMats.current.get(mesh)
      mesh.material = accentEntry ? accentEntry.mat : maskBlackMat
    }
    const savedBg   = scene.background
    scene.background = maskBg
    gl.setRenderTarget(maskTarget)
    gl.clear()
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    scene.background = savedBg
    for (let i = 0; i < meshList.length; i++) { meshList[i].material = matList[i] }

    // Apply post-processing
    material.uniforms.uScene.value      = target.texture
    material.uniforms.uAccentMask.value = maskTarget.texture
    material.uniforms.uTransition.value = transition.current

    // bgStore is the single source of truth for background color (BackgroundSync
    // in Scene.tsx resolves the debug override vs. the natural white/black lerp
    // and keeps scene.background in lockstep with it — see the comment there).
    // Reading anything else here would let this shader's idea of "background"
    // drift from what's actually rendered into uScene.
    const bgVal = material.uniforms.uBgColor.value as THREE.Vector3
    const inkVal = material.uniforms.uInkColor.value as THREE.Vector3
    bgVal.set(bgStore.r, bgStore.g, bgStore.b)
    // Was: vec3(1 - bgStore.luminance) — a grayscale complement of bg's own
    // luminance. That only guarantees strong contrast when bg sits near a
    // luminance extreme (0 or 1, the site's original white/black-only
    // design) — for a randomized palette bg near the *middle* of the
    // luminance range (e.g. a mid-tone terracotta), its complement lands
    // near the SAME luminance as bg, producing near-zero contrast: ink reads
    // as a washed-out gray blob barely distinguishable from the background,
    // even with full dither coverage. fgStore (the actual palette fg role,
    // written by Scene.tsx's BackgroundSync) is already guaranteed >=4.5:1
    // WCAG contrast against bg by the palette API's own filter — using it
    // directly sidesteps the luminance-complement assumption entirely.
    if (debugStore.fgColor) inkVal.set(...hexToRgb01(debugStore.fgColor))
    else inkVal.set(fgStore.r, fgStore.g, fgStore.b)
    ;(material.uniforms.uAccentBase.value as THREE.Vector3).set(...hexToRgb01(debugStore.accentBaseColor))
    ;(material.uniforms.uAccentFocus.value as THREE.Vector3).set(...hexToRgb01(debugStore.accentFocusColor))

    // Outer card glow — see cardGlowStore.ts. Whole layer's opacity follows
    // the same zoneTransitionStore blend the DOM panes themselves fade with
    // (zone 0 = Projects), so the glow appears/disappears in lockstep with
    // the cards it belongs to instead of lingering after they've faded out.
    const p0Uniforms       = material.uniforms.uCardP0.value            as THREE.Vector2[]
    const p1Uniforms       = material.uniforms.uCardP1.value            as THREE.Vector2[]
    const p2Uniforms       = material.uniforms.uCardP2.value            as THREE.Vector2[]
    const p3Uniforms       = material.uniforms.uCardP3.value            as THREE.Vector2[]
    const colorUniforms    = material.uniforms.uCardColor.value         as THREE.Vector3[]
    const hoverColorUniforms = material.uniforms.uCardHoverColor.value  as THREE.Vector3[]
    const hoverProgUniforms  = material.uniforms.uCardHoverProgress.value as number[]
    const activeUniforms   = material.uniforms.uCardActive.value        as number[]
    for (let i = 0; i < MAX_GLOW_CARDS; i++) {
      const entry = cardGlowStore.entries[i]
      if (entry) {
        const [c0, c1, c2, c3] = entry.corners
        p0Uniforms[i].set(c0.x, c0.y)
        p1Uniforms[i].set(c1.x, c1.y)
        p2Uniforms[i].set(c2.x, c2.y)
        p3Uniforms[i].set(c3.x, c3.y)
        colorUniforms[i].set(...hexToRgb01(entry.color))
        hoverColorUniforms[i].set(...hexToRgb01(entry.hoverColor))
        hoverProgUniforms[i] = entry.hoverProgress
        activeUniforms[i] = 1
      } else {
        activeUniforms[i] = 0
      }
    }
    material.uniforms.uGlowOpacity.value = zoneTransitionStore.displayedZone === 0 ? zoneTransitionStore.blend : 0

    // Playground + About cards' hover-only glow — see playgroundGlowStore.ts.
    // Same lockstep-with-zone pattern as above; shared by zone 1 (About) and
    // zone 2 (Playground), which are never displayed at once, so there's no
    // slot collision between the two zones' cards writing into this pool.
    const pgP0Uniforms      = material.uniforms.uPgCardP0.value      as THREE.Vector2[]
    const pgP1Uniforms      = material.uniforms.uPgCardP1.value      as THREE.Vector2[]
    const pgP2Uniforms      = material.uniforms.uPgCardP2.value      as THREE.Vector2[]
    const pgP3Uniforms      = material.uniforms.uPgCardP3.value      as THREE.Vector2[]
    const pgOpacityUniforms = material.uniforms.uPgCardOpacity.value as number[]
    const pgActiveUniforms  = material.uniforms.uPgCardActive.value  as number[]
    for (let i = 0; i < MAX_PLAYGROUND_GLOW; i++) {
      const entry = playgroundGlowStore.entries[i]
      if (entry) {
        const [c0, c1, c2, c3] = entry.corners
        pgP0Uniforms[i].set(c0.x, c0.y)
        pgP1Uniforms[i].set(c1.x, c1.y)
        pgP2Uniforms[i].set(c2.x, c2.y)
        pgP3Uniforms[i].set(c3.x, c3.y)
        pgOpacityUniforms[i] = entry.opacity
        pgActiveUniforms[i] = 1
      } else {
        pgActiveUniforms[i] = 0
      }
    }
    ;(material.uniforms.uPgGlowColor.value as THREE.Vector3).set(...hexToRgb01(debugStore.accentFocusColor))
    const pgZoneActive = zoneTransitionStore.displayedZone === 1 || zoneTransitionStore.displayedZone === 2
    material.uniforms.uPgGlowOpacity.value = pgZoneActive ? zoneTransitionStore.blend : 0

    gl.render(quadScene, quadCamera)
  }, 1)

  return null
}
