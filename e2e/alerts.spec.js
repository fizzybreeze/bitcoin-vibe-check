// The one part of §3.4b no unit test can reach.
//
// `ALERT_METRICS` is a registry and both the panel and the hook derive from it,
// so adding a metric is covered by `alertRules.test.js` on both sides. What is
// *not* derived is the metrics object `App.jsx` hands the hook — `fee`, `fng`
// and `mayer` are three hand-written lines, and forgetting one leaves a metric
// that appears in the picker, accepts a threshold, shows a row and never fires.
// That failure is silent in every other suite: `App.jsx` has no unit test, and
// a rule with no reading looks identical to one that has simply not crossed.
//
// Direction inference is what makes it visible without waiting for a crossing.
// `createAlertRule` infers `below` only when it can read a current value, and
// falls back to `above` when it cannot — so a threshold set far under the
// mocked reading renders ↓ when the wiring is present and ↑ when it is not.
import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'

const TIMEOUT = 10_000

test.describe('Metric alerts', () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })
    await page.getByRole('button', { name: 'Alerts', exact: true }).click()
  })

  test('offers every metric and defaults to price', async ({ page }) => {
    const panel = page.getByRole('dialog', { name: 'Alerts' })
    for (const name of ['Price', 'Fees', 'Fear & Greed', 'Mayer']) {
      await expect(panel.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect(panel.getByRole('button', { name: 'Price', exact: true }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  // Thresholds chosen to sit under the fixtures — fastest fee 20 sat/vB, Fear &
  // Greed 72 — and under any plausible Mayer Multiple off the mocked candles.
  // Each ↓ is the reading having reached the hook from `App.jsx`.
  for (const { metric, threshold } of [
    { metric: 'Fees', threshold: '1' },
    { metric: 'Fear & Greed', threshold: '1' },
    { metric: 'Mayer', threshold: '0.01' },
  ]) {
    test(`reads a live ${metric} value when the rule is created`, async ({ page }) => {
      const panel = page.getByRole('dialog', { name: 'Alerts' })
      await panel.getByRole('button', { name: metric, exact: true }).click()
      await panel.getByRole('spinbutton').fill(threshold)
      await panel.getByRole('button', { name: 'Set' }).click()

      const row = panel.getByRole('listitem').first()
      await expect(row).toContainText(metric)
      await expect(row).toContainText('↓')
    })
  }

  test('says these are not push notifications', async ({ page }) => {
    await expect(page.getByRole('dialog', { name: 'Alerts' }))
      .toContainText(/only fire while this tab is open/i)
  })
})
