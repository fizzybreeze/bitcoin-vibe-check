import { defineConfig } from '@playwright/test'

// Smoke tests run against the *deployed* site with real upstreams — no mocks,
// no dev server. They live in `smoke/` rather than `e2e/` on purpose: the main
// playwright.config.js has `testDir: './e2e'` with no testMatch, so a smoke
// spec placed there would be swept into `npm run test:e2e` and silently break
// that suite's hermeticity. Separate directories keep the two honest by
// construction rather than by a convention someone has to remember.
export default defineConfig({
  testDir: './smoke',
  forbidOnly: !!process.env.CI,
  // Real upstreams have bad seconds. Two retries distinguishes "the site is
  // broken" from "alternative.me hiccuped", which is the whole point of a
  // smoke test that pages someone.
  retries: process.env.CI ? 2 : 0,
  // Serial: this hits public APIs that the app itself depends on. Parallel
  // workers would multiply that load for no benefit on a handful of tests.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    // Overridable so the same suite can be pointed at a Vercel preview URL
    // before a risky change reaches production.
    baseURL: process.env.SMOKE_BASE_URL ?? 'https://bitcoinvibecheck.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
})
