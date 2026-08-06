// Assertions that only mean something because the suite now runs at two
// viewports. `dashboard.spec.js` passes unchanged at 390×844 — its locators are
// deliberately loose (`.first()`, union regexes) so they survive both layouts,
// which is what makes them good content assertions and useless as layout ones.
//
// This file is the other half: the checks that would actually have caught the
// mobile bugs in this project's history — the genesis block hash running off
// the side of the viewport, and the cards that swap between breakpoints.
import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'

const TIMEOUT = 10_000

test.describe('Responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    // Every card has painted by the time the Vibe Score has a value, so this is
    // the one wait that stands in for "the page is done".
    await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })
  })

  test('page does not scroll horizontally', async ({ page }) => {
    // The failure mode this exists for: one long unbroken string — a block
    // hash, an address — widening the document past the viewport, so the whole
    // dashboard slides sideways under the thumb. Report the offending elements
    // rather than just a boolean, because a red check on a phone is only useful
    // if it names the culprit.
    const overflow = await page.evaluate(() => {
      const limit = document.documentElement.clientWidth
      const offenders = []
      for (const el of document.body.querySelectorAll('*')) {
        const { right, width } = el.getBoundingClientRect()
        // Sub-pixel rounding routinely puts a full-width element a hair over.
        if (width > 0 && right > limit + 1) {
          offenders.push(`<${el.tagName.toLowerCase()} class="${el.className}"> right=${Math.round(right)}`)
        }
      }
      return {
        limit,
        scrollWidth: document.documentElement.scrollWidth,
        offenders: offenders.slice(0, 5),
      }
    })

    expect(
      overflow.scrollWidth,
      `document is ${overflow.scrollWidth}px wide in a ${overflow.limit}px viewport. ` +
      `First offenders:\n${overflow.offenders.join('\n')}`
    ).toBeLessThanOrEqual(overflow.limit + 1)
  })

  test('Network Heartbeat is a mobile-only card', async ({ page }, testInfo) => {
    // `lg:hidden` on mobile, merged into RecentBlocksCard on desktop. Pinning
    // both directions is what stops a future grid change from silently
    // rendering it twice, or not at all.
    const heartbeat = page.getByText('Network Heartbeat', { exact: true })
    if (testInfo.project.name === 'mobile') {
      await expect(heartbeat).toBeVisible()
    } else {
      await expect(heartbeat).toBeHidden()
    }
  })

  test('the halving countdown renders exactly one of its two layouts', async ({ page }) => {
    // Both the mobile and desktop arrangements are in the DOM at all times,
    // gated only by `md:hidden` / `hidden md:flex`. If a Tailwind class is
    // typo'd, both render and "Blocks to Halving" appears twice on screen —
    // which a `.first()` assertion would never notice.
    const visible = await page.getByText('Blocks to Halving').evaluateAll(
      els => els.filter(el => el.checkVisibility()).length
    )
    expect(visible).toBe(1)
  })
})
