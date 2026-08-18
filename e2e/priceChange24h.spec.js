// The header's 24h change follows the currency selector.
//
// This is the half no unit test can reach. `marketData.test.js` proves the
// socket frame is turned into one change per currency, and the card renders
// whatever number it is handed. Neither can know whether *App* wires the two
// together: five fields were added to the cache write, the cache merge, the
// refresh patch and the destructure, plus a currency lookup at the end — and
// forgetting any one of them leaves the header rendering perfectly while
// showing the dollar pair's day under another currency's price. That is
// precisely the defect this replaced, and it looked correct.
//
// `App.jsx` has no unit test, which is why this is here rather than there —
// the same reason `alerts.spec.js` and `chartCurrency.spec.js` exist.
import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'

const TIMEOUT = 10_000

// One number per pair, all distinct and none of them the CoinPaprika seed
// (2.5), so an assertion can name which source and which currency it read.
const WS_CHANGE = {
  'BTC/USD': -1.25,
  'BTC/GBP': 3.75,
  'BTC/EUR': -4.5,
  'BTC/CAD': 0.5,
  'BTC/CHF': 6.25,
}

const WS_PRICE = {
  'BTC/USD': 105_000,
  'BTC/GBP': 82_000,
  'BTC/EUR': 96_000,
  'BTC/CAD': 142_000,
  'BTC/CHF': 92_000,
}

/**
 * Replace the default mock — which closes the socket so fixture prices survive
 * — with one that delivers a single ticker frame carrying every pair.
 *
 * Registered *after* `mockApis`, because Playwright matches routes in reverse
 * registration order and the default handler would otherwise win.
 */
async function serveTickerFrame(page) {
  await page.routeWebSocket('wss://ws.kraken.com/**', ws => {
    ws.onMessage(() => {
      // The app subscribes on open; answering that is the only cue needed. The
      // frame carries all five pairs at once, which is also how Kraken batches
      // them — and is the shape that would hide a per-symbol bug behind the
      // dollar pair happening to be present.
      ws.send(JSON.stringify({
        channel: 'ticker',
        data: Object.keys(WS_CHANGE).map(symbol => ({
          symbol, last: WS_PRICE[symbol], change_pct: WS_CHANGE[symbol],
        })),
      }))
    })
  })
}

/** The visible copy of the change — the card renders one for each breakpoint. */
const changeBadge = page => page.getByTestId('price-change-24h').locator('visible=true')

async function selectCurrency(page, code) {
  await page.getByLabel('Display currency').selectOption(code)
}

const signed = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

test.describe('the 24h change follows the selected currency', () => {
  test.beforeEach(async ({ page }) => {
    // The newsletter modal opens five seconds into a first visit and covers the
    // card. Suppressed the way `chartCurrency.spec.js` does.
    await page.addInitScript(() =>
      localStorage.setItem('btc-vibe-newsletter-prompted', 'true')
    )
    await mockApis(page)
    await serveTickerFrame(page)
    await page.goto('/')
    await expect(page.getByTestId('card-btc-price')).toBeVisible({ timeout: TIMEOUT })
  })

  test('shows each currency’s own 24h change, not the dollar pair’s', async ({ page }) => {
    // Every figure is distinct, so a header stuck on the dollar pair fails on
    // the first switch and names the number it was showing.
    await expect(changeBadge(page)).toHaveText(new RegExp(escape(signed(WS_CHANGE['BTC/USD']))), { timeout: TIMEOUT })

    for (const [code, symbol] of [['gbp', 'BTC/GBP'], ['eur', 'BTC/EUR'], ['chf', 'BTC/CHF']]) {
      await selectCurrency(page, code)
      await expect(changeBadge(page)).toHaveText(new RegExp(escape(signed(WS_CHANGE[symbol]))), { timeout: TIMEOUT })
    }
  })

  test('renders exactly one copy of it at any width', async ({ page }) => {
    // The card writes the change twice, one per breakpoint. A duplicate would
    // be invisible to a `.first()` locator, which is the same guard
    // `responsive.spec.js` puts on the halving countdown.
    await expect(changeBadge(page)).toHaveCount(1)
  })
})

test.describe('when the socket never connects', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('btc-vibe-newsletter-prompted', 'true')
    )
    await mockApis(page)   // leaves the default handler, which closes the socket
    await page.goto('/')
    await expect(page.getByTestId('card-btc-price')).toBeVisible({ timeout: TIMEOUT })
  })

  test('shows CoinPaprika’s figure in USD', async ({ page }) => {
    await expect(changeBadge(page)).toHaveText(/\+2\.50%/, { timeout: TIMEOUT })
  })

  test('shows nothing at all in another currency, rather than the dollar figure', async ({ page }) => {
    // The stated cost of the fix, pinned so it is a decision rather than a
    // surprise: CoinPaprika answers one market, so sterling has no source
    // until the socket lands. A gap is the honest answer where the dollar
    // figure under a sterling price is a wrong one — and this is the assertion
    // that goes red if somebody later "fixes" the gap by spreading USD across
    // all five.
    await selectCurrency(page, 'gbp')
    await expect(page.getByTestId('price-change-24h')).toHaveCount(0, { timeout: TIMEOUT })
  })
})

/** Escape a signed percentage for use inside a RegExp. */
function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
