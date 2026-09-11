'use client'

import CampaignCase, { CampaignImage as Artwork, CampaignSection as Section, type CampaignNavigation } from './CampaignCase'
import styles from './CampaignCase.module.css'

const COLOR = '#E30613'

export default function VerifiedCase(props: CampaignNavigation) {
  return <CampaignCase {...props} projectIndex={2} title="Verified." color={COLOR} ink="#ffffff" accent="#151515"
    introduction="Big Issue vendors already have people who can vouch for them: their customers. giffgaff helps turn those everyday connections into references for work.">
    <Section color={COLOR} className={styles.vendors}>
      <Artwork id="verifiedVendor1" sizes="(min-width: 700px) 30vw, 90vw" />
      <Artwork id="verifiedVendor2" sizes="(min-width: 700px) 30vw, 90vw" />
      <Artwork id="verifiedVendor3" sizes="(min-width: 700px) 30vw, 90vw" />
    </Section>
    <Section color={COLOR}><Artwork id="verifiedBillboard" /></Section>
    <Section color={COLOR} className={styles.executionPair}>
      <Artwork id="verifiedLinkedin" sizes="(min-width: 700px) 45vw, 90vw" />
      <Artwork id="verifiedBoard" sizes="(min-width: 700px) 45vw, 90vw" />
    </Section>
  </CampaignCase>
}
