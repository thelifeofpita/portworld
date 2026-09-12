// One-time asset-generation tool: produces the static image of each project's
// 3D model that MobilePage.tsx's Projects grid displays.
//
// It photographs the REAL desktop site — localhost:3000, the actual Scene.tsx +
// PostProcessing pipeline, the actual ContentPanel slot layout — and cuts the
// models out of it. Nothing about the lighting, the tone mapping, the camera or
// the pose is reproduced or approximated here; the pixels ARE desktop's pixels.
//
// That matters because reproducing them was tried at length and kept drifting:
// the camera distance and FOV, three's tone curve vs PostProcessing's, the
// env-map intensity, and — the one that mattered most — the fact that each
// model sits at an off-centre slot, so InSceneProjectModel's
// outer.lookAt(camera.position) genuinely rotates it and swings its surfaces
// into the key light. Every one of those is a chance to be subtly wrong.
// Taking the real frame has none.
//
// ── How the transparent cutout works ────────────────────────────────────────
// Desktop renders opaque, on a dithered background, so there is no alpha to
// screenshot. Instead the page is loaded TWICE with a forced palette — once
// with the background flat black, once flat white — which is possible because
// app/layout.tsx inlines `window.__PALETTE__` in <head> before any app JS
// runs, so addInitScript can set it first.
//
// The models are palette-independent (PostProcessing composites project pixels
// as `projectColor * uProjectOpacity`, and uProjectOpacity is 1 once the
// section has settled), so both frames draw the model identically and differ
// only in the background. For a pixel of colour C with coverage a over
// background B:
//
//     P_black = C*a                    (B = 0)
//     P_white = C*a + (1 - a)          (B = 1)
//  => a = 1 - (P_white - P_black)
//     C = P_black / a
//
// which is exact, including on antialiased edges — no chroma key, no halo, no
// despill. It requires the two loads to agree pixel-for-pixel, so the model
// rects are read back from the DOM and compared, and the run aborts if they
// disagree.
//
// Usage: node scripts/capture-mobile-project-thumbs.mjs
// (dev server must already be running at localhost:3000)
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const OUT_DIR = '/tmp/mobile-thumb-raw'
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
// A real desktop viewport — this is what makes useIsMobile report desktop and
// ContentPanel lay the six models out on its ellipse.
const VIEWPORT = { width: 1440, height: 900 }
const DEVICE_SCALE_FACTOR = 2

// Order matches projectsContent.ts indices 0-5.
const PROJECTS = ['surf-the-spike', 'duolingo', 'verified', 'hat-twix', 'pick-a-side', 'back-in-smoothly']

// Per-project tilt, in degrees, for pieces that need a specific angle rather
// than the neutral pose. Absent = neutral.
//
// These are real desktop poses, not invented ones: the site tilts each model
// toward the cursor (useCardTilt), and that relationship inverts, so a target
// angle becomes a cursor position and the capture is still a genuine frame of
// the desktop render. Each entry costs an extra pair of page loads, since a
// cursor position that poses one model poses all the others differently — only
// the listed model is taken from that pass.
//
//   duolingo: the popsicle's pupils are glossy, and at the neutral pose the
//   key light lands a specular blowout on the LEFT pupil, turning it near
//   white while the right stays dark. Swept yaw -6..24 x pitch -12..12 and
//   read the eyes: pitch is what matters, not yaw. At +12 (looking very
//   slightly up) the highlight rolls off both pupils and they read black,
//   while the face stays square to camera at yaw 0.
const TILT = {
  1: { yaw: 0, pitch: 12 },
}

// useCardTilt's own constants: LOOK_SENSITIVITY * LOOK_MAX_DEG.
const TILT_DEG_PER_UNIT = 1.15 * 16

// Only `white` (bg) and `black` (fg) decide the dithered background. Setting
// them equal collapses the dither to a flat field, which is what makes the
// two-frame solve exact rather than approximate.
const flatPalette = hex => ({
  white: hex, black: hex, yellow: hex, red: hex, bright: hex,
  title: 'capture', slug: 'capture',
})

async function shoot(browser, bgHex, tiltFor = null) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('PAGE ERROR', e.message))
  // Locked non-writable, not just assigned. app/layout.tsx is a server
  // component that inlines its own `window.__PALETTE__ = {...}` into <head>,
  // and that runs AFTER Playwright's init script — so a plain assignment here
  // gets clobbered by the server's randomly chosen palette (which is how two
  // loads ended up with two different backgrounds). Making the property
  // non-writable means the inline assignment silently no-ops (it is
  // non-strict), and this value is the one paletteStore adopts.
  await page.addInitScript(p => {
    Object.defineProperty(window, '__PALETTE__', { value: p, writable: false, configurable: false })
  }, flatPalette(bgHex))
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })

  // The loader gates on the model, the palette and the warmed sections.
  await page.waitForFunction(() => {
    const l = document.querySelector('[class*="loader"]')
    return !l || getComputedStyle(l).opacity === '0'
  }, { timeout: 180000 }).catch(() => console.log('  loader still up, continuing'))

  // Open the Projects zone by clicking the ZoneNav label IN PAGE, never with
  // the real pointer. This is deliberate and it matters a lot.
  //
  // cursorStore only starts reporting once a genuine mousemove has fired
  // ("hasMoved gates consumers so cards sit neutral until the user's first
  // real mouse movement"), and useCardTilt's offset is NOT clamped — it is
  // (cursor - cardCentre) / (viewport/2) scaled to 16deg. So any real pointer
  // position tilts all six models, by different amounts, according to how far
  // each one sits from the cursor. Parking the pointer in a corner to dodge
  // hover was the worst case: it swung the Surf the Spike phone ~11deg of yaw
  // and ~9deg of pitch off-axis, which turns its screen away from the viewer
  // and is why that screen kept coming out dark.
  //
  // Dispatching the click from inside the page fires no mousemove, so
  // hasMoved stays false, every model holds its neutral pose, and nothing is
  // hovered — no tilt and no hover glow to bake in.
  const opened = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')]
      .find(e => e.children.length === 0 && e.textContent.trim() === 'Projects')
    if (!el) return false
    el.click()
    return true
  })
  if (!opened) throw new Error('could not find the Projects nav label')

  // Let the camera settle at z=15 and the models reach their fitted pose.
  await page.waitForTimeout(9000)


  const slots = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('li').forEach(li => {
      const inner = li.firstElementChild
      if (!inner) return
      const r = inner.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) return
      out.push({ cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height })
    })
    return out
  })

  // Pose one model by placing the cursor where useCardTilt's own formula puts
  // that angle. Inverting rotateY = (cursor.x - cx)/(vw/2) * K for cursor.x,
  // and rotateX = -(cursor.y - cy)/(vh/2) * K for cursor.y.
  if (tiltFor) {
    const s = slots[tiltFor.index]
    const x = s.cx + (tiltFor.yaw / TILT_DEG_PER_UNIT) * (VIEWPORT.width / 2)
    const y = s.cy - (tiltFor.pitch / TILT_DEG_PER_UNIT) * (VIEWPORT.height / 2)
    if (x < 2 || x > VIEWPORT.width - 2 || y < 2 || y > VIEWPORT.height - 2) {
      throw new Error(`tilt yaw=${tiltFor.yaw} pitch=${tiltFor.pitch} for index ${tiltFor.index} needs an off-screen cursor (${x.toFixed(0)},${y.toFixed(0)})`)
    }
    await page.mouse.move(x, y)
    await page.waitForTimeout(2500)
  }

  const png = await page.screenshot({ type: 'png' })
  await ctx.close()
  return { png, slots }
}

// One pass = one cursor arrangement = one black/white pair. Models that want
// the neutral pose share a single pass; each tilt override needs its own,
// because a cursor position that poses one model poses every other model
// differently.
function buildPasses() {
  const neutral = PROJECTS.map((_, i) => i).filter(i => !TILT[i])
  const passes = []
  if (neutral.length) passes.push({ label: 'neutral', tilt: null, indices: neutral })
  for (const [k, t] of Object.entries(TILT)) {
    const index = Number(k)
    passes.push({ label: `${PROJECTS[index]} yaw=${t.yaw} pitch=${t.pitch}`, tilt: { index, ...t }, indices: [index] })
  }
  return passes
}

const run = async () => {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
   for (const pass of buildPasses()) {
    console.log(`\n=== pass: ${pass.label} -> ${pass.indices.map(i => PROJECTS[i]).join(', ')}`)
    const black = await shoot(browser, '#000000', pass.tilt)
    const white = await shoot(browser, '#ffffff', pass.tilt)

    if (black.slots.length !== 6 || white.slots.length !== 6) {
      throw new Error(`expected 6 slots, got ${black.slots.length}/${white.slots.length}`)
    }
    black.slots.forEach((s, i) => {
      const o = white.slots[i]
      if (Math.abs(s.cx - o.cx) > 1 || Math.abs(s.cy - o.cy) > 1) {
        throw new Error(`slot ${i} moved between loads (${s.cx},${s.cy} vs ${o.cx},${o.cy}) — frames not aligned`)
      }
    })

    const bRaw = await sharp(black.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const wRaw = await sharp(white.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const { width, height } = bRaw.info
    const B = bRaw.data, W = wRaw.data
    const solved = Buffer.alloc(width * height * 4)

    // The two background levels have to be MEASURED, not assumed to be 0 and
    // 255. PostProcessing re-encodes the palette colour before compositing it
    // (see bgColorCorrected in that shader — it applies the linear->sRGB step
    // three skips when rendering into a render target), so a forced #000000 and
    // #ffffff do not arrive as 0 and 255. Assuming they did left a fraction of
    // coverage on every background pixel, which both tinted the solve and
    // defeated the alpha trim downstream.
    //
    // Sampling a corner is safe: the canvas is full-bleed and nothing is drawn
    // in the extreme corner in either frame.
    const corner = (buf, c) => buf[c]
    const B0 = [0, 1, 2].map(c => corner(B, c))
    const W0 = [0, 1, 2].map(c => corner(W, c))
    console.log('measured background levels  black:', B0.join(','), ' white:', W0.join(','))
    // Signed on purpose. Forcing every palette role to one hex makes some
    // brightest-role pick flip, so the "#000000" load can come back as the
    // LIGHT background and vice versa. Which way round it lands is irrelevant
    // to the solve — it only needs two known, well-separated levels.
    const spread = [0, 1, 2].map(c => W0[c] - B0[c])
    if (spread.some(s => Math.abs(s) < 32)) {
      throw new Error(`backgrounds too close to separate: ${spread.join(',')}`)
    }

    for (let i = 0; i < width * height * 4; i += 4) {
      // P1 = C*a + B1*(1-a),  P2 = C*a + B2*(1-a)
      //   => a = 1 - (P2 - P1) / (B2 - B1)
      //      C = (P1 - B1*(1-a)) / a
      let aSum = 0
      for (let c = 0; c < 3; c++) aSum += 1 - (W[i + c] - B[i + c]) / spread[c]
      const a = Math.min(1, Math.max(0, aSum / 3))
      if (a < 0.02) { solved[i + 3] = 0; continue }
      for (let c = 0; c < 3; c++) {
        const v = (B[i + c] - B0[c] * (1 - a)) / a
        solved[i + c] = Math.min(255, Math.max(0, Math.round(v)))
      }
      solved[i + 3] = Math.round(a * 255)
    }

    const full = await sharp(solved, { raw: { width, height, channels: 4 } }).png().toBuffer()

    for (const i of pass.indices) {
      const s = black.slots[i]
      const pad = s.w * 0.5
      const left = Math.max(0, Math.round((s.cx - s.w / 2 - pad) * DEVICE_SCALE_FACTOR))
      const top = Math.max(0, Math.round((s.cy - s.h / 2 - pad) * DEVICE_SCALE_FACTOR))
      const right = Math.min(width, Math.round((s.cx + s.w / 2 + pad) * DEVICE_SCALE_FACTOR))
      const bottom = Math.min(height, Math.round((s.cy + s.h / 2 + pad) * DEVICE_SCALE_FACTOR))
      const name = PROJECTS[i]
      await sharp(full)
        .extract({ left, top, width: right - left, height: bottom - top })
        .png()
        .toFile(`${OUT_DIR}/${name}.png`)
      // process-mobile-project-thumbs.mjs measures each model's size relative
      // to the slot it was rendered in, so it needs that slot recorded.
      await writeFile(`${OUT_DIR}/${name}.json`, JSON.stringify({
        slotWidth: s.w, slotHeight: s.h, deviceScaleFactor: DEVICE_SCALE_FACTOR,
        // Slot centre within this crop, in the crop's own device pixels — the
        // seed process-mobile-project-thumbs.mjs flood-fills from, so it picks
        // THIS model and not a neighbour that bled into the crop.
        seedX: s.cx * DEVICE_SCALE_FACTOR - left,
        seedY: s.cy * DEVICE_SCALE_FACTOR - top,
      }))
      console.log(`saved ${name}.png  slot ${Math.round(s.w)}x${Math.round(s.h)} @ (${Math.round(s.cx)},${Math.round(s.cy)})`)
    }
   }
  } finally {
    await browser.close()
  }
}

run()
