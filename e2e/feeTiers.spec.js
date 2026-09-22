import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'
import { feesFixture } from './fixtures.js'

// The flat fee market is the state this change exists for, and nothing in any
// automated run had ever rendered it: `feesFixture` carries three distinct
// rates, so every browser assertion and every screenshot has only ever seen the
// tiered layout. The unit tests cover which layout is chosen; what only a
// browser can answer is whether the collapsed row actually fits at phone width
// and whether `App.jsx` is still handing the card a fee response at all.
async function mockFlatFees(page) {
  await mockApis(page)
  await page.route('**/api/v1/fees/recommended', route =>
    route.fulfill({ json: { ...feesFixture, fastestFee: 1, halfHourFee: 1, hourFee: 1, economyFee: 1 } }))
}

test('collapses the fee tiers to one figure when every tier carries the same rate', async ({ page }) => {
  await mockFlatFees(page)
  await page.goto('/')

  const card = page.getByTestId('card-network-fees')
  await expect(card.getByTestId('fees-flat')).toBeVisible()
  await expect(card).toContainText('Every Tier')
  await expect(card).toContainText('paying more buys nothing')
  // Not the same number three times under three different waits. Asserted on
  // the per-tier block labels rather than on "Slow" and "Medium", because the
  // collapsed caption explains itself by naming the slow tier — a substring
  // locator matches the explanation and reports the bug it is looking for.
  await expect(card).not.toContainText('~3 blocks')
  await expect(card).not.toContainText('~6 blocks')

  // The collapsed row is a layout nothing else here has rendered, so check it
  // fits its own card rather than trusting that a wider box always does.
  const overhang = await card.evaluate(el => {
    const box = el.getBoundingClientRect()
    const row = el.querySelector('[data-testid="fees-flat"]').getBoundingClientRect()
    return Math.max(0, row.right - box.right, box.left - row.left)
  })
  expect(overhang, 'the collapsed fee row overhangs its card').toBe(0)
})

test('keeps the three tiers, labelled in blocks, when the rates differ', async ({ page }) => {
  await mockApis(page)
  await page.goto('/')

  const card = page.getByTestId('card-network-fees')
  await expect(card.getByTestId('fees-flat')).toHaveCount(0)
  await expect(card).toContainText('next block')
  await expect(card).toContainText('~3 blocks')
  await expect(card).toContainText('~6 blocks')
  // The minutes stated the mean of an exponential wait as though it were a
  // deadline, and were half of what made three identical rates incoherent.
  await expect(card).not.toContainText('~10 min')
  await expect(card).not.toContainText('~30 min')
})
