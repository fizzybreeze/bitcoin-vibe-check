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

  test('every card row renders equal-height cards', async ({ page }) => {
    // Measured rather than assumed, and the measurement corrected the roadmap.
    // §5 claimed "`h-full` is applied unevenly, so some rows have equal-height
    // cards and others do not". At 1100px every card row is equal-height
    // regardless: Network Fees carries no `h-full` and renders at exactly the
    // same 371px as the two cards beside it that do, and Supply Issued and the
    // halving strip match at 126px with neither carrying it.
    //
    // What is actually doing the work is CSS Grid's default `align-items:
    // stretch`, which makes `h-full` a no-op on a *direct* grid child. It stays
    // load-bearing one level down — `PriceChartCard` and `RecentBlocksCard` sit
    // inside wrapper divs, where the wrapper stretches and the card would not —
    // which is why the classes are left alone rather than swept out.
    //
    // So this pins the property the roadmap cared about (rows look level)
    // instead of the mechanism it guessed at (every card carries `h-full`).
    const cardRows = await page.evaluate(() => {
      const out = []
      for (const grid of document.querySelectorAll('div.grid')) {
        const kids = [...grid.children]
        // A card row is one whose children are, or contain, card shells. The
        // vibe-score breakdown is a grid too, and is deliberately not one —
        // it is `grid-cols-2` even on a phone, which is what made an earlier
        // version of the guard below fire at the mobile viewport.
        const isCardRow = kids.some(k =>
          k.matches('.rounded-2xl.bg-surface') || k.querySelector('.rounded-2xl.bg-surface'))
        if (!isCardRow || kids.length < 2) continue
        out.push({
          columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          heights: kids.map(k => Math.round(k.getBoundingClientRect().height)),
          label: kids[0].querySelector('h2')?.textContent?.trim()
            ?? kids[0].textContent.trim().slice(0, 24),
        })
      }
      return out
    })

    // Guard first, and at both viewports: a selector that matched nothing would
    // pass every assertion below it, which is the failure `cardHeadings.test.jsx`
    // met in v1.8.7.
    expect(cardRows.length, 'found no card rows to measure').toBeGreaterThan(1)

    // Only rows that actually *are* rows. At 390px every card grid is
    // `grid-cols-1`, so the children stack into implicit rows of their own and
    // differing heights are correct rather than ragged.
    for (const { heights, label, columns } of cardRows.filter(r => r.columns > 1)) {
      expect(new Set(heights).size,
        `"${label}" row (${columns} cols) is ragged: ${heights.join(', ')}px`).toBe(1)
    }
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
