// #24 — the three callers that share a Kraken OHLC URL.
//
// Binance took a `limit` parameter, so every caller produced a distinct URL.
// Kraken has none, so the 1M chart, the 1Y chart and the 200-day MA series all
// resolve to `interval=1440`. `src/lib/ohlc.js` shares a request in flight.
//
// This is the half `ohlc.test.js` cannot cover: the unit tests prove the
// primitive collapses concurrent callers, but only the real app decides which
// callers actually overlap, and that is a function of the chart effect's 400ms
// debounce and the order the prefetch fires in. Asserting it here is what keeps
// the claim in the version history honest.
import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'

const TIMEOUT = 10_000

// Requests observed via page.on('request'), which fires for routed requests
// too — so this counts without displacing the fixtures in mocks.js.
function recordOhlcRequests(page) {
  const urls = []
  page.on('request', req => {
    if (req.url().includes('/0/public/OHLC')) urls.push(req.url())
  })
  return urls
}

/** Resolve once no further OHLC request has been made for `quietMs`. */
async function settle(page, urls, quietMs = 1500) {
  let seen = -1
  await expect.poll(async () => {
    const before = urls.length
    if (before === seen) return true
    seen = before
    await page.waitForTimeout(quietMs)
    return urls.length === before
  }, { timeout: TIMEOUT, message: 'OHLC requests never stopped arriving' }).toBe(true)
}

test.describe('Kraken OHLC request dedupe', () => {
  test('the shared interval=1440 URL is not fetched once per caller', async ({ page }) => {
    const urls = recordOhlcRequests(page)
    await mockApis(page)
    await page.goto('/')

    // The Vibe Score needs the 200-day series, so this waits past the caller
    // that fires at mount; settle() then waits out the chart prefetch burst.
    await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })
    await settle(page, urls)

    const daily = urls.filter(u => u.includes('interval=1440'))

    // Three callers want this URL on a cold load with the default 7D range: the
    // 200-day effect at mount, and the 1M and 1Y background prefetches. The
    // prefetches fire together, so they always collapse to one — three becomes
    // two. It can be one when the 200-day request is still in flight as the
    // prefetch starts, which is a race the debounce usually loses, so this is
    // an upper bound rather than an equality. Before the fix it was three.
    expect(daily.length).toBeGreaterThanOrEqual(1)
    expect(daily.length).toBeLessThanOrEqual(2)

    // And the sharing did not cost anyone their data: the 200-day series feeds
    // the Mayer Multiple, the 1M/1Y prefetches feed the chart toggles.
    await expect(page.getByTestId('card-cycle-indicators')).toContainText(/Mayer/i)
  })

  test('1M and 1Y keep their own window of the shared candle array', async ({ page }) => {
    // The two ranges now resolve from one shared array, sliced to different
    // lengths. A caller that mutated it instead of slicing would corrupt the
    // other, and only one of the two would look wrong — so assert the bar count
    // per range rather than merely that a chart appeared. The fixture holds 200
    // daily candles, so 1M takes its 30 and 1Y takes all 200.
    await mockApis(page)
    await page.goto('/')
    await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })

    const bars = page.locator('.recharts-bar-rectangle')
    const showRange = async (label, expected) => {
      await page.getByRole('button', { name: label, exact: true }).click()
      await expect.poll(() => bars.count(), { timeout: TIMEOUT, message: `${label} bar count` })
        .toBe(expected)
    }

    await showRange('1M', 30)
    await showRange('1Y', 200)
    // Back to 1M, served from the in-memory chart cache. Still 30 — the 1Y
    // slice did not reach back into what 1M is holding.
    await showRange('1M', 30)
  })
})
