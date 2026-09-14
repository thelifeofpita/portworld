'use client'

import CampaignCase, { CampaignImage as Artwork, CampaignSection as Section, type CampaignNavigation } from './CampaignCase'
import styles from './CampaignCase.module.css'
import { projectsContent } from '@/content/projectsContent'

// Twix red, straight off the project (detailBackground is gone — the gold it held
// collided with McDonald's yellow). Red needs white ink.
const COLOR = projectsContent[3].accentColor!

export default function HatTwix(props: CampaignNavigation) {
  return <CampaignCase {...props} projectIndex={3} title="Hat Twix." color={COLOR} ink="#ffffff"
    introduction="One goal is good. Two is better. Twix gives football’s two-goal performance a name worth celebrating, starting with the commentators.">
    <Section color={COLOR}>
      <Artwork id="twixLogo" className={styles.logo} sizes="(min-width: 700px) 40vw, 90vw" />
    </Section>
    <Section color={COLOR} className={styles.posters}>
      <Artwork id="twixHenry" sizes="25vw" />
      <Artwork id="twixZidane" sizes="50vw" />
      <Artwork id="twixBale" sizes="25vw" />
    </Section>
    <Section color={COLOR} className={styles.socials}>
      <Artwork id="twixSocialPsg" sizes="(min-width: 700px) 42vw, 90vw" />
      <div className={styles.tweets}>
        <Artwork id="twixTweets" sizes="(min-width: 700px) 34vw, 90vw" />
        <Artwork id="twixTweetStats" sizes="(min-width: 700px) 34vw, 90vw" />
      </div>
      <Artwork id="twixTiktok" sizes="(min-width: 700px) 16vw, 60vw" />
    </Section>
  </CampaignCase>
}
