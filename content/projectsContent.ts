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
  icon?:          string  // path to icon in /public/icons/
  iconLabel?:     string
  defaultFeatured?: 'video' | 'img0' | 'img1'
  thumbScale?:      number  // CSS scale applied to the thumbnail image, e.g. 1.2 for 20% zoom
}

export const projectsContent: ProjectItem[] = [
  {
    title:       'Google Gemini: Surf the Spike',
    description: `Google needed a new and creative use of their Gemini AI for students, professors or classrooms. Surf the Spike helps college students take full advantage of their late-night caffeine-filled study sessions.`,
    youtubeId:   'nf5xLDfsp5k',
    thumb:       '/projects/proj1/thumb.webp',
    images:      ['/projects/proj1/image1.webp', '/projects/proj1/image2.webp'],
    icon:        '/icons/oneShowShortlist.png',
    iconLabel:   'One Show Young Ones Merit Winner',
  },
  {
    title:       'Duolingo: Your Coolest Lesson Yet',
    description: `Duolingo's reminders need to be memorable again. Summer is the season where people use their phone the least, and without their phones, they don't see Duo's notifications. But they do eat ice cream, so we offer their coolest lesson yet.`,
    youtubeId:   'bWRIjCEHXJk',
    thumb:       '/projects/proj3/thumb.webp',
    images:      ['/projects/proj3/image1.webp', '/projects/proj3/image2.webp'],
    icon:        '/icons/MAS.png',
    iconLabel:   'Miami Ad School Scholarship Winner',
  },
  {
    title:       'giffgaff X Big Issue: Verified.',
    description: 'giffgaff partnered with Big Issue to help homeless people using the power of connectivity. The "Verified." platform allows Big Issue vendors that are homeless to get references from their clients and eventually get a job.',
    thumb:       '/projects/proj2/thumb.webp',
    youtubeId:   'HwCWeJ_ZcvQ',
    images:      ['/projects/proj2/image1.webp', '/projects/proj2/image2.webp'],
    icon:        '/icons/DNADShortlist.svg',
    iconLabel:   'D&AD New Blood Pencil Winner',
  },
  {
    title:       'Hat Twix',
    description: 'One is good, and two is better, but football fans are not really aware. They praise single goals and hat tricks, but two goals are rarely celebrated. Through football commentators, Twix honors the beauty of the two goals.',
    thumb:       '/projects/proj4/thumb.webp',
    youtubeId:   'VykD83mmSTo',
    images:      ['/projects/proj4/image1.webp', '/projects/proj4/image2.webp'],
  },
  {
    title:       'Canesten: Cottage Coocheese',
    description: 'Taboos stop society from talking about intimate health issues. Canesten used supermarkets, where bypassers look around everyday, as a platform to communicate. Through cottage cheese, known for looking like one of the most common symptoms of vaginal yeast infection.',
    youtubeId:   'gXgjxnCaRxM',
    thumb:       '/projects/proj6/thumb.webp',
    images:      ['/projects/proj6/image1.webp', '/projects/proj6/image2.webp'],
    thumbScale:  1.2,
  },
  {
    title:          'PlatanoMelón: Back in Smoothly',
    description:    'Backing in smoothly is relevant for cars, but also, for PlatanoMelón, who took over situations that go back-first to promote their relaxant lubricant.',
    youtubeId:      'ZOVg5GCUxqs',
    thumb:          '/projects/proj5/thumb.webp',
    images:         ['/projects/proj5/image1.webp', '/projects/proj5/image2.webp'],
    defaultFeatured: 'img0',
  },
]
