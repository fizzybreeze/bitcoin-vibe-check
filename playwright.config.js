import { defineConfig, devices } from '@playwright/test'

// Both mobile projects share one device definition, so the visual baselines can
// never drift away from the viewport the behavioural specs run at. Pinned to
// chromium: CI installs no other browser, and the `iPhone 13` descriptor
// carries `defaultBrowserType: 'webkit'`, which would error the run rather than
// widen it.
const MOBILE_DEVICE = {
  ...devices['iPhone 13'],
  defaultBrowserType: 'chromium',
  browserName: 'chromium',
}

export default defineConfig({
  testDir: './e2e',
  // Fail the run rather than silently pass if a .only is committed.
  forbidOnly: !!process.env.CI,
  // Playwright's default is 'missing', which *writes* an absent baseline and
  // passes. Since CI never commits what it writes, that would regenerate the
  // baseline on every run and compare it against itself — a visual suite that
  // is permanently green and permanently vacuous. 'none' makes a missing
  // baseline a hard failure; regenerating is an explicit --update-snapshots,
  // which the CLI flag still overrides this with.
  updateSnapshots: 'none',
  // Baselines are pixel comparisons against one specific rendering
  // environment, so they live under a project-scoped path and are generated in
  // CI. See .github/workflows/visual-baselines.yml.
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
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
  // This is a mobile-first dashboard, so the suite has to actually look at a
  // phone. Every mobile layout bug in the project's history was found by eye on
  // a handset, because the suite only ever ran at Playwright's default
  // 1280×720. Both projects run on **chromium** — CI installs no other browser,
  // and the `iPhone 13` descriptor otherwise drags in webkit via its
  // `defaultBrowserType`, which would fail the run rather than widen it.
  // Chromium's device emulation still gives the real 390×844 viewport, DPR 3,
  // touch and the mobile user agent, which is what the layout responds to.
  //
  // `visual` is a third project rather than more specs inside `mobile`, for two
  // reasons: its baselines are only valid for one rendering environment, so it
  // needs to be skippable in isolation (`--project=mobile` stays honest while
  // iterating); and pixel comparison is the one part of the suite that fails
  // for reasons other than a bug, so keeping it separate makes a red check
  // self-describing.
  projects: [
    { name: 'desktop', testIgnore: /visual\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testIgnore: /visual\.spec\.js/, use: { ...MOBILE_DEVICE } },
    { name: 'visual', testMatch: /visual\.spec\.js/, use: { ...MOBILE_DEVICE } },
  ],
  webServer: {
    command: 'npm run dev -- --port 5175',
    url: 'http://localhost:5175',
    // Reusing a server in CI masks port conflicts and produces confusing
    // failures; always start a clean one there.
    reuseExistingServer: !process.env.CI,
  },
})
