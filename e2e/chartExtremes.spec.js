// The chart's high and low reference lines report what actually traded.
//
// The half no unit test can reach. `ohlc.test.js` proves each point carries its
// candle's extremes and `chartSeries.test.js` proves `chartExtremes` prefers
// them to the closes — neither can know whether the *card* asks for them. That
// derivation was inline beside the axes it configures, reading the plotted
// closes, and the result looked perfectly correct at 1D and 1Y while the 7D and
// 1M charts reported the live price as their high: a seven-day high below the
// one-day high shown on the same screen.
//
// So both cases here put the range's real high inside a candle that is neither
// the largest close nor the final point, and give the live price a value the
// card would report if it were reading the tail instead.
import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'
import { krakenOhlcResponse, paprikaTickerFixture } from './fixtures.js'

const TIMEOUT = 10_000
const SLOW_TIMEOUT = 30_000

// Closes ramp gently; the spike and the trough belong to one candle in the
// middle of the series and never become a close.
const FIRST_CLOSE = 100_000
const SPIKE_HIGH  = 120_000
const TROUGH_LOW  =  80_000
// The price already in state when the chart paints, from the load burst. It is
// above every close, so it becomes the final point — and it must not become the
// high, which is exactly what shipped.
const SEED_PRICE  = paprikaTickerFixture.quotes.USD.price

const money = n => n.toLocaleString('en-US')

/**
 * Candles whose extremes are not derivable from their closes.
 *
 * `intervalSeconds` sets both the spacing and the bucket, and the last one
 * opened half an interval ago so its bucket is still forming — which is the
 * state the bug was reported in, with the tail patched live from the socket.
 */
function candles({ intervalSeconds, count, spikeAt }) {
  const nowS = Math.floor(Date.now() / 1000)
  const lastOpenS = nowS - Math.floor(intervalSeconds / 2)
  return Array.from({ length: count }, (_, i) => {
    const close = FIRST_CLOSE + i * 10
    const spike = i === spikeAt
    return [
      lastOpenS - (count - 1 - i) * intervalSeconds,
      String(close),
      String(spike ? SPIKE_HIGH : close + 50),
      String(spike ? TROUGH_LOW : close - 50),
      String(close),
      String(close), '500', 1000,
    ]
  })
}

/** Serve those candles for one interval only; everything else falls through. */
async function stubChart(page, { interval, ...shape }) {
  await page.route('https://api.kraken.com/0/public/OHLC*', route => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('interval') !== String(interval)) return route.fallback()
    route.fulfill({ json: krakenOhlcResponse(candles({ intervalSeconds: interval * 60, ...shape })) })
  })
}

/**
 * The reference-line labels as drawn.
 *
 * Read out of the SVG rather than by test id: recharts renders a ReferenceLine's
 * label as a sibling of the line's own layer, so there is no element of ours to
 * hang one on.
 */
async function referenceLines(page) {
  const texts = await page.locator('.recharts-wrapper text').allTextContents()
  return {
    high: texts.find(t => t.startsWith('H: ')) ?? null,
    low: texts.find(t => t.startsWith('L: ')) ?? null,
  }
}

async function loadChart(page, range) {
  await page.addInitScript(([stored]) => {
    localStorage.setItem('btc-vibe-newsletter-prompted', 'true')
    // Set before the first render, which avoids a range switch and its 400ms
    // debounce.
    localStorage.setItem('btc-vibe-chart-timeframe', JSON.stringify(stored))
  }, [range])
  await page.goto('/')
  await expect(page.getByTestId('chart-range-change')).toBeVisible({ timeout: SLOW_TIMEOUT })
}

test.describe('the chart reports the range it drew, not the closes it plotted', () => {
  test('takes the 1D high and low from inside a candle', async ({ page }) => {
    await mockApis(page)
    // 24 hourly candles, the spike a third of the way in.
    await stubChart(page, { interval: 60, count: 24, spikeAt: 8 })
    await loadChart(page, '1D')

    await expect.poll(() => referenceLines(page), { timeout: TIMEOUT }).toEqual({
      high: `H: $${money(SPIKE_HIGH)}`,
      low: `L: $${money(TROUGH_LOW)}`,
    })
    // And specifically not the tail, which is where a closes-only reading lands
    // once the live price has been patched into it. Stated separately because
    // the fixture only makes the two distinguishable while this holds.
    expect(SEED_PRICE).toBeLessThan(SPIKE_HIGH)
    expect((await referenceLines(page)).high).not.toContain(money(SEED_PRICE))
  })

  test('takes the 7D high and low from inside a day it groups', async ({ page }) => {
    // The range the bug was reported on, and the one with a second chance to
    // lose the figure: 7D fetches 4-hourly candles and draws one bar a day, so
    // the extremes have to survive the grouping as well as the plotting.
    await mockApis(page)
    await stubChart(page, { interval: 240, count: 42, spikeAt: 10 })
    await loadChart(page, '7D')

    await expect.poll(() => referenceLines(page), { timeout: TIMEOUT }).toEqual({
      high: `H: $${money(SPIKE_HIGH)}`,
      low: `L: $${money(TROUGH_LOW)}`,
    })
  })
})
