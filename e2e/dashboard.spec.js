// Build: confirm `npm run build` passes before running e2e tests.
// Run: npm run test:e2e  (starts the dev server on port 5175 automatically)
import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'

const TIMEOUT = 10_000

test.describe('Bitcoin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
  })

  // ── Page structure ──────────────────────────────────────────────────────────

  test('page title "Bitcoin Vibe Check" is visible', async ({ page }) => {
    // `level: 1` because every card title is a heading now, and the donation
    // card's "Support Bitcoin Vibe Check" matches this name too. Pinning the
    // level says what this test is actually about — the page's own title.
    await expect(page.getByRole('heading', { name: 'Bitcoin Vibe Check', level: 1 })).toBeVisible()
  })

  test('the title is the drawn wordmark, painted in two palette colours', async ({ page }) => {
    // No unit test can see this. jsdom lays nothing out, so a wordmark rendered
    // at zero width — an `sr-only` that swallowed the svg, a size class Tailwind
    // never generated — passes every assertion in `wordmark.test.js` while the
    // header is visibly empty. The heading test above would still pass too: its
    // name comes from the `sr-only` text, not from the picture.
    const mark = page.getByTestId('wordmark')
    await expect(mark).toBeVisible()
    const box = await mark.boundingBox()
    expect(box.width).toBeGreaterThan(100)
    expect(box.height).toBeGreaterThan(20)

    // And it is the thing at that point on the page. A box is not paint:
    // `sr-only` clips its subtree while leaving every child's layout box the
    // size it was, so an svg accidentally nested inside the screen-reader span
    // measures 183×45, reports visible, and shows nothing. Measured — that
    // mutation passed every assertion above.
    const hit = await mark.evaluate((el, [x, y]) => {
      const at = document.elementFromPoint(x, y)
      return Boolean(at && (at === el || el.contains(at)))
    }, [box.x + box.width / 2, box.y + box.height / 2])
    expect(hit).toBe(true)

    // Two fills, and both are colours the stylesheet actually resolved — the
    // second is what makes CHECK the accent rather than more of the same word.
    const fills = await mark.evaluate(el =>
      [...new Set([...el.querySelectorAll('rect')].map(r => r.getAttribute('fill')))])
    expect(fills).toHaveLength(2)
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim())
    expect(fills).toContain(accent)
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

  // Both of these waited on `[class*="text-orange"]` until the Afterglow
  // redesign — a colour class standing in for "the price has painted". That is
  // a brittle proxy for a precondition that can be stated directly, and it
  // broke on a re-skin that changed nothing these tests are about. Waiting for
  // the dollar price is the actual precondition and survives the next one.
  test('switching currency to GBP updates the price card', async ({ page }) => {
    await expect(page.getByText(/\$[\d,]+/).first()).toBeVisible({ timeout: TIMEOUT })
    await page.selectOption('select', 'gbp')
    // GBP fixture price is 82,000 → "£82,000"
    await expect(page.getByText(/£[\d,]+/).first()).toBeVisible({ timeout: TIMEOUT })
  })

  test('switching back from GBP to USD shows a USD price', async ({ page }) => {
    await expect(page.getByText(/\$[\d,]+/).first()).toBeVisible({ timeout: TIMEOUT })
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
