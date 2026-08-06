// Smoke tests for the DEPLOYED site. Real upstreams, no mocks.
//
// Run: npm run test:smoke        (defaults to https://bitcoinvibecheck.com)
//      SMOKE_BASE_URL=<url> npm run test:smoke   to point at a preview
//
// Every other gate verifies the code. This verifies the thing visitors load,
// from a US-hosted runner — the vantage point that would have caught #10
// (Binance answering US jurisdictions with HTTP 451) automatically, instead of
// via a hand-run VPN test after users had already lost the chart.
//
// What is deliberately NOT asserted: MVRV. It comes from BGeometrics on a
// 15-request/day free tier and is legitimately absent some of the time. A
// smoke test that pages someone over an expected rate limit trains people to
// ignore it.
import { test, expect } from '@playwright/test'

// The two cycle metrics derived from Kraken OHLC, fetched client-side from
// whatever IP the browser has. These are the geo-block canaries: if a data
// source starts refusing the runner's jurisdiction, these blank out first.
const KRAKEN_DERIVED = ['200-Day Moving Average', 'Mayer Multiple']

// Value paragraph that follows a MetricRow's label. Structure is
// <div><p>LABEL</p><p>VALUE</p>…</div> — see CycleIndicatorsCard.
const valueAfterLabel = (page, label) =>
  page.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]')

test.describe('bitcoinvibecheck.com', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
  })

  test('the page loads and renders its heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Bitcoin Vibe Check' })).toBeVisible()
  })

  test('a live BTC price renders', async ({ page }) => {
    // CoinPaprika seeds it; the Kraken WebSocket then keeps it live. Either
    // path producing a number means the price pipeline is intact.
    await expect(page.getByText(/^\$[\d,]+$/).first()).toBeVisible()
  })

  test('Fear & Greed renders a classification', async ({ page }) => {
    await expect(
      page.getByText(/^(Extreme Fear|Fear|Neutral|Greed|Extreme Greed)$/).first()
    ).toBeVisible()
  })

  // Regression guard for #10. A geo-blocked OHLC source leaves both of these
  // showing the em-dash placeholder while the rest of the page looks healthy,
  // which is exactly why it went unnoticed in production for so long.
  for (const label of KRAKEN_DERIVED) {
    test(`${label} shows a real value, not a placeholder`, async ({ page }) => {
      const value = valueAfterLabel(page, label)
      await expect(value).toBeVisible()
      await expect(value).not.toHaveText('—')
      await expect(value).toHaveText(/\d/)
    })
  }

  test('the Vibe Score renders a 0-100 reading with a temperature label', async ({ page }) => {
    const score = page.getByTestId('vibe-score')
    await expect(score).toBeVisible()

    const value = parseInt((await score.textContent()).trim(), 10)
    expect(Number.isInteger(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThanOrEqual(100)

    await expect(page.getByTestId('vibe-label')).toHaveText(
      /^(Ice Cold|Cold|Cool|Warm|Hot|Overheated)$/
    )
  })

  test('the header reads the room rather than falling back to the tagline', async ({ page }) => {
    // "Read the room." is the fallback shown when not one dimension is
    // available — on the live site that means every upstream failed at once.
    const subtitle = page.locator('header p').first()
    await expect(subtitle).toBeVisible()
    await expect(subtitle).not.toHaveText('Read the room.')
  })
})
