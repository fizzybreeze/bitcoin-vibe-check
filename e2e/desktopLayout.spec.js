// The desktop layout pass — a container cap, real `lg:`/`xl:` breakpoints, and
// the dead-space fixes that came with them. `responsive.spec.js` already covers
// the mobile-through-tablet band and the two content-sizing exceptions this
// pass introduced (Network Health, then 24h Volume); this file is the desktop-
// only half: the things that only exist at 1024px and up, which the `desktop`
// project's 1280px viewport reaches but nothing below it does.
//
// Scoped to `desktop` throughout rather than per-test, because every claim
// here is specifically about what happens once `lg:`/`xl:` engage — asserting
// it at `mobile`'s 390px would either be vacuous (the classes never apply) or
// wrong (the elements being measured render at a different width entirely).
import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'

const TIMEOUT = 10_000

test.describe('Desktop layout', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'this pass is lg:/xl: only')
    await mockApis(page)
  })

  test('content stops growing past the 1440px cap on a very wide screen', async ({ page }) => {
    // The bug this row exists to fix: before the cap, content measured 1394px
    // wide inside a 1458px viewport and kept growing with the window. 2560px
    // is well past any monitor this was tuned against — the header is used as
    // the measurement because it spans the full content width on every row.
    await page.setViewportSize({ width: 2560, height: 1400 })
    await page.goto('/')
    await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })

    const width = await page.evaluate(() =>
      document.querySelector('header').getBoundingClientRect().width)
    // 1440px content plus the widest padding this pass adds (`xl:px-12`, 48px
    // a side) is 1536px — comfortably under half of 2560, which is what
    // "stopped growing" means here without pinning an exact figure that a
    // padding tweak would then have to keep matching.
    expect(width).toBeLessThan(1440 + 200)
  })

  test('no horizontal scroll at 1512px or 2560px', async ({ page }) => {
    for (const width of [1512, 2560]) {
      await page.setViewportSize({ width, height: 1400 })
      await page.goto('/')
      await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${width}px viewport scrolls horizontally by ${overflow}px`)
        .toBeLessThanOrEqual(1)
    }
  })

  test('the donation name field is capped, not the width of the card', async ({ page }) => {
    // Measured at 1346px on the live site — a two-word name in a text box
    // nearly as wide as the screen. `max-w-md` is 448px.
    await page.setViewportSize({ width: 1512, height: 1400 })
    await page.goto('/')
    await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })
    const box = await page.getByPlaceholder('Your name or handle…').boundingBox()
    expect(box.width).toBeLessThan(500)
  })

  test('no card leaves more than ~60px of empty space below its content at 1512px', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 1400 })
    await page.goto('/')
    await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })
    // The chart redraws after its heading flips currency-ready; give recharts
    // a moment to measure and paint before reading heights off the page.
    await page.waitForTimeout(500)

    const offenders = await page.evaluate(() => {
      const out = []
      for (const card of document.querySelectorAll('.rounded-2xl.bg-surface')) {
        const box = card.getBoundingClientRect()
        let contentBottom = box.top
        for (const el of card.querySelectorAll('*')) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue
          contentBottom = Math.max(contentBottom, r.bottom)
        }
        const gap = Math.round(box.bottom - contentBottom)
        if (gap > 60) {
          out.push(`${card.querySelector('h2')?.textContent?.trim() ?? '(untitled card)'}: ${gap}px`)
        }
      }
      return out
    })
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  test('the price chart grows taller at lg: rather than leaving empty card below it', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 1400 })
    await page.goto('/')
    await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })
    await page.waitForTimeout(500)

    const chartHeight = await page.evaluate(() => {
      const svg = document.querySelector('.recharts-wrapper svg')
      return svg?.getBoundingClientRect().height ?? 0
    })
    // 264px is what it was fixed at before this pass; at 1512px (past `lg:`)
    // it has to have actually grown, not just have room to.
    expect(chartHeight).toBeGreaterThan(300)
  })

  test('Cycle Indicators lays its four stats out in one row at lg:', async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 1400 })
    await page.goto('/')
    await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })

    const columns = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="card-cycle-indicators"]')
      const grid = card.querySelector('.grid')
      return getComputedStyle(grid).gridTemplateColumns.split(' ').length
    })
    expect(columns).toBe(4)
  })
})
