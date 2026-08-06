// Captures the dashboard as a phone sees it, so a PR can be reviewed without
// tapping through to a Vercel preview and waiting on a cold load.
//
// The image is delivered twice on purpose. `testInfo.attach` puts it in the
// Playwright HTML report, which is where you look when something is red; the
// file in `mobile-screenshots/` is uploaded as its own workflow artifact, which
// is the one you can actually find and open from a phone without unpacking a
// report bundle.
import { test } from '@playwright/test'
import { mockApis } from './mocks.js'

const TIMEOUT = 10_000
const OUTPUT = 'mobile-screenshots/dashboard.png'

test.describe('Mobile screenshot', () => {
  // Nothing to capture from the desktop project — this is the artifact that
  // makes the mobile rendering reviewable, and a second copy at 1280px would
  // just be noise in the run. Keyed on `isMobile` rather than the project name
  // because `test.skip`'s condition callback is handed fixtures only, no
  // testInfo; `isMobile` comes from the device descriptor, so it tracks the
  // projects automatically.
  test.skip(({ isMobile }) => !isMobile, 'mobile project only')

  test('captures the full dashboard at phone width', async ({ page }, testInfo) => {
    // The newsletter modal opens 5 s after a first visit and would land over
    // whatever the screenshot caught. Setting the flag the app already checks
    // suppresses it deterministically, rather than racing it.
    await page.addInitScript(() =>
      localStorage.setItem('btc-vibe-newsletter-prompted', 'true')
    )
    await mockApis(page)
    await page.goto('/')

    // Wait on the last thing to resolve rather than a fixed sleep: the Vibe
    // Score needs the Fear & Greed, MVRV and 200-day candle responses, so a
    // rendered score means the cards above and below it have real values too.
    await page.getByTestId('vibe-score').waitFor({ state: 'visible', timeout: TIMEOUT })
    await page.getByTestId('vibe-label').waitFor({ state: 'visible', timeout: TIMEOUT })
    // Let the chart's entry animation land so the capture is not mid-transition.
    await page.waitForTimeout(1_000)

    await page.screenshot({ path: OUTPUT, fullPage: true })
    await testInfo.attach('mobile-dashboard', { path: OUTPUT, contentType: 'image/png' })
  })
})
