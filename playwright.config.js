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
    // Pinned rather than inherited, so the suite does not depend on whichever
    // project a developer's `.env` last pointed at — and so that CI, which has
    // no `.env` at all, renders the same app as a laptop does.
    //
    // The push toggle is what forced this. `usePushSubscription` reports itself
    // *unconfigured* unless it has both a VAPID key and a Supabase client, and
    // an unconfigured panel never renders the control — so `alerts.spec.js`'s
    // push specs passed locally against a real `.env` and failed on the runner
    // with "element(s) not found". Both halves are needed; supplying only the
    // key reproduces the same red.
    env: {
      ...process.env,
      // A throwaway **public** VAPID key. The private half was discarded at
      // generation and nothing in the suite signs anything.
      VITE_VAPID_PUBLIC_KEY:
        'BCHIb2Jdw6QExyZ6ND0x7BJKXWUTc00hyrNNliPLrspiMjWGJsKoGKfOBo2HU7a41Gkcu6W0nsLZP1YWP1Pk4BE',
      // A host that can never resolve, routed to empty results by `mocks.js`.
      // `.invalid` is reserved by RFC 2606 precisely so it cannot be registered
      // — which means a missing route fails loudly as a DNS error rather than
      // quietly reaching somebody's real project. Before this, a developer with
      // a populated `.env` was running the "fully mocked, no network" suite
      // against their live Supabase on every run.
      VITE_SUPABASE_URL: 'https://e2e.supabase.invalid',
      VITE_SUPABASE_ANON_KEY: 'e2e-anon-key-not-a-real-credential',
    },
  },
})
