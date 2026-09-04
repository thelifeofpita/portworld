// ─── Downloadable CV generator ────────────────────────────────────────────────
//
//   node scripts/generate-cv.mjs   (or: npm run cv)
//
// Renders public/JOSE_PITA_EN.pdf from the SAME source of truth the on-site CV
// panel uses — content/aboutContent.ts — styled with the SAME design tokens as
// the rest of the site. Every value in the stylesheet below is annotated with
// the file + rule it is lifted from, so the PDF can never quietly drift from
// what the site looks like:
//
//   • colours           → app/globals.css  :root
//   • type family        → Futura PT only  (globals.css --font-primary / --font-display)
//   • weights / sizes / letter-spacing / line-height / spacing
//                        → components/ui/ContentPanel.module.css (.about* / .cv* / .bio)
//                          components/ui/Byline.module.css       (.bylineText / .bylinePita)
//   • the mark           → app/icon.svg (the site's favicon path, verbatim)
//   • the heading dot     → components/ui/ZoneNav.tsx (<circle r="4"
//                          fill="var(--accent-base-color)">) — the zone-label dot
//   • the masthead tint  → globals.css --placeholder-color
//                          (color-mix(in srgb, var(--fg-color) 7%, var(--bg-color)))
//
// Rendered through the system Chrome via Playwright (the repo's Chromium build
// has no Ubuntu 26.04 binary), so the PDF's text shaping / kerning is exactly
// the browser's — the same engine that lays out the site.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'
import { aboutContent } from '../content/aboutContent.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const font = (file) =>
  `data:font/ttf;base64,${readFileSync(resolve(root, 'public/fonts', file)).toString('base64')}`

// The three Futura PT faces the site actually resolves to in normal operation:
//   Demi  500  = --font-primary-weight            (body copy, entry titles)
//   Book  400  = calc(--font-primary-weight - 100) (.cvHeading, .cvMeta)
//   Bold  700  = --font-display-weight            (.bylineText — the logotype)
// (globals.css declares Book at 400, Demi at 500, Bold at 700 — matched here.)
const FUTURA_BOOK = font('FuturaPT-Book.ttf')
const FUTURA_DEMI = font('FuturaPT-Demi.ttf')
const FUTURA_BOLD = font('FuturaPT-Bold.ttf')

// The site's favicon, lifted straight out of app/icon.svg — same mark, same
// path data, just recoloured via CSS `fill`.
const iconSvg = readFileSync(resolve(root, 'app/icon.svg'), 'utf8')
const ICON_VIEWBOX = iconSvg.match(/viewBox="([^"]+)"/)[1]
const ICON_PATH = iconSvg.match(/<path[^>]*\bd="([^"]+)"/)[1]

const { cv } = aboutContent

const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

// An "entry" = title + meta, exactly the .cvItem shape from ContentPanel.tsx
const entry = ({ title, meta }) => `
  <div class="entry">
    <div class="title">${esc(title)}</div>
    <div class="meta">${esc(meta)}</div>
  </div>`

// A plain list row = <p class="cvTitle"> on the site (awards / languages / skills)
const row = (s) => `<div class="title">${esc(s)}</div>`

const section = (heading, body) => `
  <section class="section">
    <h2><span class="dot"></span>${esc(heading)}</h2>
    ${body}
  </section>`

// Contact details. Handles/URLs are derived from the same fields the About
// panel links to (aboutContent.email / .instagram / .linkedin); the phone
// number is CV-only (no repo field for it) and is carried over verbatim from
// the previous PDF. Each line is a live link — Chrome's print-to-PDF keeps
// <a href> as a clickable annotation in the output PDF, same as the About
// panel's own contact links on the site.
const CONTACT = [
  { text: 'thelifeofpita.com', href: 'https://thelifeofpita.com' },
  { text: aboutContent.email, href: `mailto:${aboutContent.email}` },
  { text: 'linkedin.com/in/josedph', href: aboutContent.linkedin },
  { text: '(+34) 698 91 61 16', href: 'tel:+34698916116' },
]

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Jose Pita — CV</title>
<style>
  /* Futura PT — the site's one and only production family. Family name and
     per-file weights mirror app/globals.css's @font-face block. */
  @font-face { font-family:'Futura PT'; src:url(${FUTURA_BOOK}) format('truetype'); font-weight:400; font-style:normal; }
  @font-face { font-family:'Futura PT'; src:url(${FUTURA_DEMI}) format('truetype'); font-weight:500; font-style:normal; }
  @font-face { font-family:'Futura PT'; src:url(${FUTURA_BOLD}) format('truetype'); font-weight:700; font-style:normal; }

  :root {
    /* app/globals.css  :root  — the site's baseline palette, i.e. the values
       inlined before the per-visit Lospec theme is applied. A CV is a stable
       document, so it uses that baseline, not a randomised theme. */
    --bg:          #ffffff;   /* --bg-color / --palette-white */
    --ink:         #0d0d0d;   /* --fg-color  */
    --muted:       #999999;   /* --fg-muted  */
    --accent:      #e01010;   /* --hover-color — the colour Byline.module.css
                                 paints onto the "PITA" half of the logotype
                                 (.bylinePita .letterBase { color: var(--hover-color) }) */
    --accent-base: #F20C1F;   /* --accent-base-color — the resting fill of the
                                 ZoneNav label dots (<circle fill=
                                 "var(--accent-base-color)">) */

    /* globals.css --placeholder-color, verbatim: the site's one subtle
       non-white surface tint, defined as a mix of the two themed extremes so
       it never needs its own palette slot. Used here to field the masthead. */
    --placeholder: color-mix(in srgb, var(--ink) 7%, var(--bg));

    /* Every About/CV text class sets letter-spacing: calc(-0.01em + var(--tracking))
       with the site's --tracking at 0 (globals.css). */
    --track: -0.01em;

    /* Print-reading step-up. The site already scales its on-screen body copy
       by --font-primary-scale (1.15) over the 16px base; this applies that
       exact same factor a SECOND time, because a sheet of paper is read at a
       greater distance than a screen fills. Everything below — type AND the
       spacing grid — is the site's value × this factor, so proportions are
       untouched, only the reading size changes. */
    --ps: 1.15;

    /* 0.875rem × --font-primary-scale (globals.css) = 16.1px, × --ps
       ≈ 18.5px ≈ 13.9pt — top of the 10–12pt résumé body range, matching how
       large the rest of the site's type feels. Used for every text class here
       (the site sets .cvHeading / .cvTitle / .cvMeta / .aboutContactLink all
       at this one size; only weight and colour vary). */
    --s-body: calc(16.1px * var(--ps));

    /* Reference size for the identity block, from .bylineText's own
       clamp(1.6rem, 3.5vw, 2.75rem) EVALUATED AT THIS PAGE'S WIDTH
       (210mm ≈ 794px → 3.5vw ≈ 27.8px) rather than its wide-desktop ceiling,
       × --ps. Used for the contact block; the mark and wordmark are keyed
       off it below. */
    --s-name: calc(27.8px * var(--ps));

    /* The favicon mark's height. The wordmark is then sized so its cap
       height lands just under this — the mark is the taller element in the
       lockup, the name a step below it. */
    --mark-h: calc(var(--s-name) * 1.9);

    /* The spacing grid, all from .aboutPanelInner / .cvSection / .cvItem,
       carried up by the same --ps so density is identical to the site. */
    --gap-section: calc(32px * var(--ps));   /* .aboutPanelInner gap 2rem */
    --gap-row:     calc(6.4px * var(--ps));  /* .cvSection gap 0.4rem */
    --gap-item:    calc(1.6px * var(--ps));  /* .cvItem gap 0.1rem */

    /* Page margin = .aboutPanelInner's own 3.5rem vertical padding applied on
       all four sides (its 2.75rem horizontal value was tight for print). */
    --margin: 56px;
  }

  * { margin:0; padding:0; box-sizing:border-box; }

  @page { size: A4; margin: 0; }

  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  body {
    background: var(--bg);
    color: var(--ink);
    font-family: 'Futura PT', sans-serif;
    /* globals.css body: --font-primary-weight (Demi 500) */
    font-weight: 500;
    -webkit-font-smoothing: antialiased;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    display: flex;
    flex-direction: column;
  }

  /* ── Masthead ──────────────────────────────────────────────────────────
     A full-bleed field in --placeholder (the site's only subtle surface
     tint) that separates the identity block from the content — the colour
     change IS the dividing element, so no rule is needed. Padded by the page
     --margin on the sides and a bit over one section-gap top/bottom; the two
     items are pushed to the edges the same way .aboutPane lays out its two
     panels (display:flex; justify-content:space-between). */
  .masthead {
    background: var(--placeholder);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: calc(var(--gap-section) * 1.1) var(--margin);
  }

  /* Favicon + wordmark set as one lockup. */
  .lockup { display: flex; align-items: center; gap: 18px; }

  /* app/icon.svg, recoloured to --fg-color. */
  .mark { height: var(--mark-h); width: auto; display: block; fill: var(--ink); flex: none; }

  /* .bylineText: font-family var(--font-display) = Futura PT, weight 700,
     text-transform uppercase, letter-spacing calc(0em + var(--tracking)) = 0,
     line-height 1 (from .byline). Sized up from --s-name so the ALL-CAPS
     word (its height == its cap height) reads just short of the mark. */
  .name {
    font-weight: 700;
    font-size: calc(var(--mark-h) * 1.1);
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0;
    white-space: nowrap;
  }
  /* Byline.module.css colours the two halves of the logotype separately:
     the plain half in --fg-color, the "PITA" half in --hover-color. */
  .name .plain { color: var(--ink); }
  .name .pita  { color: var(--accent); }

  /* Contact = .aboutContactLink (the About view's live link treatment):
     color --fg-color, letter-spacing calc(-0.01em + var(--tracking)),
     weight inherited from body (Demi 500), sentence case — no uppercasing.
     Rendered at the site's base body size (0.875rem × --font-primary-scale
     1.15 ≈ 16.1px) rather than .aboutContactLink's 1rem, since in this
     document the contact block is secondary to the name and the section
     headings and should not out-weigh them. */
  .contact {
    text-align: right;
    /* A step below body — contact details are reference matter, and the site's
       own contact class (.link) sets them far smaller still (0.7rem). ≈ 11pt. */
    font-size: calc(var(--s-body) * 0.82);
    line-height: 1.2;
    letter-spacing: var(--track);
  }
  .contact div + div {
    margin-top: var(--gap-item);
  }
  /* Live links: same look as the plain text (site convention — a { color:
     inherit; text-decoration: none }, restated here since this standalone
     document doesn't inherit globals.css). */
  .contact a {
    color: inherit;
    text-decoration: none;
  }

  /* ── Body ─────────────────────────────────────────────────────────────
     One vertical stack, the exact shape of the site's CV panel: the
     .aboutPanelRight inner is a single column of .cvSection blocks in the
     order Experience → Education → Skills → Awards → Languages
     (ContentPanel.tsx). Side padding = the page --margin; the gap down from
     the masthead = one section gap (.aboutPanelInner's 2rem). */
  .body {
    padding: var(--gap-section) var(--margin) var(--margin);
  }

  /* = .aboutPanelInner gap (2rem) between stacked sections. */
  .section + .section { margin-top: var(--gap-section); }

  /* .cvHeading: font-size 0.875rem × 1.15 ≈ 16.1px,
     font-weight calc(--font-primary-weight - 100) = 400 (deliberately
     LIGHTER than the 500 body text beneath it — the site's own hierarchy
     cue), letter-spacing calc(-0.01em + var(--tracking)), line-height 1.2,
     NO text-transform (sentence case, e.g. "Experience"),
     margin-bottom 0.1rem — plus .cvSection's 0.4rem gap to the first item
     (1.6px + 6.4px = 8px). */
  .section h2 {
    font-weight: 400;
    font-size: var(--s-body);
    line-height: 1.2;
    letter-spacing: var(--track);
    color: var(--ink);
    /* .cvHeading margin-bottom 0.1rem + .cvSection gap 0.4rem to the first item */
    margin-bottom: calc(var(--gap-item) + var(--gap-row));
    display: flex;
    align-items: center;
  }

  /* The ZoneNav label dot: <circle r="4" fill="var(--accent-base-color)"> —
     an 8px disc in the resting accent (the zone dots only warm toward yellow
     for the *focused* zone; a static document sits at rest). Marks each
     section the way the dot marks each zone label on the site. Gap = .box's
     0.5rem-ish lead-in; nudged down 2px to centre on the caps, not the line
     box. */
  .dot {
    width: calc(8px * var(--ps));
    height: calc(8px * var(--ps));
    border-radius: 50%;
    background: var(--accent-base);
    flex: none;
    margin-right: calc(9px * var(--ps));
    margin-top: 2px;
  }

  /* .cvSection { gap: 0.4rem } between items / rows. */
  .entry + .entry,
  .section h2 + .title,
  .title + .title { margin-top: var(--gap-row); }

  /* .cvTitle: weight inherited (Demi 500), letter-spacing
     calc(-0.01em + var(--tracking)), line-height 1.2, color --fg-color. */
  .title {
    font-size: var(--s-body);
    font-weight: 500;
    line-height: 1.2;
    letter-spacing: var(--track);
    color: var(--ink);
  }

  /* .cvMeta: same size, weight calc(--font-primary-weight - 100) = 400,
     letter-spacing calc(-0.01em + var(--tracking)), line-height 1.2, and —
     like the desktop panel — the FULL --fg-color, not a muted grey; only the
     weight sets it apart from the title. margin-top = .cvItem's 0.1rem gap. */
  .meta {
    font-size: var(--s-body);
    font-weight: 400;
    line-height: 1.2;
    letter-spacing: var(--track);
    color: var(--ink);
    margin-top: var(--gap-item);
  }

  /* .cvSkillsGrid, verbatim: grid-template-columns repeat(3, 1fr),
     column-gap 1rem, row-gap 0.4rem — the full-width body column here is
     about as wide as the site's .aboutPanelRight, so the same 3 tracks fit. */
  .skills {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    column-gap: calc(16px * var(--ps));
    row-gap: var(--gap-row);
  }
  .skills .title + .title { margin-top: 0; }
</style>
</head>
<body>
  <div class="page">
    <header class="masthead">
      <div class="lockup">
        <svg class="mark" viewBox="${ICON_VIEWBOX}" aria-hidden="true"><path d="${ICON_PATH}"/></svg>
        <div class="name"><span class="plain">Jose</span> <span class="pita">Pita</span></div>
      </div>
      <div class="contact">
        ${CONTACT.map((c) => `<div><a href="${esc(c.href)}">${esc(c.text)}</a></div>`).join('\n        ')}
      </div>
    </header>

    <div class="body">
      ${section('Experience', cv.experience.map(entry).join('\n'))}
      ${section('Education', cv.education.map(entry).join('\n'))}
      ${section('Skills', `<div class="skills">${cv.skills.map(row).join('\n')}</div>`)}
      ${section('Awards', cv.awards.map(row).join('\n'))}
      ${section('Languages', cv.languages.map(row).join('\n'))}
    </div>
  </div>
</body>
</html>`

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.pdf({
    path: resolve(root, 'public/JOSE_PITA_EN.pdf'),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  })
  console.log('wrote public/JOSE_PITA_EN.pdf')
} finally {
  await browser.close()
}
