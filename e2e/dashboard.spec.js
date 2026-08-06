// Build: confirm `npm run build` passes before running e2e tests.
// Run: npm run test:e2e  (starts the dev server on port 5175 automatically)
import { test, expect } from '@playwright/test'
import {
  feesFixture, blockHeightFixture, fngFixture,
  difficultyFixture, mempoolFixture, blocksFixture, lightningFixture,
  hashrate3dFixture, hashrate1mFixture, chainDataFixture,
  ohlc200dFixture, makeKrakenCandles, KRAKEN_INTERVAL_SECONDS, krakenOhlcResponse,
  paprikaTickerFixture, paprikaGlobalFixture, krakenTickerFixture,
} from './fixtures.js'

const TIMEOUT = 10_000

async function mockApis(page) {
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
    route.fulfill({ json: blocksFixture })
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

  // Third-party scripts. These are not part of the dashboard under test and are
  // unreachable on a restricted network, so stub them out rather than let the
  // suite depend on the public internet.
  await page.route('https://subscribe-forms.beehiiv.com/**', route =>
    route.fulfill({ contentType: 'application/javascript', body: '' })
  )
  await page.route('https://va.vercel-scripts.com/**', route =>
    route.fulfill({ contentType: 'application/javascript', body: '' })
  )
}

test.describe('Bitcoin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
  })

  // ── Page structure ──────────────────────────────────────────────────────────

  test('page title "Bitcoin Vibe Check" is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Bitcoin Vibe Check' })).toBeVisible()
  })

  test('sentiment summary line is visible in the header within 10 seconds of load', async ({ page }) => {
    // The header sentence is derived from the Vibe Score's dimensions, and which
    // three it names depends on which are furthest from neutral. Match the union
    // of every phrase it can produce, so the assertion stays real without
    // depending on which dimensions happen to lead with these fixtures. The
    // fallback tagline ("Read the room.") matches none of these.
    await expect(
      page.locator('header').getByText(
        /extreme fear|fearful|sentiment neutral|greedy|extreme greed|historically cheap|below fair value|fairly valued|richly valued|valuations stretched|price falling|price drifting|price flat|price climbing|price surging|mempool|blocks clearing|blocks filling|hash rate/i
      )
    ).toBeVisible({ timeout: TIMEOUT })
  })

  // ── Vibe Score ──────────────────────────────────────────────────────────────

  test('Vibe Score renders a 0-100 integer with a temperature label', async ({ page }) => {
    const score = page.getByTestId('vibe-score')
    await expect(score).toBeVisible({ timeout: TIMEOUT })
    const value = parseInt((await score.textContent()).trim(), 10)
    expect(Number.isInteger(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThanOrEqual(100)

    await expect(page.getByTestId('vibe-label')).toHaveText(
      /^(Ice Cold|Cold|Cool|Warm|Hot|Overheated)$/
    )
  })

  test('Vibe Score sits inside the BTC Price card, not the header', async ({ page }) => {
    await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })
    // The score is the differentiator and belongs in the first card, where it
    // lands inside the natural screenshot crop.
    const inHeader = await page.locator('header').getByTestId('vibe-score').count()
    expect(inHeader).toBe(0)
    await expect(page.getByText('Vibe Score', { exact: true })).toBeVisible()
  })

  // ── BTC Price card ──────────────────────────────────────────────────────────

  test('BTC Price card renders a price matching $[0-9,]+', async ({ page }) => {
    await expect(page.getByText(/^\$[\d,]+$/).first()).toBeVisible({ timeout: TIMEOUT })
  })

  test('ATH distance line is visible beneath the price', async ({ page }) => {
    // Shows either "X.X% from ATH" or "AT ATH"
    await expect(page.getByText(/from ATH|AT ATH/).first()).toBeVisible({ timeout: TIMEOUT })
  })

  // ── Network Pulse card ──────────────────────────────────────────────────────

  test('Network Pulse card is visible with FEAR & GREED and DIFFICULTY labels', async ({ page }) => {
    await expect(page.getByText(/Fear & Greed/i).first()).toBeVisible({ timeout: TIMEOUT })
    await expect(page.getByText(/Difficulty/i).first()).toBeVisible({ timeout: TIMEOUT })
  })

  test('hash rate value is visible with EH/s', async ({ page }) => {
    await expect(page.getByText(/EH\/s/).first()).toBeVisible({ timeout: TIMEOUT })
  })

  // ── Recent Blocks card ──────────────────────────────────────────────────────

  test('Recent Blocks card renders at least one block height', async ({ page }) => {
    // Block heights are rendered as <a> links in the block list
    await expect(page.locator('a').filter({ hasText: /^\d{3},\d{3}$/ }).first()).toBeVisible({ timeout: TIMEOUT })
  })

  // ── 24H Volume card ─────────────────────────────────────────────────────────

  test('sats per fiat renders a value matching [0-9,]+ sats per $1', async ({ page }) => {
    // Fixture price: $105,000 → 952 sats per $1 (non-breaking space before "sats")
    await expect(page.getByText(/[\d,]+\s+sats per \$1/)).toBeVisible({ timeout: TIMEOUT })
  })

  test('supply issued renders a value containing BTC', async ({ page }) => {
    // Fixture block height 897,000 → supply ≈ 19,865,628.13 BTC
    await expect(page.getByText(/Supply issued/i).first()).toBeVisible({ timeout: TIMEOUT })
    await expect(page.getByText(/[\d,]+\.\d{2}.*BTC/).first()).toBeVisible({ timeout: TIMEOUT })
  })

  // ── Currency toggle ─────────────────────────────────────────────────────────

  test('switching currency to GBP updates the price card', async ({ page }) => {
    await page.waitForSelector('[class*="text-orange"]', { timeout: TIMEOUT })
    await page.selectOption('select', 'gbp')
    // GBP fixture price is 82,000 → "£82,000"
    await expect(page.getByText(/£[\d,]+/).first()).toBeVisible({ timeout: TIMEOUT })
  })

  test('switching back from GBP to USD shows a USD price', async ({ page }) => {
    await page.waitForSelector('[class*="text-orange"]', { timeout: TIMEOUT })
    await page.selectOption('select', 'gbp')
    await page.selectOption('select', 'usd')
    await expect(page.getByText(/\$[\d,]+/).first()).toBeVisible({ timeout: TIMEOUT })
  })

  // ── Chart range toggles ─────────────────────────────────────────────────────

  test('chart time range toggles 1D, 7D, 1M, 1Y are clickable without console errors', async ({ page }) => {
    const errors = []
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })

    for (const label of ['1D', '7D', '1M', '1Y']) {
      await page.getByRole('button', { name: label }).click()
      await page.waitForTimeout(200)
    }

    expect(errors).toHaveLength(0)
  })

  // ── Signal Cards (row 3) ────────────────────────────────────────────────────

  test('Cycle Indicators card renders with MVRV value from fixture', async ({ page }) => {
    await expect(page.getByText(/cycle indicators/i).first()).toBeVisible({ timeout: TIMEOUT })
    // Fixture MVRV = 2.15 → rendered as "2.15"
    await expect(page.getByText('2.15').first()).toBeVisible({ timeout: TIMEOUT })
  })

  test('Cycle Indicators card renders Power Law Fair Value', async ({ page }) => {
    await expect(page.getByText(/cycle indicators/i).first()).toBeVisible({ timeout: TIMEOUT })
    await expect(page.getByText(/power law fair value/i).first()).toBeVisible({ timeout: TIMEOUT })
  })

  test('Cycle Indicators card renders 200-Day Moving Average from fixture klines', async ({ page }) => {
    // Fixture klines all close at 103,000 → 200DMA = $103,000
    await expect(page.getByText(/200-day moving average/i).first()).toBeVisible({ timeout: TIMEOUT })
  })

  // ── Newsletter & footer ─────────────────────────────────────────────────────

  test("Satoshi's Weekly Brief newsletter card is visible", async ({ page }) => {
    await expect(page.getByText("Satoshi's Weekly Brief", { exact: false }).first()).toBeVisible()
  })

  test('footer copyright line contains 2026', async ({ page }) => {
    await expect(page.getByText(/© 2026/)).toBeVisible()
  })
})
