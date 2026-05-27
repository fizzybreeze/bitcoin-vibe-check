import { test, expect } from '@playwright/test'
import {
  priceFixture, feesFixture, blockHeightFixture, fngFixture, makeChartFixture,
} from './fixtures.js'

async function mockApis(page) {
  await page.route('https://api.coingecko.com/api/v3/simple/price*', route =>
    route.fulfill({ json: priceFixture })
  )
  await page.route('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart*', route =>
    route.fulfill({ json: makeChartFixture(7) })
  )
  await page.route('https://mempool.space/api/v1/fees/recommended', route =>
    route.fulfill({ json: feesFixture })
  )
  await page.route('https://mempool.space/api/blocks/tip/height', route =>
    route.fulfill({ json: blockHeightFixture })
  )
  await page.route('https://api.alternative.me/fng/**', route =>
    route.fulfill({ json: fngFixture })
  )
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
    await expect(page.getByText('Slow')).toBeVisible()
    await expect(page.getByText('Medium')).toBeVisible()
    await expect(page.getByText('Fast')).toBeVisible()
  })
})

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('page is functional at 375px width', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Bitcoin Dashboard' })).toBeVisible()
    await expect(page.getByText('$105,000')).toBeVisible()
  })
})
