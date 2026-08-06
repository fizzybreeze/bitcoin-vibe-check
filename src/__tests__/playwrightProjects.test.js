import { describe, it, expect } from 'vitest'
import config from '../../playwright.config.js'

// The e2e suite ran at Playwright's default 1280×720 for the project's whole
// history, on a dashboard that is mobile-first. Every mobile layout bug so far
// — the Cycle Indicators alignment, the block hash overflowing the viewport,
// the single-column grid — was found by eye on a handset, because nothing in
// CI ever looked at a phone.
//
// Deleting the mobile project would not fail a single e2e test; the suite would
// just quietly go back to covering half of what it covers now. This pins it, so
// that removal is a red unit test instead of a silent regression in coverage.

function project(name) {
  return config.projects?.find(p => p.name === name)
}

describe('Playwright projects', () => {
  it('runs the suite at both a desktop and a mobile viewport', () => {
    expect(config.projects?.map(p => p.name)).toEqual(['desktop', 'mobile'])
  })

  it('gives the mobile project a phone-sized viewport', () => {
    const { viewport } = project('mobile').use
    // iPhone 13 is 390×844. Anything at or above Tailwind's `md` breakpoint
    // (768px) would render the desktop layout and defeat the point.
    expect(viewport.width).toBeLessThan(768)
    expect(viewport.height).toBeGreaterThan(viewport.width)
  })

  it('emulates touch and a mobile user agent, not just a narrow window', () => {
    const { isMobile, hasTouch, userAgent } = project('mobile').use
    expect(isMobile).toBe(true)
    expect(hasTouch).toBe(true)
    expect(userAgent).toMatch(/iPhone/)
  })

  it('keeps both projects on chromium', () => {
    // CI installs chromium only — the job is named "Playwright (chromium)" and
    // the workflow's install step passes that single browser. The `iPhone 13`
    // descriptor carries `defaultBrowserType: 'webkit'`, so without an explicit
    // override the mobile project would error the run rather than widen it.
    for (const name of ['desktop', 'mobile']) {
      expect(project(name).use.browserName ?? 'chromium').toBe('chromium')
      expect(project(name).use.defaultBrowserType ?? 'chromium').toBe('chromium')
    }
  })
})
