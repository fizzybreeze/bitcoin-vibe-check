// Build: confirm `npm run build` passes before running e2e tests.
// Run: npm run test:e2e  (starts the dev server on port 5175 automatically)
import { test, expect } from '@playwright/test'
import {
  priceFixture, feesFixture, blockHeightFixture, fngFixture, makeChartFixture,
  globalFixture, difficultyFixture, mempoolFixture, blocksFixture, lightningFixture,
  marketsFixture, hashrate3dFixture, hashrate1mFixture,
} from './fixtures.js'

const TIMEOUT = 10_000

async function mockApis(page) {
  await page.route('https://api.coingecko.com/api/v3/simple/price*', route =>
    route.fulfill({ json: priceFixture })
  )
  await page.route('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart*', route => {
    const url  = new URL(route.request().url())
    const days = parseInt(url.searchParams.get('days')) || 7
    route.fulfill({ json: makeChartFixture(days) })
  })
  await page.route('https://api.coingecko.com/api/v3/global', route =>
    route.fulfill({ json: globalFixture })
  )
  await page.route('https://api.coingecko.com/api/v3/coins/markets*', route =>
    route.fulfill({ json: marketsFixture })
  )
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
  // Block the Kraken WebSocket so fixture price values are not overwritten by live data
  await page.routeWebSocket('wss://ws.kraken.com/**', ws => ws.close())
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
    // With fixture data the vibe label resolves to a descriptive sentence.
    // Any of these words indicates the computed label is present.
    await expect(
      page.locator('header').getByText(/greedy|fearful|neutral|extreme fear|extreme greed/i)
    ).toBeVisible({ timeout: TIMEOUT })
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

  // ── Newsletter & footer ─────────────────────────────────────────────────────

  test("Satoshi's Weekly Brief newsletter card is visible", async ({ page }) => {
    await expect(page.getByText("Satoshi's Weekly Brief", { exact: false }).first()).toBeVisible()
  })

  test('footer copyright line contains 2026', async ({ page }) => {
    await expect(page.getByText(/© 2026/)).toBeVisible()
  })
})
