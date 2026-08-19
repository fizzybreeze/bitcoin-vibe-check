# Bitcoin Vibe Check

**Read the room.**

A real-time Bitcoin dashboard that surfaces everything you need to understand the current state of the network — price, sentiment, fees, mempool, halving countdown, and more — on a single page, in your choice of dark or light. Built for people who want a fast, information-dense overview without navigating multiple block explorers or exchanges.

🔗 **Live at [bitcoinvibecheck.com](https://bitcoinvibecheck.com)** — no login, no account, no wallet connection.

---

## Features

### Live Market Data
- **Real-time BTC price** streamed via Kraken WebSocket v2, updating continuously without page refresh
- **24-hour price change** with directional indicator, **in the currency you have selected** — it is read from that currency's own Kraken pair rather than from BTC/USD. Outside US dollars it appears once the socket connects, because CoinPaprika quotes one market and a dollar figure under a sterling price is a wrong answer where a blank is an honest one
- **ATH distance indicator** — shows percentage below all-time high, or "AT ATH" when within 0.1%
- **Multi-currency display** — switch between USD, GBP, EUR, CAD, and CHF at any time; all values update instantly
- **24h trading volume** with comparison against the 7-day rolling average
- **Market capitalisation** and **BTC dominance** with market season interpretation (Bitcoin season / Altcoin season / Mixed market)
- **Sats per fiat** — live satoshis-per-unit-of-selected-currency, updating with every price tick
- **Live Bitcoin supply issued** — total BTC issued to date derived from block height, with no extra API call

### Appearance
- **Dark and light themes**, toggled from the header and remembered per device
- **Follows your operating system** until you say otherwise — the toggle is a preference, not a one-off
- **No flash on load** — the theme is applied by an inline script before the first paint, not by React
- **Every text colour clears WCAG AA (4.5:1) in both themes**, asserted in the test suite rather than eyeballed
- The exported share image follows whichever theme you are reading in; the link-preview card is always dark

### The Vibe Score
- **One composite 0–100 reading** of how hot the market is running, in the BTC Price card. Not a new data source — a synthesis of what the dashboard already fetches, so it costs no extra request
- **Never a black box** — the five components are listed beneath the score with their individual 0–100 values, and the full formula and weights are in the card tooltip
- **Weights**: sentiment 30% (Fear & Greed), valuation 30% (Mayer Multiple and MVRV), momentum 25% (30-day price change), congestion 10% (fee tier and mempool), network 5% (30-day hash-rate trend)
- **Single-polarity by design** — every input is scaled so that higher means hotter (greedier, more extended, more congested). 100 is euphoric, 0 is frozen. It is a summary of public metrics, not advice, and deliberately not a buy or sell signal
- **Degrades rather than disappears** — a missing input drops its dimension and the remaining weights renormalise, with the card stating how many of the five it scored on. Below three dimensions, or 60% of the weight, no score is shown at all

### Sentiment & Network Health
- **Live sentiment summary line** in the header — a human-readable sentence derived from the same dimension values as the Vibe Score, so the words and the number can never contradict each other
- **Market Sentiment card** — Fear & Greed index (0–100) from Alternative.me, with colour-coded classification label and 30-day sparkline
- **Network Pulse card** — Hash Rate and Difficulty side by side, with a full-width difficulty adjustment bar below
- **Hash rate** — current network hash rate in EH/s with a **30-day trend indicator** (▲/▼ percentage)
- **Mining difficulty** — current epoch change percentage, time until next adjustment, and textual interpretation
- **Recent Blocks feed** — live list of the five most recent blocks with transaction count, total fees, and average fee rate
- **Network Heartbeat merged into Recent Blocks** on desktop — block height, average block time, and last-block breathing dot appear as a header above the block list on large screens
- **Average block time** — colour-coded green/amber/red relative to the 10-minute target
- **Current block height** with animated breathing dot showing the time since the last block

### Halving Countdown
- **Live countdown timer** (days, hours, minutes) ticking down in real time
- **Blocks remaining** to the next halving
- **Estimated date** for the next halving
- **Epoch progress bar** showing how far through the current 210,000-block epoch the network has advanced

### Cycle Indicators
- **MVRV Ratio** — Market Value to Realised Value ratio; values below 1 have historically marked cycle bottoms, above 3.5 marked cycle tops
- **Power Law Fair Value** — long-run price model based on Bitcoin's logarithmic growth curve
- **200-Day Moving Average** — computed from the last 200 daily closes; shows current price relative to the trend
- **Mayer Multiple** — ratio of current price to the 200-day MA; readings above 2.4 have historically indicated overheating
- Displayed in a **2×2 grid layout** on tablet and desktop, single column on mobile
- MVRV is fetched via a serverless proxy from BGeometrics; the other three are derived from Kraken daily OHLC data

### Price Chart
- Interactive area chart with overlaid volume bars
- Four time ranges: **1D · 7D · 1M · 1Y**
- **Range percentage change alongside the chart label, named with the range it measures** (`+2.41% · 1D`). It is first-point-to-last-point of what is drawn, which is deliberately *not* the same measurement as the header's rolling 24-hour change — the label is what stops one being read as the other's error
- **High and low reference lines** for the selected period
- **Follows the currency selector** — the chart is redrawn from Kraken's market for the selected currency (XBT/USD, GBP, EUR, CAD, CHF), so the axis, the reference lines and the tooltip all quote real trades in that currency rather than a converted dollar series. If Kraken has no market for a selection the chart falls back to USD, labels itself USD, and says which market was missing
- **Volume bars show one Kraken pair only** — a tooltip in the chart header names the pair and explains the discrepancy with the 24H Volume card, which shows global volume aggregated across all exchanges
- Manual **refresh button** — useful when using the app as a PWA with no browser chrome
- **The last point tracks the live price** while its candle is still forming. Kraken's final candle is the bucket currently being written, so its close *is* the last trade — and the socket is already streaming that, so this costs no extra request. Once that candle closes the chart stops updating rather than overwriting it, because writing a later price against an earlier label would be a fabricated point
- Chart data is memoised per range *and currency* for the session, and the three inactive ranges are prefetched in the background once the active one loads, so switching range is instant

### Network Fees & Mempool
- **Fee tiers** — Slow (~1 hour), Medium (~30 min), and Fast (~10 min) in sat/vB
- **Mempool congestion** indicator (Low / Moderate / High) with a visual fill bar and unconfirmed transaction count
- On desktop, the Network Fees card sits in the **network health row** alongside Network Pulse and Recent Blocks (3-column layout)

### Lightning Network
- **Total network capacity** in BTC
- **Channel count** and **node count**

### Price Alerts
- Set custom price alerts for BTC in any supported currency
- Alerts on **price, network fees, Fear & Greed and the Mayer Multiple**, not just price
- **Push to this device** — an optional toggle that registers the browser for Web Push, so alerts arrive with the tab closed. Requires `VITE_VAPID_PUBLIC_KEY` in the browser; without it the panel says so rather than offering a toggle that stores nothing. The sending half is `api/push-evaluate.js`, which `pg_cron` calls every five minutes
- With push off, alerts fire as in-tab notifications and **only while the tab is open** — the panel states which of the two you are getting in every state
- Active alerts shown via an indicator on the header button; triggered alerts are tracked separately
- Alert panel accessible from the header on any screen size
- Alerts persist in `localStorage` (`btc-vibe-price-alerts`)

### Social Share
- **Share button** in the header opens a card picker, then renders the chosen card off-screen and captures it as an image
- Eight shareable cards: BTC Price, Market Sentiment, 24h Volume, Network Health, Next Halving, Recent Blocks, Network Fees, and Cycle Indicators
- `html2canvas` is lazy-loaded on first use, so the ~199 kB dependency stays out of the main bundle

### Live Link Preview
- Pasting the URL anywhere that unfurls links renders a **live** card, not a static image: current price, 24h change, distance from ATH, the Vibe Score with its temperature label, the summary sentence, and Fear & Greed
- `og:image` and `twitter:image` point at `/og-live.png`, which rewrites to the `api/og` serverless function and rasterises with [`@vercel/og`](https://vercel.com/docs/og-image-generation) (Satori)
- Cached at the edge for five minutes and served stale for a day, so a burst of unfurls costs one render
- Any failure — a dead upstream, or the renderer itself failing to load — redirects to the static `/og-image.png`, so a preview is never blank

### Header & Navigation
- **Live indicator** showing whether the WebSocket price feed is connected, with fallback to last-updated timestamp
- **Currency selector** — always visible
- **Sound toggle** and **Price Alerts button** in the header

### Sound Mode
- Optional ambient sound mode toggled from the header
- Synthesised entirely with the **Web Audio API** — no external audio files
  - Deep thud (80 Hz) when a new block is found
  - High tone (880 Hz) on price increases, lower tone (440 Hz) on decreases
  - Price ticks are debounced to a maximum of one per second
- Preference persisted in `localStorage` (`btc-vibe-sound-enabled`); AudioContext is only created after the first user interaction to comply with browser autoplay policy

### Progressive Web App
- Fully installable on **iOS, Android, and desktop** via the browser's native install prompt
- **Service worker** (Workbox via `vite-plugin-pwa`) precaches the built assets and applies NetworkFirst runtime caching to every data source listed below — the network answer always wins when it arrives, and the cache is consulted only when a request fails or times out
- The last-fetched dashboard state is mirrored to `localStorage` (`btc-cache`), so a reload — online or off — paints real numbers immediately instead of skeletons

### Newsletter
- **Satoshi's Weekly Brief** — Beehiiv-powered newsletter signup shown above the donation card and surfaced as a modal 5 seconds after a first visit
- Modal is shown once per browser (suppressed via `localStorage`); auto-dismisses after a successful subscribe event
- The brief itself is **drafted for you every Sunday** by `snapshot.yml`, from the week of snapshot rows already in the database: the price arc, the Vibe Score and its week-over-week move, block production, fees, sentiment and dominance, all composed as prose. Two sections — *WHY IT MATTERS* and *ONE THING TO WATCH* — come through deliberately empty, because they need reporting and a view, and this project generates neither. **Nothing is sent**: there is no beehiiv credential in that job

### Lightning Donations & Supporters
- **Donate via Strike** — one-click link to `strike.me/fizzybreeze` for Lightning payments
- After paying, visitors submit their name or handle; entries are stored in **Supabase** with `approved: false` and go live within 24 hours once approved
- Approved donors are displayed in a scrolling ticker on desktop and as pill badges on mobile

### Quality of Life
- **Satoshi quote rotator** in the footer — eight quotes cycling every 12 seconds with a fade transition, and a small easter egg once you have seen them all
- Fully **responsive** — single-column layout on mobile, optimised **3-column grid on desktop** organised by data category
- No login, no account required

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [React 19](https://react.dev) |
| Build tool | [Vite 8](https://vitejs.dev) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) (via `@tailwindcss/vite`, no PostCSS) |
| Charts | [Recharts](https://recharts.org) |
| PWA | [vite-plugin-pwa](https://vite-pwa-org.netlify.app) + [Workbox](https://developer.chrome.com/docs/workbox) |
| Unit tests | [Vitest](https://vitest.dev) + [Testing Library](https://testing-library.com) |
| E2E tests | [Playwright](https://playwright.dev) |
| Hosting | [Vercel](https://vercel.com) — static site plus three serverless functions |
| Database | [Supabase](https://supabase.com) Postgres (donor names, daily metric snapshots) |
| CI / cron | [GitHub Actions](https://docs.github.com/actions) |
| Newsletter | [Beehiiv](https://beehiiv.com) (embedded signup form) |

---

## Data Sources

Every source is keyless except BGeometrics, which is proxied server-side so the key never reaches the browser.

| Source | What it provides |
|---|---|
| [CoinPaprika API](https://api.coinpaprika.com) | BTC price, 24h volume, market cap, 24h change, ATH, BTC dominance |
| [Kraken REST API](https://docs.kraken.com/api/docs/rest-api/get-ohlc-data) | OHLC candles for the price chart and the 200-day MA / Mayer Multiple, plus the ticker that seeds prices before the socket connects |
| [Kraken WebSocket v2](https://docs.kraken.com/websockets-v2/) | Real-time BTC ticker in USD, GBP, EUR, CAD, and CHF |
| [mempool.space API](https://mempool.space/docs/api) | Recommended fee tiers, current block height, difficulty adjustment, mempool stats, recent blocks, Lightning Network statistics, hash rate |
| [Alternative.me Fear & Greed API](https://alternative.me/crypto/fear-and-greed-index/) | Fear & Greed index — one `?limit=30` call serves both the current value and the 30-day sparkline |
| `/api/chain-data` → [BGeometrics](https://bgeometrics.com) | MVRV Ratio, via this project's own serverless route (24h CDN cache; free tier is 15 requests/day). Falls back to the last stored MVRV in `metric_snapshots` when the budget is exhausted |

`api/og.js` calls the same keyless sources server-side to draw the link preview. It is not listed above because nothing in the browser requests it — link unfurlers do — so it needs no service-worker caching rule.

> ⚠️ **Binance must not be reintroduced anywhere.** It answers US jurisdictions with HTTP 451, which broke the snapshot job and then the browser chart — US visitors saw no chart, no 200-day MA and no Mayer Multiple. Kraken is the replacement, and `src/lib/ohlc.js` is the single shared implementation.

> CoinGecko is no longer used. It was replaced by CoinPaprika (market data) and Kraken (charts), and `VITE_COINGECKO_API_KEY` is read by no code.

The service worker keeps one NetworkFirst cache per source above. `src/__tests__/pwaRuntimeCaching.test.js` asserts that correspondence, so adding a data source without giving it a cache — or retiring one and leaving its rule behind — fails the unit suite rather than quietly degrading the offline experience.

The worker itself is `src/sw.js`, built with `vite-plugin-pwa`'s `injectManifest` strategy rather than `generateSW`. That is not a preference: `push` and `notificationclick` are events, and generateSW writes the whole worker from a config block, leaving no source file to hang a listener on.

---

## Project Structure

```
src/
  App.jsx                    the root component — state, effects and data orchestration
  main.jsx                   the entry point
  index.css                  Tailwind import, the theme tokens, and the CRT/circuit layers
  sw.js                      the service worker — precache, the caching routes, push listeners
  utils.js                   pure helpers — formatting, halving math, dominance labels
  lib/
    calculations.js          Vibe Score, ATH distance, sats per fiat, supply issued, hash trend
    marketData.js            raw upstream responses → the state App holds, and which source
                             stands in for which (and which deliberately has no stand-in)
    ohlc.js                  Kraken OHLC primitives — URL building, unwrapping, candle parsing,
                             and the in-flight dedupe the three daily-candle callers share
    chartSeries.js           which candles the chart draws, in which currency, and the socket
                             patch that keeps the last point live while its candle is open
    chartCache.js            the per-range-per-currency store — cache plus in-flight join
    alertRules.js            what an alert is and when it fires — shared with the sender
    vibeHistory.js           which snapshot rows are comparable enough to plot
    scales.js                the band ladders (vibe, Fear & Greed, MVRV, congestion, block time)
    palette.js               every colour in both themes — the source of truth index.css mirrors
    typography.js            the font stacks and the card label/value/shell class constants
    icons.js                 every icon on one 24×24 grid, plus the header button shell
    wordmark.js              the header title as a ten-glyph pixel alphabet
    vibeCharacter.js         the pixel-art figure beside the Vibe Score
    crt.js · circuitry.js    the CRT scanline treatment and the circuit-trace page ground
    runtimeCaching.js        one NetworkFirst rule per data source, read by the service worker
    pushMessage.js           what a push payload shows, and where clicking it is allowed to go
    pushRules.js             which rule fields leave the device, and the per-browser secret
    pushSubscription.js      a PushSubscription as a table row, and what the insert's outcome means
    vapid.js                 the VAPID public key decoded and checked before the browser sees it
    quotes.js                the Satoshi quotes, shared by the footer and the brief's sign-off
    supabase.js              Supabase client; returns null when env vars are absent
    supabaseEnv.js           which vars it needs and the warning naming the missing one
  utils/cycleCalculations.js Power Law fair value, Mayer Multiple
  hooks/                     useTheme, usePersistedState, useMetricAlerts, usePushSubscription,
                             useDialogFocus, useShareImage, useVibeHistory
  components/                every card, plus the share flow, price alerts and tooltip
  __tests__/ · **/__tests__/ Vitest unit tests
api/chain-data.js            Vercel serverless function — BGeometrics MVRV proxy, CORS-restricted
api/lib/mvrvFallback.js      which stored snapshot row the MVRV fallback serves, and when it refuses
api/push-evaluate.js         the push sender — pg_cron calls it every 5 min; sends, then reaps
api/lib/pushEvaluator.js     which rules crossed, in which currency, and what a push status means
api/og.js                    Vercel serverless function — live link-preview image (@vercel/og)
api/lib/ogView.js            preview layout as a pure model + element tree (no network, no wasm)
api/lib/abuseGuard.js        the query-string refusal and per-address rate limit both routes share
scripts/snapshot.js          daily metrics capture → Supabase (runs on GitHub Actions)
scripts/lib/metrics.js       the snapshot row as a pure function, importing the live calculations
scripts/newsletter-draft.js  drafts the weekly brief from the stored rows — sends nothing
scripts/lib/newsletterDraft.js  what the brief says, what it refuses to say, and what it leaves blank
scripts/nostr-post.js        publishes the day's vibe to Nostr, behind a volatility guard
scripts/lib/socialPost.js    what the post says, and the guard that decides not to post
scripts/lib/mark.js          the logo, as a pixel grid
scripts/generate-icons.mjs   rasterises the PWA/notification icons — run by hand, not in CI
scripts/generate-og-image.mjs  rasterises the static link-preview fallback — also by hand
scripts/lib/autoMerge.js     the two decisions the Dependabot auto-merge workflow makes
scripts/lib/rollbackTarget.js which production deployment to roll back to, as a pure function
supabase/migrations/         schema as code — every DB change belongs here
e2e/                         Playwright dashboard tests (fully mocked, no network)
smoke/                       Playwright tests against the deployed site (real upstreams)
.github/workflows/           ci · e2e · visual-baselines · snapshot · smoke ·
                             dependabot-auto-merge · claude
vercel.json                  deploy config plus security and caching headers
```

Every card lives in `src/components/`. `src/App.jsx` keeps the root component,
its state and its effects — that was the end state issue #22 asked for, and it
is there as of v1.7.0. A new card belongs in `src/components/`, not in
`App.jsx`: smaller diffs are what make review on a phone practical.

---

## Running Locally

### Prerequisites

- **Node.js 24.x** — pinned via `engines` in `package.json`, and the same version is used by Vercel and CI
- **npm** 10 or later (ships with Node 24)

### Installation

```bash
git clone https://github.com/fizzybreeze/bitcoin-vibe-check.git
cd bitcoin-vibe-check
npm install
```

The app runs without any environment variables — every dashboard data source is public. Only donations and MVRV need configuration; see [Environment Variables](#environment-variables).

### Development

```bash
npm run dev
```

Opens a local dev server at `http://localhost:5173` with hot module replacement. Note: the service worker is not active in development mode. To test PWA behaviour, use the production preview instead.

### Production build

```bash
npm run build
npm run preview
```

Builds to `dist/` and serves it locally. The service worker is active in preview mode and the app can be installed from the browser.

### Linting and tests

```bash
npm run lint       # ESLint
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end tests (Playwright, chromium)
```

The e2e suite is hermetic — every upstream is stubbed in `e2e/mocks.js` from the data in `e2e/fixtures.js`, so it passes on a restricted network. It runs the behavioural specs twice, at desktop and mobile viewports, plus a `visual` project that pixel-compares four cards. It does need a chromium build: `npx playwright install --with-deps chromium`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in what you need. `.env` is gitignored; this repository is public, so never commit real values.

| Variable | Read by | Required for | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `src/lib/supabase.js` | Donor submissions and supporter ticker | |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabase.js` | Donor submissions and supporter ticker | |
| `VITE_VAPID_PUBLIC_KEY` | `src/lib/vapid.js` | Web Push subscriptions | Public by definition. Generate with `npx web-push generate-vapid-keys`; blank means the push toggle says unavailable |
| `VAPID_PRIVATE_KEY` | `api/push-evaluate.js` | Signing pushes | **Server-side only.** Anyone holding it can notify every subscriber |
| `PUSH_EVALUATE_SECRET` | `api/push-evaluate.js` | The push evaluator | **Server-side only.** The bearer token pg_cron presents; must match the `push_evaluate_secret` Vault secret in Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/push-evaluate.js` | The push evaluator | **Server-side only.** The only way to read `push_subscriptions`, which has no `SELECT` policy. Bypasses RLS everywhere — never give it a `VITE_` prefix |
| `BGEOMETRICS_API_KEY` | `api/chain-data.js` | MVRV in Cycle Indicators | **Server-side only** — set it in Vercel, never with a `VITE_` prefix |
| `SUPABASE_URL` · `SUPABASE_ANON_KEY` | `api/chain-data.js` | The MVRV fallback (optional) | Falls back to the `VITE_` pair, which is the same project. Anon, never service-role |

> `VITE_`-prefixed variables are compiled into the client bundle by design and are readable by anyone who opens devtools on the deployed site. Only publishable/anon keys belong there — never a service-role key.

> `src/lib/supabase.js` fails **soft**: `createClient` returns `null` when its two variables are missing, so the donation card silently stops working rather than throwing. Everything else on the dashboard keeps running.

The snapshot job additionally needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as GitHub Actions secrets — see [`scripts/SNAPSHOT_SETUP.md`](scripts/SNAPSHOT_SETUP.md).

It also takes an optional `NOSTR_PRIVATE_KEY` (an `nsec1…` or 64 hex characters).
**That secret is the on/off switch for the daily Nostr post**: without it the step
composes the post, prints it in the run summary and publishes nothing, so the
first run is a dry run you can read and removing the secret stops posting with no
code change. `NOSTR_RELAYS` optionally overrides the relay list.

---

## Development Workflow

`main` is trunk and production, and it is protected. Work happens on short-lived `claude/*` branches that merge via pull request.

### Definition of done

All four gates must pass before pushing. The `/verify` slash command runs them in one go.

| Gate | Expectation |
|---|---|
| `npm run lint` | zero errors — the config is clean, so any error is new |
| `npm test` | all green |
| `npm run build` | succeeds |
| `npm run test:e2e` | all green — required for any UI change |

`npm run test:smoke` is deliberately **not** a pre-push gate: it hits the deployed site, so it can only mean anything after a merge. `smoke.yml` runs it daily against production.

Rules that hold regardless:

- **Never push to `main`.** Open a PR from a `claude/*` branch; CI must pass before merge.
- **Re-check your base before opening a PR.** A long session can outlive the `main` it branched from — merge or rebase, then re-run the gates, and check `git diff --stat origin/main HEAD` for files showing pure deletions you did not intend.
- **Every behaviour change needs a test.** The fast unit suite is what makes a change reviewable on a phone without reading the whole diff.
- **Never silence a gate to go green.** A targeted `eslint-disable` is acceptable only when the rule is genuinely wrong there, and must carry a comment explaining why.
- **Any database change is a migration** in `supabase/migrations/`, never an ad-hoc dashboard edit.

### Workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | push to `main`, all PRs | lint + unit tests + build. Required check: `Lint, test, build` |
| `e2e.yml` | push to `main`, all PRs | Playwright chromium at both viewports plus the visual project; uploads the HTML report and, separately, a mobile screenshot of the dashboard. Required check: `Playwright (chromium)` |
| `snapshot.yml` | daily at 06:17 UTC, plus manual dispatch | daily metrics → Supabase `metric_snapshots`, then the Nostr post, and **on Sundays** the weekly brief (job summary + `weekly-brief` artifact). Dispatch takes `draft_newsletter` to force a brief on any day, and `newsletter_issue` to override its number |
| `visual-baselines.yml` | `update-visual-baselines` label on a PR, or manual dispatch | regenerates the visual-regression baselines **on the runner** and commits them to the PR branch. Baselines made anywhere else fail on font antialiasing alone |
| `dependabot-auto-merge.yml` | Dependabot PRs | merges patch and minor bumps once the required checks are green; majors wait for a human |
| `smoke.yml` | daily at 07:43 UTC, plus manual dispatch | Playwright against the live site with real upstreams, from a US-hosted runner |
| `claude.yml` | `@claude` mention on an issue, PR or review comment | responds and pushes work back |

`claude.yml` runs only for commenters with **write access** — the action checks repository permissions itself, which is what makes an `@claude` trigger safe on a public repo.

Dependabot opens one grouped npm PR weekly and a monthly Actions PR; React and Vite majors are deliberately excluded.

### Repo tooling for mobile sessions

`.claude/` holds the setup that makes phone-driven development practical: a SessionStart hook that installs dependencies and resolves a chromium, a permission allowlist so routine commands do not re-prompt, and four slash commands — `/ship` (branch, implement, verify, push, open a PR for review), `/verify` (run all four gates and report only failures), `/preview` (find the PR's Vercel preview URL and check it was built from the latest commit) and `/rollback` (find the last known-good production deployment and report the direct link — see [If production breaks](#if-production-breaks)).

Auto-merge is deliberately disabled on this repository. CI proves a change is correct; it cannot tell you whether it looks right. Every PR waits for a human to open the preview and press merge.

The one exception is dependency chores. A Dependabot PR bumping a **patch or minor** version merges itself once the required checks are green — there is no preview worth looking at, and the daily production smoke check catches anything that slips through within a day. **Majors always wait for a human**, since that is where breaking changes live. This is done by `dependabot-auto-merge.yml` waiting for the checks and then merging, rather than by GitHub's auto-merge feature, so that feature stays switched off for every other PR in the repo.

---

## Deployment

Vercel builds and deploys the app. `vercel.json` is committed so the configuration is reviewable in a PR rather than living as dashboard click-ops; it sets the framework and build command, security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`), immutable caching for `/assets/*`, and `must-revalidate` for `/sw.js`.

Every branch gets a preview URL. Merging to `main` deploys production to [bitcoinvibecheck.com](https://bitcoinvibecheck.com).

There are three serverless functions:

- **`api/chain-data.js`** proxies BGeometrics MVRV with a 24-hour CDN cache. Its CORS allowlist is restricted to this project's own origins plus its Vercel preview namespace — a wildcard would let any site burn the 15-requests-per-day free tier. When BGeometrics does not answer it serves the most recent MVRV stored in `metric_snapshots`, labelled as such on the card, capped at 7 days old and cached for an hour rather than a day so it cannot outlive the outage that produced it.
- **`api/og.js`** renders the link-preview image, reached as `/og-live.png` via a rewrite in `vercel.json`. It never calls `/api/chain-data` — that quota belongs to the live dashboard.
- **`api/push-evaluate.js`** is the alert sender. `pg_cron` calls it every five minutes with a bearer token from the Supabase Vault; it evaluates the stored rules, signs and sends the pushes, writes back only the rules that were actually delivered, and reaps endpoints the push service reports as gone. It answers 503 rather than 200 when any of its five environment variables is missing, so a misconfiguration is visible in `push_evaluate_log` instead of silently sending nothing.

Both public routes (`chain-data` and `og`) **refuse a query string and rate-limit per client address**. The edge cache alone was not a defence: a CDN cache key includes the query string, so `?1`, `?2`, `?3` missed the cache and ran the function every time — fifteen of those would have spent a day's BGeometrics quota. The two guards protect different things and `api/lib/abuseGuard.js` says which is which.

### If production breaks

**Promote the previous build first. Fix forward afterwards.** `git revert` and push is the *slower* path — it waits for CI and a fresh build, several minutes at best. The previous production deployment already exists on Vercel's edge, so pointing traffic back at it takes effect in seconds and rebuilds nothing.

The path, from a phone:

1. [vercel.com](https://vercel.com) → the **bitcoin-vibe-check** project → the **Deployments** tab.
2. Find the production deployment *below* the current one — the list is newest-first, so the top entry is the build that is broken.
3. Its **⋯** menu carries **Instant Rollback**. Confirm. The production alias moves within seconds; no build runs.
4. Load [bitcoinvibecheck.com](https://bitcoinvibecheck.com) and hard-refresh to confirm.

`/rollback` does steps 1–2 for you and reports the direct link, which is the part that is genuinely hard on a phone. The selection itself lives in `scripts/lib/rollbackTarget.js` with tests, because the intuitive reading of a deployment list — "take the newest production one" — names the broken build.

Two limits worth knowing before you need them:

- **One-tap rollback only reaches one deployment back.** Vercel flags exactly the two newest production deployments as rollback candidates. Anything older is still reachable, but by **Promote to Production** on that deployment rather than by Instant Rollback — a different control, in the same menu.
- **It reverts the deployed build and nothing else.** Rows already written to Supabase stay written, and a service worker already installed on a visitor's device keeps serving its cached shell until it updates.

Then fix forward properly: revert or repair on a branch, through a normal PR, so the next merge to `main` does not redeploy the same bug on top of the rollback.

---

## Data & Scheduled Jobs

Schema lives in `supabase/migrations/`. Both tables have RLS enabled.

| Table | Purpose | Anonymous access |
|---|---|---|
| `donors` | Names submitted via the donation card | `SELECT` where `approved = true`; `INSERT` only with `approved = false`. No update or delete. |
| `metric_snapshots` | One row per UTC day of dashboard metrics (`jsonb`) | `SELECT` only. Writes use the service role. |
| `push_subscriptions` | One row per browser opted in to Web Push, plus the alert rules the sender evaluates | **`INSERT`**; `UPDATE` on the `rules` column only; `SELECT` on the `secret_hash` column only. Both are scoped by RLS to the row whose hash matches the request's `x-push-secret` header, so a browser reaches at most its own row. `endpoint`, `p256dh` and `auth` are readable by nobody — an endpoint is a capability *and* a durable browser identifier. There is deliberately **no delete**: unsubscribing happens in the browser, and dead endpoints are reaped by the sender on a `404`/`410`. |
| `push_evaluate_log` | One row per sender tick, holding the `pg_net` request id so the real HTTP status can be joined back | **None.** All grants revoked plus an explicit deny-all policy; `service_role` and the cron job's `SECURITY DEFINER` function are the whole access list. |

> Row-level security is only half the gate. RLS decides which *rows*; the table grant decides which *verbs* — and `TRUNCATE` bypasses RLS entirely, while Supabase grants it to `anon` by default. Every table above now holds exactly the verbs the app uses. When adding one, revoke first and grant back.

`scripts/snapshot.js` captures every dashboard metric once a day and upserts it into `metric_snapshots`, keyed by a generated `captured_on` date, so re-runs are idempotent. It runs on GitHub Actions rather than any local machine, and can be triggered by hand from the Actions tab — including from the GitHub mobile app. `api/chain-data.js` reads the table for its MVRV fallback, and since v1.6.9 so does the browser — `useVibeHistory` replays the last 30 rows into the Vibe Score sparkline with the anon key, under its own `runtimeCaching` rule scoped to that table. Setup lives in [`scripts/SNAPSHOT_SETUP.md`](scripts/SNAPSHOT_SETUP.md).

Donor notifications come from the `new_donor_notification` trigger on `donors`, which POSTs to a Make.com webhook. That URL is a capability URL and is deliberately not committed — the baseline migration documents it with a placeholder.

---

## Further Reading

| Document | What it covers |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Architecture, data flow, component map, version history — the working reference for anyone (human or agent) changing this code |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Where the product could go next, and what it deliberately will not do — intent, not commitment |
| [`scripts/SNAPSHOT_SETUP.md`](scripts/SNAPSHOT_SETUP.md) | Setting up and operating the daily metrics snapshot |
| [`docs/DEV_WORKFLOW_AUDIT.md`](docs/DEV_WORKFLOW_AUDIT.md) | The August 2026 audit that produced the current CI, security and mobile-development setup — kept as a historical record |
| [`.env.example`](.env.example) | Annotated list of every variable you set yourself, local and deployed. Workflow-internal ones (dispatch inputs, Actions-provided) are documented at their workflow instead |

---

## Licence

[MIT](LICENSE)
