import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  const response = await page.goto('https://thelifeofpita.artstation.com/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)
  console.log('STATUS', response.status(), 'TITLE', await page.title())
  console.log((await page.locator('body').innerText()).slice(0,2500))
  console.log(await page.locator('a[href*="projects/"]').evaluateAll(a => a.map(el => ({ title: el.textContent, href: el.href, image: el.querySelector('img')?.src }))))
} finally { await browser.close() }
