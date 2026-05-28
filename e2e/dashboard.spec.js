import { test, expect } from '@playwright/test'
import {
  priceFixture, feesFixture, blockHeightFixture, fngFixture, makeChartFixture,
  globalFixture, difficultyFixture,
} from './fixtures.js'

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
  await page.route('https://mempool.space/api/v1/fees/recommended', route =>
    route.fulfill({ json: feesFixture })
  )
  await page.route('https://mempool.space/api/blocks/tip/height', route =>
    route.fulfill({ json: blockHeightFixture })
  )
  await page.route('https://mempool.space/api/v1/difficulty-adjustment', route =>
    route.fulfill({ json: difficultyFixture })
  )
  await page.route('https://api.alternative.me/fng/**', route =>
    route.fulfill({ json: fngFixture })
  )
  // Block the Kraken WebSocket so fixture price values are not overwritten
  await page.routeWebSocket('wss://ws.kraken.com/**', ws => ws.close())
}

test.describe('Bitcoin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
  })

  test('BTC price is visible and non-zero', async ({ page }) => {
    await expect(page.getByText('$105,000')).toBeVisible()
  })

  test('all range toggles are clickable without console errors', async ({ page }) => {
    const errors = []
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })

    for (const label of ['1D', '7D', '1M', '1Y']) {
      await page.getByRole('button', { name: label }).click()
      await page.waitForTimeout(100)
    }

    expect(errors).toHaveLength(0)
  })

  test('network fees shows Slow, Medium, Fast tiers', async ({ page }) => {
    await expect(page.getByText('Slow', { exact: true })).toBeVisible()
    await expect(page.getByText('Medium', { exact: true })).toBeVisible()
    await expect(page.getByText('Fast', { exact: true })).toBeVisible()
  })

  // Change 1: BTC Price card always shows 24h change
  test('BTC Price card shows 24h change label regardless of chart toggle', async ({ page }) => {
    // Fixture usd_24h_change is 2.5, so we expect "+2.50%" and "24h change"
    await expect(page.getByText('24h change').first()).toBeVisible()
    await expect(page.getByText(/\+2\.50%/).first()).toBeVisible()

    for (const label of ['1D', '1M', '1Y', '7D']) {
      await page.getByRole('button', { name: label }).click()
      await page.waitForTimeout(150)
      await expect(page.getByText('24h change').first()).toBeVisible()
      await expect(page.getByText(/\+2\.50%/).first()).toBeVisible()
    }
  })

  // Change 2: chart range percentage change
  test('chart range change percentage is shown above the chart', async ({ page }) => {
    // Default is 7D; wait for chart to load then check the indicator
    const changeEl = page.getByTestId('chart-range-change')
    await expect(changeEl).toBeVisible()
    // The fixture 7D data: first price = 103500, last = 100000 → negative change
    await expect(changeEl).toHaveText(/[+-]\d+\.\d+%/)
  })

  test('clicking each chart toggle updates the chart range percentage', async ({ page }) => {
    // Click through ranges and verify the indicator is present after each
    for (const label of ['1D', '1M', '1Y', '7D']) {
      await page.getByRole('button', { name: label }).click()
      await page.waitForTimeout(200)
      await expect(page.getByTestId('chart-range-change')).toBeVisible()
      await expect(page.getByTestId('chart-range-change')).toHaveText(/[+-]\d+\.\d+%/)
    }
  })

  // Change 3: high and low reference lines
  test('chart renders with high and low reference line labels', async ({ page }) => {
    // ReferenceLine labels are SVG text; Playwright finds them via getByText
    // Fixture 7D: hi = $103,500, lo = $100,000
    await expect(page.getByText(/H: \$/).first()).toBeVisible()
    await expect(page.getByText(/L: \$/).first()).toBeVisible()
  })

  // Change 5: no footer attribution
  test('footer attribution text is not present', async ({ page }) => {
    await expect(page.getByText(/CoinGecko · mempool\.space/)).not.toBeAttached()
  })
})

// Halving Countdown card — desktop
test.describe('Halving Countdown on desktop (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
  })

  test('shows blocks-to-halving number', async ({ page }) => {
    // blockHeightFixture = 897000; 1050000 - 897000 = 153,000
    await expect(page.getByText('153,000').first()).toBeVisible()
  })

  test('shows time remaining in days/hours/minutes format', async ({ page }) => {
    await expect(page.getByText(/\d+d \d+h \d+m/)).toBeVisible()
  })

  test('shows estimated halving date', async ({ page }) => {
    await expect(page.getByText(/est\. /)).toBeVisible()
  })

  test('shows epoch progress percentage', async ({ page }) => {
    await expect(page.getByText(/of current epoch complete/)).toBeVisible()
  })
})

// Halving Countdown card — mobile
test.describe('Halving Countdown on mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
  })

  test('shows all three sections stacked on mobile', async ({ page }) => {
    // All sections are visible on mobile (stacked, not hidden)
    await expect(page.getByText('153,000').first()).toBeVisible()
    await expect(page.getByText(/\d+d \d+h \d+m/)).toBeVisible()
    await expect(page.getByText(/of current epoch complete/)).toBeVisible()
  })

  test('page is functional at 375px width', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Bitcoin Vibe Check' })).toBeVisible()
    await expect(page.getByText('$105,000')).toBeVisible()
  })
})
