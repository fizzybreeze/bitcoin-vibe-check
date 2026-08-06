// Visual regression at the mobile viewport.
//
// This covers the failure mode nothing else does: a Tailwind class change that
// wrecks the mobile layout passes every text assertion in the suite, and is
// invisible in a diff on a 6-inch screen. Both review paths are blind to it at
// the same time. The v1.4 Cycle Indicators alignment bug, the ghost divider
// borders and the genesis hash triggering horizontal scroll were all this shape.
//
// Only structurally fragile cards are snapshotted — four, not seventeen — since
// every baseline is a maintenance cost paid on each intentional design change.
// Regenerate them with the `update-visual-baselines` label on a PR (see
// .github/workflows/visual-baselines.yml); do NOT run --update-snapshots
// locally, because the baselines are pixel-compared against CI's font
// rendering, not this machine's.
import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'

const TIMEOUT = 10_000

// A fixed instant, so nothing time-derived can churn a baseline. Three separate
// things in these cards read the clock: the Power Law fair value (a function of
// days since the genesis block, so it drifts *every day*), the "N min ago" on
// the latest block, and the header's "Updated HH:MM". Without this the Cycle
// Indicators baseline would go stale overnight, every night.
const FROZEN_NOW = new Date('2026-08-01T12:00:00.000Z')

// The cards worth pinning, keyed by the testid on their root element.
const CARDS = [
  ['cycle-indicators', 'card-cycle-indicators'],
  ['network-pulse', 'card-network-pulse'],
  ['btc-price', 'card-btc-price'],
  ['recent-blocks', 'card-recent-blocks'],
]

test.describe('Visual regression (mobile)', () => {
  test.beforeEach(async ({ page }) => {
    // setFixedTime rather than install/pauseAt: it pins Date.now() while
    // leaving setTimeout and setInterval running, so the app's own load path is
    // untouched. Pausing the timers risks the page never finishing its render
    // for reasons that have nothing to do with layout.
    await page.clock.setFixedTime(FROZEN_NOW)
    await page.addInitScript(() =>
      localStorage.setItem('btc-vibe-newsletter-prompted', 'true')
    )
    await mockApis(page, { nowMs: FROZEN_NOW.getTime() })
    await page.goto('/')
    // The Vibe Score is the last thing to resolve, so a rendered score means
    // every card below it has real values rather than skeletons.
    await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })
  })

  for (const [name, testId] of CARDS) {
    test(`${name} card matches its baseline`, async ({ page }) => {
      const card = page.getByTestId(testId)
      await expect(card).toBeVisible({ timeout: TIMEOUT })
      // Component-level rather than full-page, so an unrelated change to one
      // card does not churn the other three baselines.
      await expect(card).toHaveScreenshot(`${name}.png`, {
        // Absorbs subpixel antialiasing without absorbing a layout break: a
        // broken grid moves whole blocks of pixels, far past this threshold.
        maxDiffPixelRatio: 0.01,
      })
    })
  }
})
