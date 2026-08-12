// The price chart follows the currency selector — and says so honestly when it
// cannot.
//
// This is the half no unit test can reach. `chartSeries.test.js` proves the
// fetch asks for the right pair and reports the right currency, and
// `PriceChartCard.test.jsx` proves the card renders whichever currency it is
// handed. Neither can know whether *App* wires the two together: the store's key
// gained the currency, the effect gained a dependency on it, and the card gained
// a prop, and forgetting any one of those leaves the chart rendering perfectly
// while showing dollars under another currency's name — which is precisely the
// defect this replaced, and it looked correct.
//
// The fixtures answer each pair at its own price level (`PAIR_BASE_PRICE`), so
// these assert the *numbers on the chart* changed rather than only the label.
import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'
import { krakenUnknownPairResponse, krakenEmptySeriesResponse, PAIR_BASE_PRICE } from './fixtures.js'

const TIMEOUT = 10_000
// A currency switch costs a 400ms debounce plus a fetch, on top of whatever the
// dev server is doing for the specs running beside this one.
const SLOW_TIMEOUT = 30_000

const chartHeading = page => page.getByRole('heading', { level: 2, name: /^Price · / })

async function selectCurrency(page, code) {
  await page.getByLabel('Display currency').selectOption(code)
}

/**
 * The chart's own high reference line, as it is drawn.
 *
 * Read out of the SVG rather than matched against a literal, because the two
 * halves are asserted separately: the symbol says which currency the axis is
 * labelled in, and the number says which pair the candles came from. A relabelled
 * dollar chart passes the first and fails the second, and that is the whole
 * failure being guarded against.
 */
async function highReferenceLabel(page) {
  // Every `<text>` in the chart, filtered by prefix: recharts renders a
  // ReferenceLine's label as a sibling of the line's own layer rather than
  // inside it, so selecting on `.recharts-reference-line` finds nothing.
  const texts = await page.locator('.recharts-wrapper text').allTextContents()
  return texts.find(t => t.startsWith('H: ')) ?? null
}

/** Assert the high line is drawn in `symbol` at the price level `pair` trades at. */
async function expectHighLine(page, symbol, pair) {
  // `toContain` rather than a regex, because two of the five symbols are not one
  // character (`C$`, `Fr.`) and both carry characters a regex would read.
  await expect
    .poll(async () => (await highReferenceLabel(page)) ?? '',
      { timeout: SLOW_TIMEOUT, message: `high line in ${symbol}` })
    .toContain(`H: ${symbol}`)

  // Bounds derived from the fixture rather than restated: it ramps 200 candles
  // by 10 off the pair's base, so any window of it lands inside this band — and
  // no two pairs' bands overlap.
  const drawn = Number((await highReferenceLabel(page)).replace(/\D/g, ''))
  expect(drawn).toBeGreaterThanOrEqual(PAIR_BASE_PRICE[pair])
  expect(drawn).toBeLessThan(PAIR_BASE_PRICE[pair] + 2_100)
}

async function waitForChart(page) {
  await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })
  await expect.poll(() => page.locator('.recharts-bar-rectangle').count(), { timeout: SLOW_TIMEOUT })
    .toBeGreaterThan(0)
}

test.describe('the price chart follows the selected currency', () => {
  // The newsletter modal opens five seconds into a first visit and covers the
  // chart. Several tests here switch currency and then reach for the plot area,
  // which straddles that threshold — the tooltip case failed on a `<p>` inside
  // the modal rather than on anything about the chart. Suppressed the way
  // `screenshot.spec.js` and `visual.spec.js` do.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('btc-vibe-newsletter-prompted', 'true')
    )
  })

  test('redraws from that currency’s Kraken pair', async ({ page }) => {
    const pairs = []
    page.on('request', req => {
      const url = req.url()
      if (url.includes('/0/public/OHLC')) pairs.push(new URL(url).searchParams.get('pair'))
    })

    await mockApis(page)
    await page.goto('/')
    await waitForChart(page)
    await expect(chartHeading(page)).toHaveText(/USD/)

    await selectCurrency(page, 'gbp')

    // The request actually went to the GBP market...
    await expect.poll(() => pairs.includes('XBTGBP'), { timeout: SLOW_TIMEOUT }).toBe(true)
    // ...the heading names it...
    await expect(chartHeading(page)).toHaveText(/GBP/, { timeout: SLOW_TIMEOUT })
    // ...and the reference line carries both the symbol and the GBP price level.
    // Asserting the value is what separates a redrawn chart from a relabelled
    // one: the USD fixture trades near 100k and GBP near 79k.
    await expectHighLine(page, '£', 'XBTGBP')

    // The y-axis ticks too. They are a separate `tickFormatter` from the
    // reference-line labels, so one can be converted and the other left in
    // dollars — a chart with a pound high line over a dollar axis.
    await expect
      .poll(async () => (await page.locator('.recharts-wrapper text').allTextContents())
        .filter(t => /k$/.test(t)).join(' '),
        { timeout: SLOW_TIMEOUT, message: 'y-axis ticks' })
      .toMatch(/£\d+k/)

    // Nothing to explain away: the chart is in the currency that was asked for.
    await expect(page.getByTestId('chart-currency-fallback')).toHaveCount(0)
  })

  test('quotes the hovered point in that currency too', async ({ page, hasTouch }) => {
    // The tooltip is the one mark that is only drawn on hover, so it is the one
    // that can stay pinned to dollars while every visible label follows the
    // selector. Desktop only, for the reason `crt.spec.js` records: recharts
    // produces no tooltip under touch emulation at all.
    test.skip(hasTouch, 'recharts shows no tooltip under touch emulation')

    await mockApis(page)
    await page.goto('/')
    await waitForChart(page)
    await selectCurrency(page, 'gbp')
    await expect(chartHeading(page)).toHaveText(/GBP/, { timeout: SLOW_TIMEOUT })
    // Wait for the redrawn chart before reaching for it. The heading flips in
    // the commit the new series lands in, while `ResponsiveContainer` still has
    // to measure itself — hovering into that gap fires the one mousemove at a
    // chart that re-renders immediately afterwards and drops the active point.
    await expect.poll(() => page.locator('.recharts-bar-rectangle').count(), { timeout: SLOW_TIMEOUT })
      .toBeGreaterThan(0)

    const box = await page.locator('.recharts-surface').first().boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    // A second move a few pixels along, so a render landing between the two
    // cannot swallow the hover entirely.
    await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2)

    const tooltip = page.locator('.recharts-tooltip-wrapper')
    await expect(tooltip).toBeVisible({ timeout: SLOW_TIMEOUT })
    await expect(tooltip.getByText(/^£[\d,]+/)).toBeVisible({ timeout: SLOW_TIMEOUT })
  })

  test('warms the other ranges in the currency on screen', async ({ page }) => {
    // The background prefetch takes the currency as well as the range. Warming
    // dollars behind a GBP chart is not a wrong reading — the store would miss
    // and refetch correctly — but it makes every range toggle after a currency
    // switch pay for a request that was supposed to be waiting, which is the
    // cost #41 was about.
    const pairs = []
    page.on('request', req => {
      const url = req.url()
      if (url.includes('/0/public/OHLC')) pairs.push(new URL(url).searchParams.get('pair'))
    })

    await mockApis(page)
    await page.goto('/')
    await waitForChart(page)

    await selectCurrency(page, 'cad')
    await expect(chartHeading(page)).toHaveText(/CAD/, { timeout: SLOW_TIMEOUT })

    // Two intervals cover the three non-active ranges — 1M and 1Y share the
    // daily URL — so wait for the pair to have been asked for both.
    await expect
      .poll(() => pairs.filter(p => p === 'XBTCAD').length, { timeout: SLOW_TIMEOUT })
      .toBeGreaterThanOrEqual(2)

    // And the toggle it warmed is served without going back to the network.
    const before = pairs.length
    await page.getByRole('button', { name: '1Y', exact: true }).click()
    await expectHighLine(page, 'C$', 'XBTCAD')
    expect(pairs.length).toBe(before)
  })

  test('keeps the currencies together when the range changes', async ({ page }) => {
    // The store is keyed by range *and* currency. Keyed by range alone, this
    // toggle would be answered by the USD candles cached at mount — a chart that
    // silently reverts to dollars one click after the currency switch worked.
    await mockApis(page)
    await page.goto('/')
    await waitForChart(page)

    await selectCurrency(page, 'eur')
    await expectHighLine(page, '€', 'XBTEUR')

    await page.getByRole('button', { name: '1Y', exact: true }).click()
    await expect(chartHeading(page)).toHaveText(/EUR/, { timeout: SLOW_TIMEOUT })
    await expectHighLine(page, '€', 'XBTEUR')
  })

  test('falls back to dollars, and says why, when Kraken has no such market', async ({ page }) => {
    await mockApis(page)
    // Registered after mockApis, so it wins — Playwright matches the most
    // recently added route first.
    await page.route('https://api.kraken.com/0/public/OHLC*', route => {
      const pair = new URL(route.request().url()).searchParams.get('pair')
      if (pair !== 'XBTCHF') return route.fallback()
      route.fulfill({ json: krakenUnknownPairResponse })
    })

    await page.goto('/')
    await waitForChart(page)
    await selectCurrency(page, 'chf')

    // The heading names what the candles are, never what was selected.
    await expect(chartHeading(page)).toHaveText(/USD/, { timeout: SLOW_TIMEOUT })
    await expect(page.getByTestId('chart-currency-fallback'))
      .toHaveText(/No Kraken CHF market · chart in USD/, { timeout: SLOW_TIMEOUT })
    // And it drew something rather than erroring out.
    await expect(page.getByText(/Unable to load chart data/)).toHaveCount(0)
  })

  test('draws something for a listed pair that has never traded', async ({ page }) => {
    // The shape the fallback originally missed, and the one this change could
    // not exercise against real Kraken: 200, no error, an empty candle array.
    // An empty array is truthy, so nothing threw — the chart resolved with null
    // points and rendered an empty plot area under `Price · CHF`, with no
    // skeleton, no error and nothing to explain it, cached for the session.
    await mockApis(page)
    await page.route('https://api.kraken.com/0/public/OHLC*', route => {
      const pair = new URL(route.request().url()).searchParams.get('pair')
      if (pair !== 'XBTCHF') return route.fallback()
      route.fulfill({ json: krakenEmptySeriesResponse('XBTCHF') })
    })

    await page.goto('/')
    await waitForChart(page)
    await selectCurrency(page, 'chf')

    await expect(page.getByTestId('chart-currency-fallback'))
      .toHaveText(/No Kraken CHF market · chart in USD/, { timeout: SLOW_TIMEOUT })
    // The point of the fallback: there are candles on screen, not an empty box.
    await expectHighLine(page, '$', 'XBTUSD')
    await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible({ timeout: SLOW_TIMEOUT })
  })

  test('never announces a fallback for a currency that has a market', async ({ page }) => {
    // The frame between the selector updating and the new candles landing. The
    // note is drawn from the series' own two currencies, so there is no render
    // in which an old USD chart is described as a failed GBP one.
    //
    // A `MutationObserver` rather than polling from the test, and that is the
    // whole reason this assertion works: the wrong version paints the note for a
    // *single frame*, and polling over the wire at 16ms misses it — measured,
    // the polled version stayed green against the defect. The observer sees any
    // node that was ever committed, however briefly.
    await mockApis(page)
    await page.goto('/')
    await waitForChart(page)

    await page.evaluate(() => {
      window.__fallbackNoteSeen = 0
      new MutationObserver(records => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType !== 1) continue
            if (node.matches?.('[data-testid="chart-currency-fallback"]')
              || node.querySelector?.('[data-testid="chart-currency-fallback"]')) {
              window.__fallbackNoteSeen += 1
            }
          }
        }
      }).observe(document.body, { childList: true, subtree: true })
    })

    await selectCurrency(page, 'gbp')
    await expect(chartHeading(page)).toHaveText(/GBP/, { timeout: SLOW_TIMEOUT })
    await expect.poll(() => page.locator('.recharts-bar-rectangle').count(), { timeout: SLOW_TIMEOUT })
      .toBeGreaterThan(0)

    expect(await page.evaluate(() => window.__fallbackNoteSeen),
      'fallback note appeared during a switch to a currency Kraken trades').toBe(0)
  })

  test('retries a failed fetch instead of quietly moving the reader to dollars', async ({ page }) => {
    // The narrow-fallback rule, end to end. A transport failure must reach the
    // chart's own retry path — falling back here would strand the reader on
    // dollars for the session, since the result is cached, with no failure shown
    // to press Refresh about.
    await mockApis(page)
    await page.route('https://api.kraken.com/0/public/OHLC*', route => {
      const pair = new URL(route.request().url()).searchParams.get('pair')
      if (pair !== 'XBTCAD') return route.fallback()
      route.abort('connectionfailed')
    })

    await page.goto('/')
    await waitForChart(page)
    await selectCurrency(page, 'cad')

    await expect(page.getByText(/temporarily unavailable/i)).toBeVisible({ timeout: SLOW_TIMEOUT })
    // Never blamed on a market that exists.
    await expect(page.getByTestId('chart-currency-fallback')).toHaveCount(0)
  })
})
