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

  test('the heartbeat readings appear exactly once, whichever frame draws them', async ({ page }) => {
    // The interior is now one module rendered in two frames, so the risk moved:
    // it is no longer that the two drift apart, it is that both frames show at
    // once or neither does. "Block Height" is in the DOM twice at every width —
    // the standalone card and the merged header — and exactly one of them is
    // ever visible. Counting is what a `.first()` locator cannot do.
    const visible = await page.getByText('Block Height', { exact: true }).evaluateAll(
      els => els.filter(el => el.checkVisibility()).length
    )
    expect(visible).toBe(1)
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

// The `md:`-on/`lg:`-off band is the one no project in this suite covers —
// `desktop` is 1280 and `mobile` is 390, so a card column that only exists
// between 768 and ~1024 is invisible to both. This is where the Vibe Score
// character overflowed its card: reported at 820px, and worst at 768, where
// the column is 176px and the character alone is 128.
test.describe('Tablet band (md: on, lg: off)', () => {
  // Both edges of the band plus the middle. 768 is where it was worst and 900
  // is where it was nearly gone, which is exactly the shape of bug a single
  // sample misses.
  for (const width of [768, 820, 900, 1023]) {
    test(`nothing spills out of a card at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 })
      await mockApis(page)
      await page.goto('/')
      await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })

      // Every card, not just the one that broke — the cause is a fixed-width
      // child in a column narrower than the layout was designed against, and
      // that is not specific to the character.
      const spills = await page.evaluate(() => {
        const out = []
        for (const card of document.querySelectorAll('[data-testid^="card-"]')) {
          const box = card.getBoundingClientRect()
          for (const el of card.querySelectorAll('*')) {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) continue
            const over = Math.round(r.right - box.right)
            // A couple of pixels is a rounding artefact; a fixed-width child
            // that does not fit overhangs by tens.
            if (over > 2) {
              out.push(`${card.dataset.testid}: <${el.tagName.toLowerCase()}` +
                `${el.dataset.testid ? ` data-testid="${el.dataset.testid}"` : ''}> ` +
                `overhangs by ${over}px`)
            }
          }
        }
        return [...new Set(out)]
      })
      expect(spills, spills.join('\n')).toEqual([])
    })
  }

  test('the character stays right-aligned when it wraps below the score', async ({ page }) => {
    // At this width the score and the character no longer fit on one line, so
    // the character wraps to its own. `justify-between` gives a lone item
    // flex-start, which would leave it stranded under the number with the card
    // empty beside it — `ml-auto` is what keeps it where it was.
    await page.setViewportSize({ width: 820, height: 1100 })
    await mockApis(page)
    await page.goto('/')
    await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })

    const gap = await page.evaluate(() => {
      const ch = document.querySelector('[data-testid="vibe-character"]')
      const row = ch.parentElement
      const score = document.querySelector('[data-testid="vibe-score"]')
      return {
        wrapped: ch.getBoundingClientRect().top >= score.getBoundingClientRect().bottom,
        fromRight: Math.round(row.getBoundingClientRect().right - ch.getBoundingClientRect().right),
      }
    })
    expect(gap.wrapped, 'this width no longer wraps — re-pick it').toBe(true)
    expect(gap.fromRight, 'the wrapped character is not against the right edge').toBeLessThanOrEqual(1)
  })
})


// The supporters card is the one place in the suite where the mocked data is
// deliberately *not* the empty case. `mocks.js` answers every Supabase read
// with `[]`, which is the right deterministic default — but an empty list
// renders one shared sentence and no layout at all, so the thing under test
// here would not exist. These two tests seed a donor first.
test.describe('Supporters card', () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page)
    // Registered after `mockApis`, so it wins: Playwright matches the most
    // recently added route first.
    await page.route('https://e2e.supabase.invalid/rest/v1/donors**', route =>
      route.fulfill({ json: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] })
    )
    await page.goto('/')
    await expect(page.getByTestId('vibe-score')).toBeVisible({ timeout: TIMEOUT })
  })

  test('renders exactly one of its two layouts', async ({ page }, testInfo) => {
    // Both are in the DOM at all times, gated only by `hidden md:block` and
    // `md:hidden`. Two components hiding *themselves* could never show at once
    // by accident; one card holding both interiors can, if a class is typo'd —
    // so this is a new risk that arrives with the merge and is pinned with it.
    const pills = page.getByText('Alice', { exact: true })
    const marquee = page.getByText(/Proudly supported by Bitcoiners/).first()

    if (testInfo.project.name === 'mobile') {
      await expect(pills.first()).toBeVisible()
      await expect(marquee).toBeHidden()
    } else {
      await expect(marquee).toBeVisible()
      await expect(pills.first()).toBeHidden()
    }
  })

  test('the card itself is present at every width', async ({ page }) => {
    // The half of v1.8.7's rule that survives the merge: the card does not hide
    // itself, so it can be moved or reused without editing it. Only its
    // interior swaps.
    await expect(page.getByRole('heading', { name: /^Supporters/, level: 2 })).toBeVisible()
  })
})
