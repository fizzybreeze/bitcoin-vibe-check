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

  // Deliberately runs with the default context permissions — no
  // `permissions: ['notifications']` grant — because the whole failure needed
  // an *unanswered* prompt. Chromium leaves a concurrent
  // `Notification.requestPermission()` unsettled, and while `handleSubmit`
  // awaited that before adding, rapid Sets lost alerts outright. jsdom cannot
  // reproduce it: it has no permission flow to leave hanging.
  //
  // This is an integration check and it goes red only against the *pair* of
  // defects — either fix alone is enough to make it green, and how many alerts
  // are lost varies with timing, which is what a race looks like. The two
  // halves are pinned individually by unit tests instead: the panel by "stores
  // every alert even when the permission prompt never resolves", the hook by
  // "issues one browser request when several callers ask at once".
  test('four rapid Sets store four alerts, prompt unanswered', async ({ page }) => {
    const panel = page.getByRole('dialog', { name: 'Alerts' })
    for (const v of ['120000', '130000', '140000', '150000']) {
      await panel.getByRole('spinbutton').fill(v)
      await panel.getByRole('button', { name: 'Set' }).click()
    }
    await expect(panel.getByRole('listitem')).toHaveCount(4)
    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('btc-vibe-price-alerts')).map(a => a.label)
    )
    expect(stored).toEqual(['$120,000', '$130,000', '$140,000', '$150,000'])
  })

  test('says these are not push notifications', async ({ page }) => {
    await expect(page.getByRole('dialog', { name: 'Alerts' }))
      .toContainText(/only fire while this tab is open/i)
  })
})

// The reported bug, in the one place it actually happened: a real browser.
//
// Permission granted, the toggle pressed, and the switch springs back to off
// with no explanation on screen and nothing in the console. `subscribe()` ended
// in a bare `catch {}`, so a browser refusing to register — the ordinary
// outcome in Brave, which ships with "Use Google services for push messaging"
// off — was indistinguishable from never having pressed the toggle.
//
// This is here rather than only in unit tests because the half no unit test can
// reach is the wiring: `pushFailReason` is a hand-written line in `App.jsx`
// beside a hand-written prop on the panel, and `App.jsx` has no unit test.
// Forget either and the hook reports the failure to nobody — the panel falls
// back to the generic push-service sentence and *looks* right, which is the
// same silent-wiring failure the fee/fng/mayer specs above exist for.
test.describe('Push that the browser refuses', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // A service worker that is ready and a push manager that refuses, which
      // is what a granted permission plus a disabled push service looks like.
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get: () => ({
          ready: Promise.resolve({
            pushManager: {
              getSubscription: () => Promise.resolve(null),
              subscribe: () => Promise.reject(Object.assign(
                new Error('Registration failed - push service not available'),
                { name: 'AbortError' }
              )),
            },
          }),
          register: () => Promise.resolve({}),
          addEventListener: () => {},
        }),
      })
      window.PushManager = function PushManager() {}
      window.Notification = function Notification() {}
      window.Notification.permission = 'granted'
      window.Notification.requestPermission = () => Promise.resolve('granted')
    })
    await mockApis(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Alerts' }).click()
  })

  test('explains itself instead of silently returning to off', async ({ page }) => {
    const panel = page.getByRole('dialog', { name: 'Alerts' })
    const toggle = panel.getByRole('button', { name: /push to this device/i })

    await expect(toggle).toBeVisible()
    await toggle.click()

    await expect(panel).toContainText(/refused to register for push/i)
    await expect(panel).toContainText(/Use Google services for push messaging/i)
  })

  test('leaves the toggle there to try again with', async ({ page }) => {
    const panel = page.getByRole('dialog', { name: 'Alerts' })
    const toggle = panel.getByRole('button', { name: /push to this device/i })

    await toggle.click()
    await expect(panel).toContainText(/refused to register for push/i)

    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(toggle).toBeEnabled()
  })

  test('never claims a closed tab is covered', async ({ page }) => {
    const panel = page.getByRole('dialog', { name: 'Alerts' })
    await panel.getByRole('button', { name: /push to this device/i }).click()
    await expect(panel).toContainText(/only fire while this tab is open/i)
    await expect(panel).not.toContainText(/even with the tab closed/i)
  })
})
