// Smoke tests for the DEPLOYED site. Real upstreams, no mocks.
//
// Run: npm run test:smoke        (defaults to https://bitcoinvibecheck.com)
//      SMOKE_BASE_URL=<url> npm run test:smoke   to point at a preview
//
// Every other gate verifies the code. This verifies the thing visitors load,
// from a US-hosted runner — the vantage point that would have caught #10
// (Binance answering US jurisdictions with HTTP 451) automatically, instead of
// via a hand-run VPN test after users had already lost the chart.
//
// What is deliberately NOT asserted: MVRV. It comes from BGeometrics on a
// 15-request/day free tier and is legitimately absent some of the time. A
// smoke test that pages someone over an expected rate limit trains people to
// ignore it.
import { test, expect } from '@playwright/test'

// The two cycle metrics derived from Kraken OHLC, fetched client-side from
// whatever IP the browser has. These are the geo-block canaries: if a data
// source starts refusing the runner's jurisdiction, these blank out first.
const KRAKEN_DERIVED = ['200-Day Moving Average', 'Mayer Multiple']

// Value paragraph that follows a MetricRow's label. Structure is
// <div><p>LABEL</p><p>VALUE</p>…</div> — see CycleIndicatorsCard.
const valueAfterLabel = (page, label) =>
  page.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]')

test.describe('bitcoinvibecheck.com', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
  })

  test('the page loads and renders its heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Bitcoin Vibe Check' })).toBeVisible()
  })

  test('a live BTC price renders', async ({ page }) => {
    // CoinPaprika seeds it; the Kraken WebSocket then keeps it live. Either
    // path producing a number means the price pipeline is intact.
    await expect(page.getByText(/^\$[\d,]+$/).first()).toBeVisible()
  })

  test('Fear & Greed renders a classification', async ({ page }) => {
    await expect(
      page.getByText(/^(Extreme Fear|Fear|Neutral|Greed|Extreme Greed)$/).first()
    ).toBeVisible()
  })

  // Regression guard for #10. A geo-blocked OHLC source leaves both of these
  // showing the em-dash placeholder while the rest of the page looks healthy,
  // which is exactly why it went unnoticed in production for so long.
  for (const label of KRAKEN_DERIVED) {
    test(`${label} shows a real value, not a placeholder`, async ({ page }) => {
      const value = valueAfterLabel(page, label)
      await expect(value).toBeVisible()
      await expect(value).not.toHaveText('—')
      await expect(value).toHaveText(/\d/)
    })
  }

  test('the Vibe Score renders a 0-100 reading with a temperature label', async ({ page }) => {
    const score = page.getByTestId('vibe-score')
    await expect(score).toBeVisible()

    const value = parseInt((await score.textContent()).trim(), 10)
    expect(Number.isInteger(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThanOrEqual(100)

    await expect(page.getByTestId('vibe-label')).toHaveText(
      /^(Ice Cold|Cold|Cool|Warm|Hot|Overheated)$/
    )
  })

  // #20. The dashboard renders identically whether Supabase is configured or
  // not, so a mistyped variable in Vercel kills donations with nothing on
  // screen to show for it. The supporter ticker is no signal either — an empty
  // list is a legitimate state. The request itself is the signal: the app only
  // issues it when both variables reached the bundle, and only gets a 200 back
  // when the anon key is valid and `donors` is still readable by that role.
  //
  // What this does NOT catch, deliberately: the RLS *policy* being dropped.
  // PostgREST answers that with 200 and zero rows, which is indistinguishable
  // from a quiet week — the same reason the ticker's contents are not asserted.
  test('donations are wired: the deployed bundle reads Supabase and is allowed to', async ({ page }) => {
    // GET only. supabase-js sends an `apikey` header, so the browser preflights
    // this cross-origin read, and the OPTIONS response carries the same URL —
    // matching it would compare a 204 against the 200 asserted below and go red
    // on a healthy site.
    const donorRead = page.waitForResponse(
      (res) => res.request().method() === 'GET' && /\/rest\/v1\/donors\b/.test(res.url())
    )

    // Registered before navigating, because the read fires on mount and would
    // otherwise be over before a listener attached. beforeEach has already
    // loaded the page once; this is a second, observed load.
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // A timeout here means no request was made at all: VITE_SUPABASE_URL or
    // VITE_SUPABASE_ANON_KEY is missing from the production build. The browser
    // console carries the warning naming which one.
    const res = await donorRead
    // A non-200 means the request went out and was refused: a rotated or
    // mistyped anon key (401), or the table grant withdrawn (403).
    expect(res.status()).toBe(200)
  })

  // The live link preview, which until now had no production check of any kind.
  // It fails in the one direction nothing on the page can show: `/api/og`
  // redirects to the static `/og-image.png` on any trouble, so a broken live
  // render looks exactly like the pre-v1.6.0 behaviour — a preview card that
  // unfurls perfectly well and has said the same thing since 2026.
  //
  // `maxRedirects: 0` is what makes this an assertion rather than a formality:
  // followed, the redirect lands on a real PNG and every check below passes.
  test('the link preview is the live render, not the static fallback', async ({ request }) => {
    const res = await request.get('/og-live.png', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('image/png')
  })

  // v1.7.17. Both public routes take no parameters, and a CDN cache key
  // includes the query string — so an unrejected one is a free cache bypass:
  // six upstream fetches and a rasterise on `/api/og`, and a call against
  // BGeometrics' 15-a-day budget on `/api/chain-data`.
  //
  // Asserted against the deployed site because the unit tests call the handlers
  // directly, and the question this answers is the one they cannot: whether the
  // platform's own routing puts anything in `req.query` before the handler sees
  // it. If Vercel ever did, the first test above goes red rather than this one —
  // every unfurl would be shedding to the static image.
  test('a cache-busting query string is refused rather than served', async ({ request }) => {
    const og = await request.get('/og-live.png?bust=1', { maxRedirects: 0 })
    expect(og.status()).toBe(302)
    expect(og.headers().location).toBe('/og-image.png')
    // A refusal cached at the shared edge would pin the generic card in front
    // of everybody else's share.
    expect(og.headers()['cache-control']).toBe('no-store')

    const chain = await request.get('/api/chain-data?bust=1')
    expect(chain.status()).toBe(400)
    expect(chain.headers()['cache-control']).toBe('no-store')
  })

  test('the header reads the room rather than falling back to the tagline', async ({ page }) => {
    // "Read the room." is the fallback shown when not one dimension is
    // available — on the live site that means every upstream failed at once.
    const subtitle = page.locator('header p').first()
    await expect(subtitle).toBeVisible()
    await expect(subtitle).not.toHaveText('Read the room.')
  })
})
