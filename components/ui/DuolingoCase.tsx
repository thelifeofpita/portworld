'use client'

import CampaignCase, { CampaignImage as Artwork, CampaignSection as Section, type CampaignNavigation } from './CampaignCase'
import styles from './CampaignCase.module.css'
import CampaignLoop from './CampaignLoop'

const COLOR = '#58CC02'

export default function DuolingoCase(props: CampaignNavigation) {
  return <CampaignCase {...props} projectIndex={1} title="Your Coolest Lesson Yet." color={COLOR}
    introduction="Summer takes us away from our phones, and away from Duo’s reminders. So Duolingo puts the next lesson somewhere we’ll find it: on an ice cream stick.">
    <Section color={COLOR} className={styles.pair}>
      <CampaignLoop id="iceCream" />
      <CampaignLoop id="sticks" />
    </Section>
    <Section color={COLOR} className={styles.stills}>
      <div className={styles.stillCrop} data-duo-crop="duoProduct">
        <Artwork id="duoProduct" sizes="(min-width: 700px) 60vw, 160vw" />
      </div>
      <div className={styles.stillCrop} data-duo-crop="duoReminder">
        <Artwork id="duoReminder" sizes="(min-width: 700px) 60vw, 160vw" />
      </div>
      <div className={styles.stillCrop} data-duo-crop="duoItalian">
        <Artwork id="duoItalian" sizes="(min-width: 700px) 60vw, 160vw" />
      </div>
      <div className={styles.stillCrop} data-duo-crop="duoFrench">
        <Artwork id="duoFrench" sizes="(min-width: 700px) 60vw, 160vw" />
      </div>
      <div className={styles.stillCrop} data-duo-crop="duoSpanish">
        <Artwork id="duoSpanish" sizes="(min-width: 700px) 60vw, 160vw" />
      </div>
      <div className={styles.stillCrop} data-duo-crop="duoWinner">
        <Artwork id="duoWinner" sizes="(min-width: 700px) 60vw, 160vw" />
      </div>
    </Section>
  </CampaignCase>
}
