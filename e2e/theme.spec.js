import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'
import { PALETTE, THEME_STORAGE_KEY } from '../src/lib/palette.js'

// Light mode, in a real browser — which is the only place most of it is
// checkable at all.
//
// The unit suite can prove the palette is internally consistent and that the
// stylesheet mirrors it. What it cannot prove is that any of it *applies*:
// whether Tailwind emitted the tokens, whether the `.dark` block actually wins
// the cascade against `@theme`, whether the boot script runs before paint, and
// whether pressing the toggle repaints the page. Every one of those fails
// silently — the page renders, nothing throws, and the colours are simply
// wrong or simply never change.
//
// The cascade assertion is the load-bearing one. `@theme` is emitted into
// `@layer theme` and the `.dark` block is unlayered, so unlayered wins
// regardless of specificity — that is a real rule, but it is a rule about
// Tailwind's output rather than about anything in this repo, and a major
// version could change it without a word in the diff.

const rgb = (hex) => {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

async function loadWith(page, { stored, prefersDark = true } = {}) {
  await page.emulateMedia({ colorScheme: prefersDark ? 'dark' : 'light' })
  await mockApis(page)
  if (stored !== undefined) {
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, stored],
    )
  }
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /bitcoin vibe check/i }).first())
    .toBeVisible({ timeout: 15000 })
}

const bodyBackground = (page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor)

const toggle = (page) => page.getByRole('button', { name: /switch to (light|dark) theme/i })

test.describe('theme', () => {
  test('paints the dark ground when the OS asks for dark', async ({ page }) => {
    await loadWith(page, { prefersDark: true })
    await expect(page.locator('html')).toHaveClass(/dark/)
    expect(await bodyBackground(page)).toBe(rgb(PALETTE.dark.ground))
  })

  test('paints the light ground when the OS asks for light', async ({ page }) => {
    // The half nobody looks at on a dark laptop. Without this the light
    // palette could be entirely wrong and every other test would still pass.
    await loadWith(page, { prefersDark: false })
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    expect(await bodyBackground(page)).toBe(rgb(PALETTE.light.ground))
  })

  test('the .dark block overrides the @theme defaults in the browser', async ({ page }) => {
    // Tailwind puts `@theme` in `@layer theme`; our `.dark` rule is unlayered
    // and therefore wins. If that ever stops being true, every token silently
    // resolves to its light value while the class is still on `<html>` — dark
    // text on a dark ground, with nothing failing anywhere else.
    await loadWith(page, { prefersDark: true })
    const resolved = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return {
        ground: style.getPropertyValue('--color-ground').trim(),
        surface: style.getPropertyValue('--color-surface').trim(),
        ink: style.getPropertyValue('--color-ink').trim(),
        accent: style.getPropertyValue('--color-accent').trim(),
      }
    })
    expect(resolved.ground).toBe(PALETTE.dark.ground)
    expect(resolved.surface).toBe(PALETTE.dark.surface)
    expect(resolved.accent).toBe(PALETTE.dark.accent)
    // And not merely present — different from the light value it overrode.
    expect(resolved.ink).not.toBe(PALETTE.light.ink)
  })

  test('a stored preference beats the operating system', async ({ page }) => {
    await loadWith(page, { stored: 'light', prefersDark: true })
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    expect(await bodyBackground(page)).toBe(rgb(PALETTE.light.ground))
  })

  test('the toggle repaints the page and moves the browser chrome', async ({ page }) => {
    await loadWith(page, { prefersDark: true })
    expect(await bodyBackground(page)).toBe(rgb(PALETTE.dark.ground))

    await toggle(page).click()

    await expect(page.locator('html')).not.toHaveClass(/dark/)
    expect(await bodyBackground(page)).toBe(rgb(PALETTE.light.ground))
    // `theme-color` is the strip above the page on Android and on an installed
    // PWA. It is not reachable from CSS, so it is the one part of the switch
    // that can be forgotten without anything looking wrong on a desktop.
    await expect(page.locator('meta[name="theme-color"]'))
      .toHaveAttribute('content', PALETTE.light.ground)
  })

  test('the choice survives a reload', async ({ page }) => {
    await loadWith(page, { prefersDark: true })
    await toggle(page).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await page.reload()
    await expect(page.getByRole('heading', { name: /bitcoin vibe check/i }).first())
      .toBeVisible({ timeout: 15000 })
    // And it survives it *without a flash*: the boot script, not React, is
    // what puts the class on before the first paint.
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    expect(await bodyBackground(page)).toBe(rgb(PALETTE.light.ground))
  })

  test('names the action rather than the state', async ({ page }) => {
    // A sun and a moon are equally readable as "you are here" and "go there".
    // The accessible name is what disambiguates, so it has to actually change.
    await loadWith(page, { prefersDark: true })
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible()
    await toggle(page).click()
    await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible()
  })

  test('text stays painted in the theme it is read on', async ({ page }) => {
    // The failure this catches is a colour whose only definition sits in one
    // theme's block: the page renders, nothing throws, and one theme shows
    // text at nearly the same lightness as the surface behind it. Asserting
    // the token resolved is not enough — this asserts a real rendered element.
    await loadWith(page, { prefersDark: false })
    const heading = page.getByRole('heading', { name: /bitcoin vibe check/i }).first()
    const painted = await heading.evaluate(el => getComputedStyle(el).color)
    expect(painted).toBe(rgb(PALETTE.light.ink))
  })
})
