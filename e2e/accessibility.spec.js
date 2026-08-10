import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'

// The accessibility pass (roadmap §5), in a real browser.
//
// `contrast.test.js` asserts the stylesheet *contains* a reduced-motion block
// and that the tokens measure up, which is a text match against a file — it
// cannot tell you the rule actually applies, that its selector reaches the
// animated elements, or that Tailwind emitted the custom token at all. Those
// are questions only a browser answers.

/** Every distinct animation-duration currently in force on the page, in ms. */
async function animationDurations(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .map(el => getComputedStyle(el).animationDuration)
      .filter(d => d && d !== 'none' && d !== '0s')
      .map(d => (d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000))
  )
}

test.describe('Accessibility', () => {
  test('honours prefers-reduced-motion for every animation on the page', async ({ page }) => {
    await mockApis(page)

    // Control first. Without this the assertion below passes on a page that
    // simply has no animations — which is exactly what it would look like if
    // the selector were wrong.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /bitcoin vibe check/i }).first())
      .toBeVisible({ timeout: 15000 })
    const running = await animationDurations(page)
    expect(running.length, 'no animations found at all — the control is vacuous').toBeGreaterThan(0)
    expect(Math.max(...running), 'expected a long-running animation to exist').toBeGreaterThan(500)

    // Now the same page for someone who asked for less motion.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const reduced = await animationDurations(page)
    expect(reduced.length, 'the elements are still there').toBeGreaterThan(0)
    expect(Math.max(...reduced)).toBeLessThanOrEqual(1)
  })

  test('gives the drawn-only elements a text alternative', async ({ page }) => {
    // A sparkline is an SVG with no text and the difficulty bar is two coloured
    // divs, so without these a screen reader is told nothing about either. The
    // labels carry the reading rather than describing the picture.
    await mockApis(page)
    await page.goto('/')

    const fng = page.getByRole('img', { name: /Fear and Greed/ })
    await expect(fng).toBeAttached({ timeout: 15000 })
    await expect(fng).toHaveAttribute('aria-label', /\d+ to \d+, (rising|falling|unchanged)/)

    const difficulty = page.getByRole('img', { name: /Difficulty adjustment/ })
    await expect(difficulty).toBeAttached()
    await expect(difficulty).toHaveAttribute('aria-label', /scale from 10% slower to 10% faster/)
  })

  test('emits the custom muted token rather than dropping it silently', async ({ page }) => {
    // `text-quiet` is not part of Tailwind's palette — it exists only because
    // `@theme` declares `--color-quiet`. A typo there produces no build error
    // and no failing unit test: the class is simply never generated, and every
    // label that uses it falls back to inheriting its parent's colour. It is
    // the app's most-used text tone, so that failure is close to invisible.
    await mockApis(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /bitcoin vibe check/i }).first())
      .toBeVisible({ timeout: 15000 })

    const resolved = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-quiet').trim()
    )
    expect(resolved, '--color-quiet never reached the browser').not.toBe('')

    // And a element that uses it is actually painted in it, rather than
    // inheriting from its parent because the class did not exist.
    const heading = page.getByText('Sats per fiat').first()
    await expect(heading).toBeAttached()
    const painted = await heading.evaluate(el => getComputedStyle(el).color)
    const parent = await heading.evaluate(el => getComputedStyle(el.parentElement).color)
    expect(painted).not.toBe(parent)
  })
  // ── Focus indicators, keyboard operability, heading structure ─────────────
  //
  // The half of the same pass that no unit test can reach. `palette.test.js`
  // asserts the focus rule is in the stylesheet and unlayered; only a browser
  // can say Tailwind's own `@layer utilities` did not beat it, that Tab lands
  // where the trap says, or what the document outline looks like once every
  // card has rendered.

  test('paints a focus ring in the app accent, not the browser default', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /bitcoin vibe check/i }).first())
      .toBeVisible({ timeout: 15000 })

    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()
    )
    expect(accent, '--color-accent never reached the browser').not.toBe('')

    // What this proves and what it does not, stated rather than implied. It
    // proves the rule reached the browser and the ring is painted in *this
    // app's* accent rather than the user agent's own default focus ring, which
    // is what a missing rule looks like and is easy to mistake for success.
    //
    // It does *not* prove the rule being unlayered is load-bearing, because
    // nothing in `src/` carries `outline-none` any more — so Tailwind never
    // emits that utility and there is nothing left for it to beat. That
    // property was measured by hand (inside `@layer base` a control carrying
    // `outline-none` gets no ring at all; unlayered it gets one) and is pinned
    // structurally by `palette.test.js`, which asserts both the brace depth of
    // the rule and that no source file reintroduces the utility.
    const select = page.getByLabel('Display currency')
    await select.focus()
    const ring = await select.evaluate(el => {
      const s = getComputedStyle(el)
      return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor }
    })
    expect(ring.style).toBe('solid')
    expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2)

    // Compared as painted pixels rather than as strings — the token is a hex
    // and `outline-color` comes back as rgb().
    const asRgb = await page.evaluate((hex) => {
      const probe = document.createElement('span')
      probe.style.color = hex
      document.body.appendChild(probe)
      const c = getComputedStyle(probe).color
      probe.remove()
      return c
    }, accent)
    expect(ring.color).toBe(asRgb)
  })

  test('the alerts panel takes focus, closes on Escape and hands focus back', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    const trigger = page.getByRole('button', { name: /alert/i }).first()
    await expect(trigger).toBeVisible({ timeout: 15000 })

    await trigger.focus()
    await page.keyboard.press('Enter')
    const panel = page.getByRole('dialog', { name: 'Alerts' })
    await expect(panel).toBeVisible()

    // Focus is *inside* the panel, not left behind on the header button — which
    // is the state that made this unusable: a panel on screen that the keyboard
    // could not reach.
    await expect(panel.locator(':focus')).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('the share modal holds Tab inside itself', async ({ page }) => {
    await mockApis(page)
    await page.goto('/')
    const trigger = page.getByRole('button', { name: /share/i }).first()
    await expect(trigger).toBeVisible({ timeout: 15000 })
    await trigger.click()

    const modal = page.getByRole('dialog', { name: /share dashboard/i })
    await expect(modal).toBeVisible()

    // More presses than the modal has controls, so a leak shows up rather than
    // being outrun. Playwright's Tab is the browser's own, which is the whole
    // reason this assertion cannot live in jsdom.
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab')
      await expect(modal.locator(':focus'), `focus escaped on press ${i + 1}`).toHaveCount(1)
    }

    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('gives the page a heading outline with no skipped levels', async ({ page }) => {
    // Before this the whole dashboard had one heading and fifteen card titles
    // that were paragraphs styled to look like headings, so jump-to-heading —
    // a screen reader's main navigation — reached the top of the page and
    // nothing else.
    await mockApis(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /bitcoin vibe check/i }).first())
      .toBeVisible({ timeout: 15000 })

    const levels = await page.evaluate(() =>
      [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
        // `display: none` at this breakpoint is out of the accessibility tree,
        // so the responsive twins do not both count.
        .filter(el => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
        .map(el => Number(el.tagName[1]))
    )

    expect(levels.filter(l => l === 1), 'exactly one h1').toHaveLength(1)
    expect(levels[0], 'the h1 comes first').toBe(1)
    expect(levels.filter(l => l === 2).length, 'the cards are headings now').toBeGreaterThan(8)

    for (let i = 1; i < levels.length; i++) {
      expect(levels[i], `level ${levels[i]} follows level ${levels[i - 1]}`)
        .toBeLessThanOrEqual(levels[i - 1] + 1)
    }
  })
})
