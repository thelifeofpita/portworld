// ─── Projects content ─────────────────────────────────────────────────────────
//
// Each entry maps to one project card (top-left, bottom-left, top-right, bottom-right).
// Edit the fields below to populate the expanded detail view.
//
// Fields:
//   title       – large heading in the left column
//   description – body text in the left column
//   youtubeId   – the video ID from the YouTube URL
//                 e.g. for https://www.youtube.com/watch?v=dQw4w9WgXcQ → 'dQw4w9WgXcQ'
//                 leave as '' to hide the video slot
//   images      – exactly 2 paths to images in /public (e.g. '/projects/proj1/01.jpg')
//                 leave a slot as '' to show a placeholder
//   thumb       – thumbnail shown on the card in the main view
//                 leave as '' to show a plain placeholder
//
// How to add images for a project:
//   1. Create a folder:  public/projects/proj1/
//   2. Drop your images there (JPG/PNG/WebP, ≤ 1920px wide recommended)
//   3. Set thumb: '/projects/proj1/thumb.jpg'
//      and images: ['/projects/proj1/01.jpg', '/projects/proj1/02.jpg']

export interface ProjectItem {
  title:          string
  description:    string
  youtubeId:      string
  images:         [string, string]
  thumb?:         string
  thumbModel?:    string  // path to a .glb in /public — renders a live-rotating 3D model on the card instead of thumb
  bigModel?:      boolean // renders as a large, cursor-following in-scene 3D display instead of a card (see InSceneProjectModel) — thumbModel doubles as its source
  // Static capture of the live 3D model (see scripts/capture-mobile-project-
  // thumbs.mjs + process-mobile-project-thumbs.mjs), pre-trimmed to its own
  // content with a transparent background. Mobile's Projects grid renders
  // this instead of a live InSceneProjectModel — 6 simultaneous WebGL
  // renders with shadows/env-mapping is real weight to carry through a
  // scrolling page; desktop is untouched and keeps the live model.
  mobileThumb?:   string
  // The captured image's width as a % of its grid slot's width — MEASURED
  // at capture time (crop's CSS width ÷ the slot it was shot from, see
  // process-mobile-project-thumbs.mjs), not a formula or hand tuning. This
  // is exactly how wide the live 3D model actually rendered relative to its
  // slot, so displaying the static image at this same width (height:auto,
  // preserving its own aspect ratio) reproduces the live size exactly.
  mobileThumbWidthPct?: number
  // The capture's own aspect ratio (width ÷ height), also measured by
  // process-mobile-project-thumbs.mjs. Combined with mobileThumbWidthPct it
  // gives the thumb's rendered HEIGHT as a fraction of its square slot
  // (widthPct ÷ aspect — up to 134% for Hat Twix), which is what the grid
  // needs in order to leave each piece enough room not to collide with its
  // neighbours. Also gives the <img> an intrinsic ratio so it reserves the
  // right box before it decodes.
  mobileThumbAspect?: number
  // Two-width responsive set (half and full) emitted by the same script, so a
  // small phone doesn't download pixels it can't resolve — at full size the six
  // thumbs come to ~480KB. mobileThumb stays the fallback src.
  mobileThumbSrcSet?: string
  // The full-size crop's real pixel dimensions. Gives the <img> an intrinsic
  // ratio so it reserves the right box before it decodes.
  mobileThumbWidth?: number
  mobileThumbHeight?: number
  bigModelBaseRotationYDeg?: number // fixed yaw offset (added to the cursor-tilt rotation) — for a multi-object scene authored front/back rather than side-by-side, a straight-on view can fully hide one object behind another
  icon?:          string  // path to icon in /public/icons/
  iconLabel?:     string
  defaultFeatured?: 'video' | 'img0' | 'img1'
  thumbScale?:      number  // CSS scale applied to the thumbnail image, e.g. 1.2 for 20% zoom
  accentColor?:     string  // brand color for the 3D card mode's extruded frame (debug menu)
  detailBackground?: string // custom page background when different from the model accent
  customLayout?:    'backInSmoothly' | 'surfTheSpike' | 'pickASide' | 'hatTwix' | 'duolingo' | 'verified'
}

export const projectsContent: ProjectItem[] = [
  {
    title:       'Google Gemini: Surf the Spike.',
    description: `Google needed a new and creative use of their Gemini AI for students, professors or classrooms. Surf the Spike helps college students take full advantage of their late-night caffeine-filled study sessions.`,
    youtubeId:   'nf5xLDfsp5k',
    thumb:       '/projects/proj1/thumb.webp',
    thumbModel:  '/generated/surfthespike-phone-3f870e359f6d.glb',
    bigModel:    true,
    mobileThumb: '/projects/mobile-thumbs/surf-the-spike-2a12c67849ca.webp',
    mobileThumbWidthPct: 47.1,
    mobileThumbAspect: 0.612,
    mobileThumbSrcSet: '/projects/mobile-thumbs/surf-the-spike-2a12c67849ca@half.webp 171w, /projects/mobile-thumbs/surf-the-spike-2a12c67849ca.webp 341w',
    mobileThumbWidth: 341,
    mobileThumbHeight: 557,
    bigModelBaseRotationYDeg: 0, // Blender's authored front view, after glTF's Z-up → Y-up conversion
    images:      ['/projects/proj1/image1.webp', '/projects/proj1/image2.webp'],
    icon:        '/icons/oneShowShortlist.png',
    iconLabel:   'One Show Young Ones Merit Winner',
    accentColor: '#4285F4', // matches SurfTheSpike.module.css's page background exactly
    customLayout: 'surfTheSpike',
  },
  {
    title:       'Duolingo: Your Coolest Lesson Yet.',
    description: `Duolingo's reminders need to be memorable again. Summer is the season where people use their phone the least, and without their phones, they don't see Duo's notifications. But they do eat ice cream, so we offer their coolest lesson yet.`,
    youtubeId:   'bWRIjCEHXJk',
    thumb:       '/projects/proj3/thumb.webp',
    thumbModel:  '/models/duolingo.glb',
    bigModel:    true,
    mobileThumb: '/projects/mobile-thumbs/duolingo-a8662a5f661e.webp',
    mobileThumbWidthPct: 60.9,
    mobileThumbAspect: 0.792,
    mobileThumbSrcSet: '/projects/mobile-thumbs/duolingo-a8662a5f661e@half.webp 221w, /projects/mobile-thumbs/duolingo-a8662a5f661e.webp 441w',
    mobileThumbWidth: 441,
    mobileThumbHeight: 557,
    images:      ['/projects/proj3/image1.webp', '/projects/proj3/image2.webp'],
    icon:        '/icons/MAS.png',
    iconLabel:   'Miami Ad School Scholarship Winner',
    accentColor: '#58CC02',
    customLayout: 'duolingo',
  },
  {
    title:       'giffgaff X Big Issue: Verified.',
    description: 'giffgaff partnered with Big Issue to help homeless people using the power of connectivity. The "Verified." platform allows Big Issue vendors that are homeless to get references from their clients and eventually get a job.',
    thumb:       '/projects/proj2/thumb.webp',
    thumbModel:  '/models/verified-magazine-c39b9a5102.glb',
    bigModel:    true,
    mobileThumb: '/projects/mobile-thumbs/verified-20c6c94c5cca.webp',
    mobileThumbWidthPct: 57,
    mobileThumbAspect: 0.787,
    mobileThumbSrcSet: '/projects/mobile-thumbs/verified-20c6c94c5cca@half.webp 207w, /projects/mobile-thumbs/verified-20c6c94c5cca.webp 413w',
    mobileThumbWidth: 413,
    mobileThumbHeight: 525,
    youtubeId:   'HwCWeJ_ZcvQ',
    images:      ['/projects/proj2/image1.webp', '/projects/proj2/image2.webp'],
    icon:        '/icons/DNADShortlist.svg',
    iconLabel:   'D&AD New Blood Pencil Winner',
    accentColor: '#E30613', // Big Issue red
    customLayout: 'verified',
  },
  {
    title:       'Hat Twix.',
    description: 'One is good, and two is better, but football fans are not really aware. They praise single goals and hat tricks, but two goals are rarely celebrated. Through football commentators, Twix honors the beauty of the two goals.',
    thumb:       '/projects/proj4/thumb.webp',
    thumbModel:  '/models/hat-twix.glb',
    bigModel:    true,
    mobileThumb: '/projects/mobile-thumbs/hat-twix-e802f1dcc68a.webp',
    mobileThumbWidthPct: 54.6,
    mobileThumbAspect: 0.75,
    mobileThumbSrcSet: '/projects/mobile-thumbs/hat-twix-e802f1dcc68a@half.webp 198w, /projects/mobile-thumbs/hat-twix-e802f1dcc68a.webp 395w',
    mobileThumbWidth: 395,
    mobileThumbHeight: 527,
    youtubeId:   'VykD83mmSTo',
    images:      ['/projects/proj4/image1.webp', '/projects/proj4/image2.webp'],
    accentColor: '#ED1C24', // Twix red
    detailBackground: '#F4C145',
    customLayout: 'hatTwix',
  },
  {
    title:       "McDonald's: Pick a Side.",
    description: "For the US midterm elections, McDonald's turned its side menu into a ballot — every order a vote, tallied live, state by state.",
    youtubeId:   'C9xKzRLujqs',
    thumb:       '/projects/proj6/thumb.webp',
    thumbModel:  '/models/pick-a-side-fries-50656e5e9f.glb',
    bigModel:    true,
    mobileThumb: '/projects/mobile-thumbs/pick-a-side-44831653db79.webp',
    mobileThumbWidthPct: 56.2,
    mobileThumbAspect: 0.834,
    mobileThumbSrcSet: '/projects/mobile-thumbs/pick-a-side-44831653db79@half.webp 204w, /projects/mobile-thumbs/pick-a-side-44831653db79.webp 407w',
    mobileThumbWidth: 407,
    mobileThumbHeight: 488,
    // Posters, not the old order/checkout animated webps. This page uses a
    // customLayout, so `images` is never rendered here — but mobileWarmup.ts
    // prefetches every entry's `images`, and those two webps were 740KB of
    // animation downloaded on warm-up for something nothing displays.
    images:      ['/projects/proj6/order-poster.jpg', '/projects/proj6/checkout-poster.jpg'],
    accentColor: '#FFC72C', // matches PickASide.module.css's page background exactly
    customLayout: 'pickASide',
  },
  {
    title:          'PlatanoMelón: Back in smoothly.',
    thumbModel:     '/models/back-in-smoothly-monitor.glb?v=3',
    bigModel:       true,
    mobileThumb:    '/projects/mobile-thumbs/back-in-smoothly-6531e83c3051.webp',
    mobileThumbWidthPct: 72,
    mobileThumbAspect: 1.155,
    mobileThumbSrcSet: '/projects/mobile-thumbs/back-in-smoothly-6531e83c3051@half.webp 261w, /projects/mobile-thumbs/back-in-smoothly-6531e83c3051.webp 521w',
    mobileThumbWidth: 521,
    mobileThumbHeight: 451,
    description:    'Backing in smoothly is relevant for cars, but also, for PlatanoMelón, who took over situations that go back-first to promote their relaxant lubricant.',
    youtubeId:      'ZOVg5GCUxqs',
    thumb:          '/projects/proj5/thumb.webp',
    images:         ['/projects/proj5/image1.webp', '/projects/proj5/image2.webp'],
    defaultFeatured: 'img0',
    accentColor:     '#FFE500', // matches the custom detail page's background exactly
    customLayout:    'backInSmoothly',
  },
]
