// Every upstream the dashboard touches, stubbed from `fixtures.js`.
//
// Lives in its own module rather than inside `dashboard.spec.js` because more
// than one spec needs it — the mobile screenshot spec renders the same fully
// loaded page. Not named `*.spec.js`, so Playwright's default `testMatch` does
// not pick it up as a test file.
import {
  feesFixture, blockHeightFixture, fngFixture,
  difficultyFixture, mempoolFixture, blocksFixture, lightningFixture,
  hashrate3dFixture, hashrate1mFixture, chainDataFixture,
  ohlc200dFixture, makeKrakenCandles, KRAKEN_INTERVAL_SECONDS, krakenOhlcResponse,
  paprikaTickerFixture, paprikaGlobalFixture, krakenTickerFixture, makeBlocksFixture,
} from './fixtures.js'

/**
 * @param page          Playwright page
 * @param options.nowMs When set, block timestamps are derived from this instant
 *                      instead of the wall clock. The visual spec passes the
 *                      same value it freezes the page clock at, so "5 min ago"
 *                      renders identically on every run.
 */
export async function mockApis(page, { nowMs } = {}) {
  await page.route('https://mempool.space/api/v1/fees/recommended', route =>
    route.fulfill({ json: feesFixture })
  )
  await page.route('https://mempool.space/api/blocks/tip/height', route =>
    route.fulfill({ json: blockHeightFixture })
  )
  await page.route('https://mempool.space/api/v1/difficulty-adjustment', route =>
    route.fulfill({ json: difficultyFixture })
  )
  await page.route('https://mempool.space/api/mempool', route =>
    route.fulfill({ json: mempoolFixture })
  )
  await page.route('https://mempool.space/api/v1/blocks', route =>
    route.fulfill({ json: nowMs == null ? blocksFixture : makeBlocksFixture(nowMs) })
  )
  await page.route('https://mempool.space/api/v1/lightning/statistics/latest', route =>
    route.fulfill({ json: lightningFixture })
  )
  await page.route('https://api.alternative.me/fng/**', route =>
    route.fulfill({ json: fngFixture })
  )
  await page.route('https://mempool.space/api/v1/mining/hashrate/3d', route =>
    route.fulfill({ json: hashrate3dFixture })
  )
  await page.route('https://mempool.space/api/v1/mining/hashrate/1m', route =>
    route.fulfill({ json: hashrate1mFixture })
  )
  // CoinPaprika — primary price source (USD, volume, ATH, dominance)
  await page.route('https://api.coinpaprika.com/v1/tickers/btc-bitcoin', route =>
    route.fulfill({ json: paprikaTickerFixture })
  )
  await page.route('https://api.coinpaprika.com/v1/global', route =>
    route.fulfill({ json: paprikaGlobalFixture })
  )
  // Kraken REST — initial GBP/EUR/CAD/CHF prices
  await page.route('https://api.kraken.com/0/public/Ticker*', route =>
    route.fulfill({ json: krakenTickerFixture })
  )
  // Block the Kraken WebSocket so fixture price values are not overwritten by live data
  await page.routeWebSocket('wss://ws.kraken.com/**', ws => ws.close())
  // BGeometrics proxy (Vercel serverless function)
  await page.route('/api/chain-data', route =>
    route.fulfill({ json: chainDataFixture })
  )
  // Kraken OHLC — chart ranges and the 200-day series. Kraken has no limit
  // parameter, so the app slices client-side; the daily request therefore serves
  // both the 1M/1Y toggles and the 200DMA. Return the 200 fixed-close candles
  // for the daily interval so the cycle-indicator assertions stay deterministic.
  await page.route('https://api.kraken.com/0/public/OHLC*', route => {
    const url      = new URL(route.request().url())
    const interval = parseInt(url.searchParams.get('interval')) || 1440
    const candles  = interval === 1440
      ? ohlc200dFixture
      : makeKrakenCandles(200, KRAKEN_INTERVAL_SECONDS[interval] ?? 86_400)
    route.fulfill({ json: krakenOhlcResponse(candles) })
  })

  // Supabase, pointed at the unresolvable `.invalid` host that
  // `playwright.config.js` pins. Two reads reach it on a normal load — the
  // supporter ticker's `donors` and the Vibe Score sparkline's
  // `metric_snapshots` — and both degrade to "nothing yet" on an empty array,
  // which is the deterministic state to render.
  //
  // This closes a hole rather than adding a convenience: the client is built
  // from `VITE_` variables, so before the config pinned them, a developer with
  // a populated `.env` ran this "fully mocked, no network" suite against their
  // live project while CI built no client at all — two different apps under
  // one set of assertions.
  await page.route('https://e2e.supabase.invalid/**', route =>
    route.fulfill({ json: [] })
  )

  // Third-party scripts. These are not part of the dashboard under test and are
  // unreachable on a restricted network, so stub them out rather than let the
  // suite depend on the public internet.
  //
  // `subscribe-forms.beehiiv.com` was stubbed here until the newsletter form
  // became ours. That stub was right and it was also the reason the embed
  // shipped looking wrong: every run and every visual baseline held an empty box
  // where production drew a white panel. Nothing requests their loader now, so
  // a rule for a host the app never calls is the dead-config smell v1.4.5
  // recorded — it goes rather than sitting here looking like coverage.
  await page.route('https://va.vercel-scripts.com/**', route =>
    route.fulfill({ contentType: 'application/javascript', body: '' })
  )
}
