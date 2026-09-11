Performance implementation and verification — 9 September 2026

The isolated production build uses `PERF_DIST_DIR=.next-performance` and port 3001. Port 3000 remains available. No deployment was performed. Existing workspace edits and original media were retained.

Measurements were taken on an Apple M3 (8 CPU cores, 24 GiB RAM), using headless Chrome and Playwright WebKit 26.4. Chrome desktop profiles use 10 Mbps download / 40 ms latency; the 390×844 phone profile uses 5 Mbps / 40 ms and 4× CPU throttling. These are browser emulations on a Mac, not measurements from an iPhone. WebKit measurements are unthrottled because Chrome’s CDP network/CPU controls are unavailable there. Cold and warm runs use a new browser context followed by a reload in that context. Each reported profile has one cold/warm pair, so differences below a few hundred milliseconds are not statistically established.

Frame-rate figures describe requestAnimationFrame cadence in headless browsers, not GPU presentation counters; WebKit can run faster than the physical display refresh rate.

“Ready” is navigation start through loader dismissal, including its 600 ms exit fade. It is a conservative proxy for navigation readiness. Raw resource timings and long-task/frame samples accompany the screenshots in this directory. The baseline’s first Projects screenshots were sometimes taken before all project assets had arrived; use the settled interaction captures to inspect models.

Measured loader-dismissal times (seconds):

| Profile | Before cold | After cold | Before warm | After warm |
| --- | ---: | ---: | ---: | ---: |
| 1440px Chrome | 14.25 | 3.94 | 1.44 | 1.48 |
| 1920px Chrome | 12.53 | 3.97 | 1.83 | 1.48 |
| 390px Chrome | 23.14 | 6.61 | 4.02 | 1.47 |

The 3-second desktop / 5-second mobile cold-load targets were not met. The 1.68 MB HDR environment and central model still dominate the critical path; shader/GLTF initialization adds CPU work on the phone profile. The 600 ms loader exit accounts for part of the measured time. Warm desktop times are broadly unchanged; warm mobile improves after avoiding a desktop-first scene initialization.

Unthrottled final WebKit loader-dismissal times: 1440px cold 1.90s, 1440px warm 1.35s, 1920px cold 1.86s, 1920px warm 1.42s, 390px cold 1.43s, 390px warm 1.33s.

Production build/TypeScript, controller unit checks, focused ESLint, generated asset/hash/duration checks, Chrome/WebKit desktop/mobile lifecycle tests, existing project rendering/hovers, the directional entrance/constant-scale regression check, existing gallery interactions, and existing video playback checks passed. WebKit’s third-party game restrictions are described below. All six quality scales were captured; the desktop tier test also asserts that project color detail survives after shadows become static.

Settled rendering samples at 1440×900, each measured over five seconds:

| Sample | Before fps | After fps | After p95 frame interval |
| --- | ---: | ---: | ---: |
| Projects (first entry) | 30.1 | 60.1 | 16.8 ms |
| Playground (first entry) | 60.1 | 60.1 | 16.7 ms |
| Projects (return) | 34.5 | 15.0 | 66.8 ms |

The first settled Projects sample improves from roughly 30 fps to 60 fps; Playground remains near 60 fps. Hidden gallery playback falls from 15 active videos behind Projects to zero. Visible gallery playback uses seven current previews and up to five prepared/transitioning clips briefly, instead of continuously decoding all fifteen.

The return-to-Projects idle samples ran at 15–30 fps, with 33–67 ms frame intervals, despite zero playing gallery videos and no measured >50 ms main-thread long tasks. Hiding the gallery with `visibility:hidden` and `display:none` did not improve this. Moving the cursor immediately restored roughly 60 fps in the diagnostic. The exact cause of this idle pacing is not established. Therefore sustained 60 fps across every idle/revisit state is **not** claimed. See the separate active-cursor measurements for responsive movement.

The baseline and after first/return samples are not a statistical study. Rendering, browser scheduling, and system activity can affect these short runs. Baseline WebKit and physical-device comparisons remain unavailable.

Active cursor movement at 1440×900 (five-second samples):

| Sample | Average fps | p95 frame interval | Long tasks >50 ms |
| --- | ---: | ---: | ---: |
| Projects | 60.1 | 16.7 ms | 0 |
| Playground | 60.0 | 16.7 ms | 0 |
| Projects return | 59.4 | 16.8 ms | 0 |

Final WebKit settled rendering (unthrottled, 1440×900) measured Projects: 72.4 fps, Playground: 159.7 fps, Projects return: 63.5 fps. Its final settled project screenshot was inspected after the shadow-cache fix; materials and screen content remain visible. Generated asset HTTP responses were also checked for `public, max-age=31536000, immutable`.

Implementation:

- A versioned local snapshot of 200 palettes supplies validated randomized role assignments without an external request on the HTML path. Existing server-inlined CSS prevents a first-paint palette change.
- Central navigation/environment/fonts retain priority. Project model and thumbnail blanket preloads were removed. Desktop project models warm progressively after navigation readiness, with immediate promotion when Projects is selected. Section content mounts on first visit; mobile waits for viewport classification before creating a scene. Detail layouts and developer UI use dynamic imports.
- The unused albedo target/pass/material cache is gone. Shadows are invalidated by transform/light changes; static views reuse maps. The installed Three r183 renderer converts legacy PCFSoft to PCF only during a shadow render, so caching requires the effective PCF setting to prevent shader sampler mismatches.
- Beauty/mask targets adapt together: desktop 1/1.5/2×, mobile .75/1/1.5× CSS resolution. Dither coordinates and outline distances remain in CSS pixels. Sustained slow frames lower quality, sustained headroom raises it, and an eight-second cooldown limits oscillation. Shadow maps follow the tier.
- DOM animation callbacks share one scheduler. Model-slot/card geometry is cached with resize/scroll/ancestor-style invalidation; read callbacks precede writes. Necessary geometry changes during directional entrances remain live. Static style writes are skipped. Model silhouette areas are generated offline with the same browser rasterizer; content hashes detect stale metadata.
- A single gallery media controller owns document playback listeners. Per-piece clocks survive hidden decoding, preview/detail URL changes, and background tabs. Preview cuts wait for a ready frame, prepare the next clip shortly before the cut, and retain the outgoing decoder through the 33 ms blend. Covered previews pause while every visible detail clip plays. Opened game iframes remain mounted when showing screenshots or closing/reopening the collection.
- Responsive images, video previews, dimensions/durations, and stable playback IDs are generated into a manifest. Hashed derivatives use immutable cache headers. The phone export retains only the active authored scene and its referenced data; the can-label WebP is pixel-identical to the PNG.
- Removing eager renderer compilation exposed a first-frame hotspot-cache race. Updating the centered model hierarchy before measuring rest positions preserves correct section selection.

Representative asset sizes (decimal MB):

| Asset | Original | Preview | Detail |
| --- | ---: | ---: | ---: |
| Letters thing | 13.98 | .064 | 2.53 |
| Rodman | 11.55 | .122 | 2.49 |
| Wild horses | 27.19 | .227 | 2.31 |
| Necklace video | 27.99 | 1.12 | 21.37 |

The phone GLB shrank from 9.54 MB to 7.83 MB by removing unrelated scenes and their unused data. Its separate label shrank from 7.14 MB PNG to 4.03 MB lossless WebP. All source assets remain available. The necklace’s high-resolution detail remains relatively expensive; the lightweight preview removes it from gallery preview traffic.

Reproduction:

```sh
PERF_DIST_DIR=.next-performance npm run build
PERF_DIST_DIR=.next-performance npm run start -- -p 3001
node scripts/run-performance-measurements.mjs
node scripts/measure-active-rendering.mjs
node scripts/check-performance.mjs
PERF_ENGINE=webkit node scripts/check-performance.mjs
node scripts/check-quality-tiers.mjs
node scripts/test-performance-controllers.mjs
node scripts/validate-performance-assets.mjs
TEST_BASE_URL=http://localhost:3001 node scripts/check-project-rendering.mjs
TEST_BASE_URL=http://localhost:3001 node scripts/check-playground.mjs
TEST_BASE_URL=http://localhost:3001 node scripts/check-new-playground-videos.mjs
# Uses the development-only material audit hook on port 3000:
node scripts/check-project-transition.mjs
```

Asset regeneration uses `node scripts/optimize-media.mjs`, `python3 scripts/optimize-phone.py`, and `node scripts/generate-model-fit.mjs` (with port 3001 running). These require local Sharp, FFmpeg/ffprobe, and Playwright Chrome. New phone/label output paths must be wired into content/model components before regenerating model-fit metadata; `validate-performance-assets.mjs` checks the hashes and durations. The palette snapshot is intentionally versioned; refreshing its data is a maintenance action, not a request-time dependency.

Verification limits: no physical Safari/iPhone/Android device was available. The external itch.io game raises cross-origin/media-device restrictions in WebKit; the site’s iframe lifecycle passed, but real Safari gameplay remains unverified. Baseline WebKit screenshot capture timed out before a complete comparable baseline was saved. Synthetic quality-tier captures exercise hysteresis and rendering behavior, and must not be interpreted as hardware FPS benchmarks.
