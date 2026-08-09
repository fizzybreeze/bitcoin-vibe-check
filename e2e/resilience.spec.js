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

  test('blanks the CoinPaprika-only figures rather than breaking them', async ({ page }) => {
    // Volume and dominance have no second source and correctly go blank (the
    // market cap does, and is covered below). The risk is not that they are
    // missing — it is that the arithmetic
    // around them (every fiat volume divides by priceUsd) reaches the DOM as
    // NaN or Infinity instead. An earlier version of this spec was named for
    // volume surviving, which it cannot and does not: it asserted only the
    // price, so the name claimed more than the test checked.
    await mockApis(page)
    await breakSource(page, 'https://api.coinpaprika.com/v1/tickers/btc-bitcoin')
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto('/')

    await expect(page.getByText(/\$104,500/).first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('body')).not.toContainText('NaN')
    await expect(page.locator('body')).not.toContainText('Infinity')
    await expect(page.locator('body')).not.toContainText('undefined')
    expect(errors).toEqual([])
  })

  test('keeps sats per fiat when CoinPaprika is down', async ({ page }) => {
    // Sats per fiat needs only the price, which Kraken now supplies — but it
    // lived inside the VolumeCard's `volume != null` wrapper, so it vanished
    // with the volume anyway. A unit test proves the card renders it; only the
    // app proves the card is *reached* in that state.
    await mockApis(page)
    await breakSource(page, 'https://api.coinpaprika.com/**')
    await page.goto('/')

    // 104500 USD → 1e8 / 104500 ≈ 957 sats per $1.
    await expect(page.getByText(/957\s+sats per \$1/)).toBeVisible({ timeout: 15000 })
  })

  test('derives a market cap when CoinPaprika is down, and says so', async ({ page }) => {
    // 897,000 blocks is 19,865,628.125 BTC issued; at Kraken's 104,500 that is
    // ~$2.1T. The label is asserted rather than the number because both sources
    // round to $2.1T — an unlabelled figure here would be indistinguishable
    // from CoinPaprika's having answered after all.
    await mockApis(page)
    await breakSource(page, 'https://api.coinpaprika.com/**')
    await page.goto('/')

    // Attached rather than visible: the line is `hidden md:block`, so it is in
    // the DOM at both viewports and painted only on desktop. The wiring is what
    // this spec is for, and asserting visibility would make it a desktop-only
    // test wearing a mobile project's name.
    await expect(page.getByText(/Mkt cap \$2\.1T · est\. from issued supply/))
      .toBeAttached({ timeout: 15000 })
  })

  test('never caches the derived market cap, so it cannot resurface unlabelled', async ({ page }) => {
    // `btc-cache` carries no provenance, and its whole job is to survive into a
    // later visit — so a stored estimate would come back one day with nothing
    // to say it was one, which is exactly the failure the label exists to
    // prevent. Only the app can show this: the rule lives in `writeCache`,
    // which no unit test reaches.
    await mockApis(page)
    await breakSource(page, 'https://api.coinpaprika.com/**')
    await page.goto('/')
    await expect(page.getByText(/est\. from issued supply/)).toBeAttached({ timeout: 15000 })

    // Second visit, with the chain tip gone too. The estimate can no longer be
    // recomputed, so the only way a market cap appears now is out of the cache.
    await breakSource(page, 'https://mempool.space/api/blocks/tip/height')
    await page.reload()
    await expect(page.getByText(/Network Fees/i).first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Mkt cap/)).toHaveCount(0)
  })

  test('survives a zero-price tick on the Kraken socket', async ({ page }) => {
    // The socket is the one upstream that *replaces* a price already on
    // screen, so a bad frame is worse than a failed fetch. A `last` of 0 used
    // to reach `VolumeCard`, where `computeSatsPerFiat(0)` is null and the card
    // dereferenced it; a non-numeric `change_pct` reaches `change.toFixed(2)`
    // in `BtcPriceCard`, which throws on a string. With no error boundary in
    // this app, either took the whole dashboard rather than one card.
    //
    // Unit tests pin both ends of that chain. Only this shows the app is wired
    // to the screening at all — the half that was actually wrong before.
    await mockApis(page)
    let socket = null
    // Registered after mockApis, so it wins over the close-immediately route.
    // Never connects upstream: every frame below is composed here.
    await page.routeWebSocket('wss://ws.kraken.com/**', ws => { socket = ws })

    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto('/')

    // The frame has to arrive *after* the initial load, not before: `setData`
    // is a `prev => prev ? … : prev` updater, so anything sent while state is
    // still null is dropped on the floor and proves nothing. The socket opens
    // long before `loadData` resolves, which is why sending from inside the
    // route handler made an earlier draft of this test vacuous.
    await expect(page.getByText(/\$105,000/).first()).toBeVisible({ timeout: 15000 })
    expect(socket, 'the page never opened the Kraken socket').not.toBeNull()

    socket.send(JSON.stringify({
      channel: 'ticker',
      data: [{ symbol: 'BTC/USD', last: 0, change_pct: 'nonsense' }],
    }))

    // A fixed wait, deliberately, and the one case where it is the right tool:
    // what is being asserted is the *absence* of a breakage, and a screened
    // frame changes nothing observable, so there is no state to wait for. An
    // earlier draft chased a good frame behind the bad one and awaited that —
    // which proved nothing, because React batches two frames delivered in the
    // same tick into one render and the bad intermediate state never painted.
    // A render is ~16ms; this is two orders of magnitude of headroom.
    await page.waitForTimeout(500)

    // Everything still standing means the frame was dropped rather than
    // applied. Under the old code `priceUsd` became 0 and `priceChange24h`
    // became the string "nonsense", either of which throws during render and
    // unmounts the tree — so these locators are gone, not merely wrong.
    await expect(page.getByText(/\$105,000/).first()).toBeVisible()
    await expect(page.getByText(/sats per \$1/)).toBeVisible()
    await expect(page.locator('body')).not.toContainText('NaN')
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
