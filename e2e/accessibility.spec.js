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
    // `text-gray-450` is not part of Tailwind's palette — it exists only
    // because `@theme` declares it. A typo there produces no build error and no
    // failing unit test: the class is simply never generated, and every label
    // that uses it falls back to inheriting its parent's colour.
    await mockApis(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /bitcoin vibe check/i }).first())
      .toBeVisible({ timeout: 15000 })

    const resolved = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-gray-450').trim()
    )
    expect(resolved, '--color-gray-450 never reached the browser').not.toBe('')

    // And a element that uses it is actually painted in it, rather than
    // inheriting from its parent because the class did not exist.
    const heading = page.getByText('Sats per fiat').first()
    await expect(heading).toBeAttached()
    const painted = await heading.evaluate(el => getComputedStyle(el).color)
    const parent = await heading.evaluate(el => getComputedStyle(el.parentElement).color)
    expect(painted).not.toBe(parent)
  })
})
