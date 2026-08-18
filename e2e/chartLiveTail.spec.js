// The price chart's last point tracks the live price — and stops doing so the
// moment that candle closes.
//
// The half no unit test can reach. `chartSeries.test.js` proves the patch is
// correct given a series, a price and a clock; `ohlc.test.js` proves each point
// carries the window that makes the guard possible. Neither can know whether
// *App* wires the three together: the currency lookup, the memo, the one-shot
// bucket clock and the derived badge are all hand-written, and getting any of
// them wrong leaves a chart that renders perfectly and simply never moves —
// which is exactly the state this change exists to end, and which looked
// correct for as long as it shipped.
import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'
import { krakenOhlcResponse, paprikaTickerFixture, krakenUnknownPairResponse } from './fixtures.js'

const TIMEOUT = 10_000
const SLOW_TIMEOUT = 30_000
const HOUR_S = 3_600

// 24 hourly candles ramping 100_000 → 100_230, so the unpatched badge reads
// +0.23% and any patched value is unmistakably different.
const FIRST_CLOSE = 100_000
const LAST_CLOSE  = 100_230
// Far above every candle, so a patched series also moves the chart's own high
// reference line — which is what proves the *line* was redrawn rather than only
// the number beside it.
const LIVE_PRICE  = 110_000
// The price already in state by the time the chart first paints, from the load
// burst. Read from the fixture rather than restated, because the point of the
// first assertion is that the chart shows *this* rather than the candle close.
const SEED_PRICE  = paprikaTickerFixture.quotes.USD.price

const pct = price => `+${(((price - FIRST_CLOSE) / FIRST_CLOSE) * 100).toFixed(2)}%`

/**
 * Hourly candles whose final bucket is either still forming or already closed.
 *
 * The shared fixture cannot serve this case: it opens its last candle exactly
 * one interval ago, so that bucket closes precisely at `now` and the patch is
 * correctly inert. Here the offset is the whole point of the test.
 */
function hourlyCandles({ lastOpenedSecondsAgo }) {
  const nowS = Math.floor(Date.now() / 1000)
  const startS = nowS - lastOpenedSecondsAgo
  return Array.from({ length: 24 }, (_, i) => {
    const close = FIRST_CLOSE + i * 10
    return [
      startS - (23 - i) * HOUR_S,
      String(close - 500), String(close + 500), String(close - 800),
      String(close), String(close), '500', 1000,
    ]
  })
}

/**
 * Serve those candles for the 1D interval only, and hand a live socket back to
 * the test so a frame can be delivered on demand rather than on connect.
 *
 * Both routes are registered after `mockApis`, which Playwright matches in
 * reverse registration order; everything else — including the daily interval
 * the 200DMA shares — falls through to the shared mocks untouched.
 */
async function stubChart(page, { lastOpenedSecondsAgo }) {
  await page.route('https://api.kraken.com/0/public/OHLC*', route => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('interval') !== '60') return route.fallback()
    route.fulfill({ json: krakenOhlcResponse(hourlyCandles({ lastOpenedSecondsAgo })) })
  })

  const sockets = []
  await page.routeWebSocket('wss://ws.kraken.com/**', ws => { sockets.push(ws) })
  return {
    tick: async (price) => {
      // Every subscribed pair in one frame, which is how Kraken batches them.
      const frame = JSON.stringify({
        channel: 'ticker',
        data: [
          { symbol: 'BTC/USD', last: price,           change_pct: 1.5 },
          { symbol: 'BTC/GBP', last: price * 0.79,    change_pct: 1.5 },
          { symbol: 'BTC/EUR', last: price * 0.92,    change_pct: 1.5 },
          { symbol: 'BTC/CAD', last: price * 1.37,    change_pct: 1.5 },
          { symbol: 'BTC/CHF', last: price * 0.88,    change_pct: 1.5 },
        ],
      })
      await expect.poll(() => sockets.length, { timeout: TIMEOUT }).toBeGreaterThan(0)
      for (const ws of sockets) ws.send(frame)
    },
  }
}

const badge = page => page.getByTestId('chart-range-change')

/** The chart's own high reference line, read out of the SVG as drawn. */
async function highLine(page) {
  const texts = await page.locator('.recharts-wrapper text').allTextContents()
  return texts.find(t => t.startsWith('H: ')) ?? null
}

async function loadChart(page) {
  await page.addInitScript(() => {
    localStorage.setItem('btc-vibe-newsletter-prompted', 'true')
    // 1D, so the candles above are the ones drawn. Set before the first render,
    // which is what avoids a range switch and its 400ms debounce.
    localStorage.setItem('btc-vibe-chart-timeframe', JSON.stringify('1D'))
  })
  await page.goto('/')
  await expect(badge(page)).toBeVisible({ timeout: SLOW_TIMEOUT })
}

test.describe('the chart tracks the live price while its last candle is open', () => {
  test('moves the line and the badge when a price arrives', async ({ page }) => {
    await mockApis(page)
    // Opened half an hour ago, so the bucket has thirty minutes left to run.
    const socket = await stubChart(page, { lastOpenedSecondsAgo: HOUR_S / 2 })
    await loadChart(page)

    // Patched from the moment it paints: the price from the load burst is
    // already in state, so the last point shows that rather than the candle's
    // own close. The two are far apart on purpose — `pct(LAST_CLOSE)` is
    // +0.23%, which is what a chart frozen at fetch time would read, and it is
    // what the closed-bucket test below still gets.
    await expect(badge(page)).toContainText(pct(SEED_PRICE), { timeout: TIMEOUT })
    expect(pct(SEED_PRICE)).not.toBe(pct(LAST_CLOSE))

    await socket.tick(LIVE_PRICE)

    // And it keeps following, because the badge is derived from the drawn
    // points rather than stored when the fetch landed.
    await expect(badge(page)).toContainText(pct(LIVE_PRICE), { timeout: TIMEOUT })

    // And the series itself was redrawn, not just the number: the live price is
    // above every candle, so it becomes the high.
    await expect.poll(() => highLine(page), { timeout: TIMEOUT }).toContain('110,000')
  })

  test('leaves a closed candle alone rather than fabricating a point', async ({ page }) => {
    // The guard, in a browser. Past its bucket the same overwrite would draw a
    // later price against an earlier label — a made-up point in the shape of a
    // true one.
    await mockApis(page)
    const socket = await stubChart(page, { lastOpenedSecondsAgo: HOUR_S * 3 })
    await loadChart(page)

    // The candle's own close, untouched — even though a live price is already
    // in state and is what the open-bucket test above draws instead.
    await expect(badge(page)).toContainText(pct(LAST_CLOSE), { timeout: TIMEOUT })

    await socket.tick(LIVE_PRICE)

    // Deliberately a fixed wait: the assertion is the *absence* of a change, so
    // there is no state to poll towards. The price is on screen within this
    // window — the header's own figure proves the frame was delivered and
    // applied — so a silent no-op cannot pass for a frame that never arrived.
    await expect(page.getByTestId('price-change-24h').locator('visible=true'))
      .toContainText('+1.50%', { timeout: TIMEOUT })
    await page.waitForTimeout(500)

    await expect(badge(page)).toContainText(pct(LAST_CLOSE))
  })
})

test.describe('the patch is denominated in the chart\'s currency, not the selector\'s', () => {
  // The rule v1.14.0 and v1.18.1 both turned on, met a third time: when Kraken
  // has no market for the selection the chart falls back to dollars and *says
  // so*, and everything drawn on it has to be the dollar figure. Patching that
  // series with the franc price would put a franc number on a chart labelled
  // USD — a fabricated point, and one no unit test can see, because `App.jsx`
  // has none and the two currencies agree in every other spec.
  test('a chart that fell back to USD takes the USD price', async ({ page }) => {
    await mockApis(page)

    // CHF has no market; every other pair falls through to the shared mocks.
    await page.route('https://api.kraken.com/0/public/OHLC*', route => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('pair') !== 'XBTCHF') return route.fallback()
      route.fulfill({ json: krakenUnknownPairResponse })
    })
    // The 1D candles, for whichever pair survives that.
    await page.route('https://api.kraken.com/0/public/OHLC*', route => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('interval') !== '60') return route.fallback()
      if (url.searchParams.get('pair') === 'XBTCHF') return route.fallback()
      route.fulfill({ json: krakenOhlcResponse(hourlyCandles({ lastOpenedSecondsAgo: HOUR_S / 2 })) })
    })

    const sockets = []
    await page.routeWebSocket('wss://ws.kraken.com/**', ws => { sockets.push(ws) })

    await page.addInitScript(() => {
      localStorage.setItem('btc-vibe-newsletter-prompted', 'true')
      localStorage.setItem('btc-vibe-chart-timeframe', JSON.stringify('1D'))
    })
    await page.goto('/')
    await expect(badge(page)).toBeVisible({ timeout: SLOW_TIMEOUT })

    await page.getByLabel('Display currency').selectOption('chf')
    // The chart is in dollars and says so, which is what makes the next
    // assertion about the patch rather than about the fallback.
    await expect(page.getByTestId('chart-currency-fallback')).toBeVisible({ timeout: SLOW_TIMEOUT })

    // Two prices far apart, so which one landed is unambiguous.
    const USD = 110_000
    const CHF = 88_000
    await expect.poll(() => sockets.length, { timeout: TIMEOUT }).toBeGreaterThan(0)
    for (const ws of sockets) {
      ws.send(JSON.stringify({
        channel: 'ticker',
        data: [
          { symbol: 'BTC/USD', last: USD, change_pct: 1.5 },
          { symbol: 'BTC/CHF', last: CHF, change_pct: 2.5 },
        ],
      }))
    }

    // The dollar price, on the dollar chart. The franc figure would read
    // -12.00%, so the two cannot be confused.
    await expect(badge(page)).toContainText(pct(USD), { timeout: TIMEOUT })
    await expect(badge(page)).not.toContainText(pct(CHF))
  })
})
