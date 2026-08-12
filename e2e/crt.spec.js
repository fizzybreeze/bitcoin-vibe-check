// The CRT treatment on the price chart, in a real browser.
//
// `crt.test.js` parses the stylesheet and proves the rules say the right things.
// It cannot tell you any of them reached the page: whether the class was emitted,
// whether `color-mix` resolved to a colour rather than being dropped as
// unparseable, or — the one that matters — whether an overlay covering the whole
// plot area still lets the reader hover it. That last is a feature the effect
// could take away silently, since the chart itself would carry on drawing
// perfectly and every other assertion in the suite would stay green.
import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'

const TIMEOUT = 15_000

/** The computed style of one of the overlay's two layers, both pseudo-elements. */
function layerStyle(page, pseudo, prop) {
  return page.evaluate(
    ([ps, p]) => getComputedStyle(document.querySelector('[data-testid="chart-crt"]'), ps)
      .getPropertyValue(p),
    [pseudo, prop],
  )
}
const scanlineStyle = (page, prop) => layerStyle(page, '::before', prop)
const bandStyle = (page, prop) => layerStyle(page, '::after', prop)

test.describe('CRT chart treatment', () => {
  test.beforeEach(async ({ page }) => {
    // The scanlines are motion, so the control state for the rest of this file
    // is a visitor who has not asked for less of it. The reduced-motion half is
    // covered generically in accessibility.spec.js, which sweeps every animation
    // on the page and therefore picks these two up without naming them.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await mockApis(page)
    await page.goto('/')
    await expect(page.getByTestId('chart-crt')).toBeAttached({ timeout: TIMEOUT })
  })

  test('paints a real gradient rather than dropping an unparseable colour', async ({ page }) => {
    // `color-mix` is the one piece of modern syntax here. A browser that cannot
    // parse it drops the whole declaration, which leaves the element present,
    // correctly sized, animating — and completely invisible. Nothing in the DOM
    // says so; only the resolved value does.
    const image = await scanlineStyle(page, 'background-image')
    expect(image).toContain('repeating-linear-gradient')
    expect(image, 'the scanline colour did not resolve').not.toContain('color-mix')
    // A resolved mix arrives as an rgb/rgba triple. `transparent` alone would
    // mean the mix collapsed to nothing and the gradient draws no line at all.
    expect(image).toMatch(/rgba?\(/)
  })

  test('rolls the scanlines on the compositor', async ({ page }) => {
    expect(await scanlineStyle(page, 'animation-name')).toBe('crt-scanline-roll')
    // Belt and braces on the performance claim: `crt.test.js` proves the
    // keyframes move only `transform`, and this proves those keyframes are the
    // ones in force rather than a stale build's.
    expect(await scanlineStyle(page, 'animation-iteration-count')).toBe('infinite')
  })

  test('rolls a band that resolves to a real gradient', async ({ page }) => {
    // Same failure as the scanlines: an unparseable `color-mix` leaves an
    // element that is present, correctly sized and animating, with nothing in
    // it. The band is the more likely of the two to go unnoticed, because it is
    // off screen for most of every cycle anyway.
    const image = await bandStyle(page, 'background-image')
    expect(image).toContain('linear-gradient')
    expect(image, 'the band colour did not resolve').not.toContain('color-mix')
    expect(image).toMatch(/rgba?\(/)
    expect(await bandStyle(page, 'animation-name')).toBe('crt-band-roll')
  })

  test('runs the band and the wobble at different cadences', async ({ page }) => {
    // Two faults on one screen arriving together every cycle read as one
    // mechanism. This is the claim the browser can make that the stylesheet
    // cannot: that both animations are actually in force with those durations.
    const band = await bandStyle(page, 'animation-duration')
    const wobble = await page.locator('.crt-wobble')
      .evaluate(el => getComputedStyle(el).animationDuration)
    expect(band).not.toBe(wobble)
    for (const d of [band, wobble]) expect(parseFloat(d)).toBeGreaterThan(1)
  })

  test('wobbles the chart and its axes together', async ({ page }) => {
    // Not the series alone: a line displaced against its own gridlines is a
    // decorative effect changing where a reading appears to sit.
    const wobbling = page.locator('.crt-wobble')
    await expect(wobbling).toHaveCount(1)
    await expect(wobbling.locator('.recharts-cartesian-axis')).not.toHaveCount(0)
    expect(await wobbling.evaluate(el => getComputedStyle(el).animationName)).toBe('crt-wobble')
  })

  test('still lets the reader hover the chart for a tooltip', async ({ page, hasTouch }) => {
    // The regression the whole overlay risks. It sits over the entire plot area,
    // so without `pointer-events: none` the tooltip is unreachable — and the
    // chart still renders, so every other check in this suite stays green.
    //
    // Desktop only, and the reason is a property of the chart rather than of the
    // overlay: on the mobile project recharts produces no tooltip for a
    // synthetic mouse move *or* for a tap, measured with the overlay removed
    // from the DOM entirely. Its handlers are mouse-driven and the iPhone 13
    // descriptor emulates touch, so there is nothing there for a decorative
    // layer to block. Running this at both viewports would have failed for a
    // reason that has nothing to do with what it is asserting.
    test.skip(hasTouch, 'recharts shows no tooltip under touch emulation, overlay or not')

    const bar = page.locator('.recharts-bar-rectangle').first()
    await expect(bar).toBeVisible({ timeout: TIMEOUT })

    const box = await page.locator('.recharts-surface').first().boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

    await expect(page.locator('.recharts-tooltip-wrapper')).toBeVisible({ timeout: TIMEOUT })
    // The tooltip's own content, not just its container: recharts leaves the
    // wrapper in the DOM between hovers, so an empty one would satisfy a laxer
    // assertion while telling the reader nothing.
    await expect(page.locator('.recharts-tooltip-wrapper').getByText(/^\$[\d,]+/))
      .toBeVisible({ timeout: TIMEOUT })
  })

  test('holds the picture still while it is being read', async ({ page }) => {
    // Hovering to read a tooltip and having the thing you are reading jitter is
    // the one moment the wobble is actively unhelpful.
    const wobbling = page.locator('.crt-wobble')
    await wobbling.hover()
    expect(await wobbling.evaluate(el => getComputedStyle(el).animationPlayState)).toBe('paused')
  })

  test('adds nothing that overflows the chart box', async ({ page }) => {
    // The overlay is `inset: 0` on a wrapper it does not control the size of,
    // and the layer inside it is deliberately taller than its frame. A missing
    // `overflow: hidden` puts scanlines across the card below.
    const overflow = await page.getByTestId('chart-crt').evaluate((el) => {
      const frame = el.getBoundingClientRect()
      const host = el.parentElement.getBoundingClientRect()
      return {
        taller: frame.height - host.height,
        clipped: getComputedStyle(el).overflow,
      }
    })
    expect(overflow.clipped).toBe('hidden')
    expect(Math.abs(overflow.taller)).toBeLessThanOrEqual(1)
  })
})
