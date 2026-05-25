// ─── About content ─────────────────────────────────────────────────────────────
//
// Edit the fields below to populate the About + Contact section.
//
// Fields:
//   bio           – paragraph of text shown on the left panel
//   photo         – path to your headshot in /public (e.g. '/about/photo.webp')
//                   leave as '' to show a plain placeholder
//   email         – used for the mailto: link
//   instagram     – full URL (e.g. 'https://instagram.com/yourhandle')
//   linkedin      – full URL (e.g. 'https://linkedin.com/in/yourhandle')
//   cv            – right-panel résumé entries (add/remove rows freely)
//
// How to add a photo:
//   1. Drop your image into  public/about/
//   2. Add the path to the photos array below

export interface CvItem {
  title: string
  meta:  string
}

export interface AboutContent {
  bio:       string
  photos:    string[]
  email:     string
  instagram: string
  linkedin:  string
  cv: {
    experience:     CvItem[]
    education:      CvItem[]
    languages:      string[]
    awards: string[]
    software:       string[]
  }
}

export const aboutContent: AboutContent = {
  bio: `I don't know crap about basketball, but I remember the team of the city where I was born. They are called "Trotamundos", AKA globetrotters. So I like to think that makes me, naturally, a globetrotter too. I've dabbled in the worlds of fashion, posters, branding, motion graphics, vfx, jewelry, 3D, procedural art, and others. Now, I am trotting something more like a solar system that contains the aforementioned, or as others call it, I do art direction.`,

  photos: [
    '/about/bar-rock-hand.webp',
    '/about/festival-portapotty-selfie.webp',
    '/about/mirror-leather-jacket.webp',
    '/about/ski-resort-friends.webp',
    '/about/night-out-group.webp',
    '/about/metro-selfie-couple.webp',
    '/about/snow-forest-pose.webp',
    '/about/pokemon-store-friends.webp',
    '/about/brewery-red-light.webp',
    '/about/concert-friends-night.webp',
    '/about/club-film-thumbsup.webp',
    '/about/park-fishing-selfie.webp',
    '/about/beach-gorillaz-shirt.webp',
    '/about/madrid-carnival-friends.webp',
  ],
  email:     'thelifeofpita@outlook.com',
  instagram: 'https://www.instagram.com/thelifeofpita/',
  linkedin:  'https://www.linkedin.com/in/josedph/',

  cv: {
    experience: [
      { title: 'Creative Designer', meta: 'FutureBrand · Oct. 2025 – Mar. 2026' },
      { title: '3D Visualization Artist', meta: 'Freelance · Sep. 2022 – Sep. 2025' },
    ],
    education: [
      { title: 'Art Direction Portfolio Program', meta: 'Miami Ad School Madrid · Sep. 2025 - Present' },
      { title: 'Advertising and Public Relations Degree', meta: 'Universidad Rey Juan Carlos · Sep. 2022 - May. 2026' },
    ],
    languages:      ['Native Spanish', 'Bilingual English', 'Basic French'],
    awards: ['One Show Young Ones Merit Winner', 'D&AD New Blood Pencil Winner', 'Miami Ad School Scholarship Winner'],
    software:       ['[PLACEHOLDER]', '[PLACEHOLDER]'],
  },
}
