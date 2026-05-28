import { test, expect } from '@playwright/test'
import {
  priceFixture, feesFixture, blockHeightFixture, fngFixture, makeChartFixture,
  globalFixture, difficultyFixture, mempoolFixture, blocksFixture,
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
  await page.route('https://mempool.space/api/mempool', route =>
    route.fulfill({ json: mempoolFixture })
  )
  await page.route('https://mempool.space/api/v1/blocks', route =>
    route.fulfill({ json: blocksFixture })
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

  // Network Heartbeat card
  test('Network Heartbeat card shows block height and avg block time', async ({ page }) => {
    // blockHeightFixture = 897000; difficultyFixture timeAvg = 600000ms → 10.0 min
    await expect(page.getByText('897,000')).toBeVisible()
    await expect(page.getByText('10.0 min')).toBeVisible()
  })

  test('Network Heartbeat card shows last block time', async ({ page }) => {
    // blocksFixture timestamp = 5 min ago
    await expect(page.getByText(/Last block: 5 min ago/)).toBeVisible()
  })

  // Mempool congestion indicator
  test('mempool congestion bar and label are visible', async ({ page }) => {
    // mempoolFixture vsize = 25M → Moderate
    await expect(page.getByText('Moderate')).toBeVisible()
    await expect(page.getByText(/unconfirmed transactions/)).toBeVisible()
  })

  test('mempool transaction count is formatted with commas', async ({ page }) => {
    // mempoolFixture count = 14203 → "14,203 unconfirmed transactions"
    await expect(page.getByText(/14,203 unconfirmed transactions/)).toBeVisible()
  })

  // Change 5: no footer attribution
  test('footer attribution text is not present', async ({ page }) => {
    await expect(page.getByText(/CoinGecko · mempool\.space/)).not.toBeAttached()
  })
})

// Halving Countdown card — desktop
// Note: component renders both a mobile layout (flex md:hidden) and a desktop layout
// (hidden md:flex). On desktop the desktop element is .last() in the DOM.
test.describe('Halving Countdown on desktop (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
  })

  test('shows blocks-to-halving number', async ({ page }) => {
    // blockHeightFixture = 897000; 1050000 - 897000 = 153,000
    // .last() targets the desktop layout element (second in DOM)
    await expect(page.getByText('153,000').last()).toBeVisible()
  })

  test('shows time remaining in days/hours/minutes format', async ({ page }) => {
    await expect(page.getByText(/\d+d \d+h \d+m/).last()).toBeVisible()
  })

  test('shows estimated halving date', async ({ page }) => {
    await expect(page.getByText(/est\. /).last()).toBeVisible()
  })

  test('shows epoch progress percentage', async ({ page }) => {
    await expect(page.getByText(/of current epoch complete/).last()).toBeVisible()
  })
})

// Halving Countdown card — mobile
test.describe('Halving Countdown on mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
  })

  test('shows all three sections on mobile', async ({ page }) => {
    // Mobile layout is .first() in DOM; desktop layout is hidden on mobile
    await expect(page.getByText('153,000').first()).toBeVisible()
    await expect(page.getByText(/\d+d \d+h \d+m/).first()).toBeVisible()
    await expect(page.getByText(/of current epoch complete/).first()).toBeVisible()
  })

  test('page is functional at 375px width', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Bitcoin Vibe Check' })).toBeVisible()
    await expect(page.getByText('$105,000')).toBeVisible()
  })
})
