import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Fail the run rather than silently pass if a .only is committed.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'retain-on-failure',
    // Some sandboxed containers ship a chromium build that differs from the one
    // Playwright pins, and block the CDN it would download the pinned build
    // from. The SessionStart hook detects that and points this at the browser
    // the image already has. Unset everywhere else, including CI, where the
    // normal pinned download works.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'npm run dev -- --port 5175',
    url: 'http://localhost:5175',
    // Reusing a server in CI masks port conflicts and produces confusing
    // failures; always start a clean one there.
    reuseExistingServer: !process.env.CI,
  },
})
