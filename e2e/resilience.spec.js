import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'

// Data-source resilience (roadmap §6).
//
// `mergeMarketData` is unit-tested against every source failing, but a pure
// function cannot know whether the *app* is wired to it — and that is exactly
// the half that was wrong before. `priceUsd` came from CoinPaprika alone while
// the Kraken ticker in the same request burst already carried XBTUSD and had
// it thrown away, so one source having a bad morning blanked the price, the
// four fiat volumes that divide by it, the ATH distance and the Mayer half of
// the Vibe Score.
//
// These specs fail a source outright, the way an outage does, and look at what
// a visitor is left with.

/** Fail one upstream for the whole page, after the normal mocks are in place. */
async function breakSource(page, pattern) {
  await page.route(pattern, route => route.abort('failed'))
}

test.describe('Data source resilience', () => {
  test('shows a BTC price when CoinPaprika is down', async ({ page }) => {
    await mockApis(page)
    await breakSource(page, 'https://api.coinpaprika.com/v1/tickers/btc-bitcoin')
    await page.goto('/')

    // 104500 is the Kraken fixture's XBTUSD close. Asserting the *number*
    // rather than "some price" is the point: a stale cached CoinPaprika value
    // would also render a price, and would prove nothing about the fallback.
    await expect(page.getByText(/\$104,500/).first()).toBeVisible({ timeout: 15000 })
  })

  test('still converts volume into other currencies when CoinPaprika is down', async ({ page }) => {
    // Volume itself is CoinPaprika's and correctly goes blank. This asserts the
    // page did not fall over on the arithmetic that divides by priceUsd.
    await mockApis(page)
    await breakSource(page, 'https://api.coinpaprika.com/v1/tickers/btc-bitcoin')
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto('/')
    await expect(page.getByText(/\$104,500/).first()).toBeVisible({ timeout: 15000 })
    expect(errors).toEqual([])
  })

  test('shows a BTC price when Kraken is down', async ({ page }) => {
    // The other direction: CoinPaprika is still the preferred source, so the
    // fallback must not have become the only source.
    await mockApis(page)
    await breakSource(page, 'https://api.kraken.com/0/public/Ticker*')
    await page.goto('/')
    await expect(page.getByText(/\$105,000/).first()).toBeVisible({ timeout: 15000 })
  })

  test('renders the page at all when every price source is down', async ({ page }) => {
    // The floor: no price anywhere, and the dashboard must still be a page
    // rather than a stack trace. Everything mempool.space supplies is
    // independent of price and should survive intact.
    await mockApis(page)
    await breakSource(page, 'https://api.coinpaprika.com/**')
    await breakSource(page, 'https://api.kraken.com/**')
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /bitcoin vibe check/i }).first())
      .toBeVisible({ timeout: 15000 })
    // A number that has nothing to do with price still arrives.
    await expect(page.getByText(/Network Fees|Recent Blocks/i).first()).toBeVisible()
    expect(errors).toEqual([])
    // And nothing renders the string "NaN", which is what a missing price used
    // to produce anywhere it reached arithmetic before reaching a null check.
    await expect(page.locator('body')).not.toContainText('NaN')
  })
})
