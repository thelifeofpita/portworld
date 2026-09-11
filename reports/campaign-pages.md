# Campaign page implementation — updated 11 September 2026

Hat Twix, Your Coolest Lesson Yet, and Verified now use bespoke scrolling case pages on desktop and the existing mobile accordion. The approved Surf the Spike, Back in Smoothly, and Pick a Side layout files were not changed by this task. Existing overview models, materials, project ordering, award metadata, and case-film IDs were preserved.

Production preview: http://localhost:3001. The development server on port 3000 remains available. Production output is isolated in `.next-campaign`.

## Content and presentation

Revision on 11 September after visual feedback:

- Verified: removed the standalone badge close-up. Three taller 4:5 portrait crops focus on jackets and badges. The large billboard is restored above the LinkedIn and noticeboard mockups, cropped to matching 4:3 frames.
- Hat Twix: the outer desktop panel now uses the same gold as the page, preserving the red overview-model accent separately. Removed the pub mockup; Henry, Zidane and Bale share a row with equal heights. One social row combines the highlighted PSG Instagram mockup, source campaign tweets and the Ronaldo TikTok execution.
- Duolingo: two looping clips from the finished local case film show a complete ice cream rotation and the camera moving through the sticks. Six individual stills use taller 8:9 crops in a single desktop row; the baked three-image composite is replaced by separate source images with equal gaps. Phones use a two-column still grid.
- No invented section headings or supporting explanations. Shared typography, page width, navigation, dither reveals and spacing remain consistent with the established pages.

The source inventory is recorded in `content/campaign-page-media.json`. `scripts/prepare-campaign-pages.mjs` reproduces responsive, content-hashed WebP derivatives; originals remain untouched. `CAMPAIGN_SOURCE_ROOT` can point to another copy of the drive.

`content/duolingo-loops.json` records the two video sources, edits, dimensions and durations. `scripts/prepare-duolingo-loops.mjs` extracts the rotation at 67–70 seconds and the flythrough at 46–49.6 seconds from `JOSE+PITA.mp4`. The rotation loops naturally; the flythrough uses a short wrap dissolve. The two 1280×720 H.264 clips total 1,037,760 bytes. They load near the viewport and use the shared media controller to suspend offscreen/background decoding while retaining timeline identity. Both play automatically without playback controls, including when reduced motion is enabled, as requested. Offscreen/background decoder suspension remains internal.

## Fidelity decisions and limitations

- The attempted AI background removal changed the Duo render's surface detail. That result was rejected and is not referenced by the site. The original product render retains its white field to preserve the authored frost, colour, pose, and face. The Twix logo retains its supplied transparency.
- The portrait and execution crops preserve the original artwork and QR pixels. The selected PSG Instagram has a reviewed yellow Hat Twix highlight and no selection outline; its edited master lives in `assets/campaign-edits`. Tweets and TikTok use supplied campaign artwork.
- Local case exports were visually inspected through timestamped frames: `hatTwixExp11.mp4`, `JOSE+PITA.mp4`, and `giffgaffExp07.mp4`. The website's existing published film IDs remain unchanged. A published Duolingo frame confirmed the reward-stick execution. Full independent comparison of the published Twix and Verified films could not be completed: YouTube playback was blocked/stalled in the temporary browser, and direct embed attempts returned error 153. Those selections follow the local case edits and supplied artwork; this is not a claim of frame-for-frame published-film verification.
- Older Verified website concepts, generic hiring photos, unrelated Duolingo reference campaigns, and unused working exports were excluded.

## Verification

The table below records the preceding layout revision. The 11 September rerun is recorded separately below.

| Check | Result |
| --- | --- |
| TypeScript (`npx tsc --noEmit`) | Pass |
| ESLint on changed application files and new scripts | Pass, no warnings |
| Isolated production build | Pass |
| Chrome: 1440×900, 1920×1080, 390×844, 430×932 | Pass |
| WebKit: the same four viewport sizes | Pass |
| Previous/next through all six projects and close | Pass |
| Keyboard activation of project navigation | Pass |
| Image decoding, explicit dimensions, aspect ratios, viewport fit | Pass |
| Closed YouTube iframe removal | Pass |
| Reduced-motion phone run at 430×932 | Pass |
| Existing `check-project-rendering.mjs` against production | Pass: six model hovers, three sizes, Twix opening, no rendering errors |

The new interaction suite is `scripts/check-campaign-pages.mjs`; set `TEST_ENGINE=webkit` for WebKit and `TEST_PHONE_ONLY=1` for the two phone sizes. Screenshots and phone result files are in `/tmp/campaign-check-chromium` and `/tmp/campaign-check-webkit`. Desktop passes were also recorded in terminal output. Screenshots were visually inspected for typography, media presentation, campaign colours, and the badge crop; no pixel-diff baseline was established.

Early test failures were corrected by matching the actual “Surf the spike.” heading, selecting h1 rather than the duplicate mobile card title, and scoping navigation to the active card while waiting for closing cards to unmount. One WebKit run reported “Context is stopped”; it did not recur in the final passing runs. No application workaround was added for that intermittent error.

Real iPhone/Safari hardware testing was not available. These checks establish browser layout and interaction behaviour, not a new frame-rate or cold-load performance benchmark. Nothing was deployed.

## 11 September verification

- Isolated production build, TypeScript and targeted ESLint: pass.
- Chrome and WebKit: 1440×900, 1920×1080, 390×844 and reduced-motion 430×932: pass.
- Both visible Duolingo loops advance. Individual pause, background suspension, offscreen suspension and reduced-motion manual playback: pass.
- Requested image counts/groupings, equal-height crops, single desktop still/social rows, no baked lesson triptych, uniform Hat Twix panel gold, source aspect ratios, navigation through all six projects and iframe cleanup: pass.
- Desktop and phone screenshots visually reviewed for jacket/badge crops, lower execution pair, mixed social row and individual still spacing. No physical Safari/iPhone device was available.

The small tweet's density-corrected browser `naturalHeight` was rounded enough to trigger a false aspect-ratio warning. The check now compares layout dimensions against declared source dimensions; application image proportions did not need changing. Desktop passes were recorded before the phone-only rerun; the final results JSON therefore contains the phone results. No deployment performed.

### Follow-up: navigation, continuous loops and taller stills

Campaign navigation now matches the established layouts' zero button padding, flex-aligned arrow spans, 0.4em arrow gaps and centered close button. Removed Duolingo pause/play controls and the reduced-motion playback gate. Visible clips play continuously through the shared media controller; background/offscreen suspension remains internal. Each bottom-row still now has an 8:9 crop, twice its previous display height at a fixed width. Crops were inspected to retain engraved copy and the product face.

Follow-up verification: production build, TypeScript, targeted ESLint and Chrome/WebKit at 1440×900 and 430×932 all pass. Browser assertions cover centered/aligned navigation, no playback controls, advancing visible loops (also with reduced motion enabled), 8:9 still crops and six-project navigation. Desktop crop screenshot visually reviewed.

### Message-focused crop correction

Replaced uniform centre crops with per-image clipped frames. Reminder and Italian frames focus at 41.7% of source width, with 2.15× the previous magnification; French, Spanish and Winner use 1.5× with individual focal points. Full engraved messages were visually checked in the rendered desktop row. Original media remains unchanged, and responsive image requests account for the magnification.
