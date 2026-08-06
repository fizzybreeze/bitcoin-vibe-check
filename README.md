# Bitcoin Vibe Check

**Read the room.**

A real-time Bitcoin dashboard that surfaces everything you need to understand the current state of the network — price, sentiment, fees, mempool, halving countdown, and more — in a single dark-themed page. Built for people who want a fast, information-dense overview without navigating multiple block explorers or exchanges.

🔗 **Live at [bitcoinvibecheck.com](https://bitcoinvibecheck.com)** — no login, no account, no wallet connection.

---

## Features

### Live Market Data
- **Real-time BTC price** streamed via Kraken WebSocket v2, updating continuously without page refresh
- **24-hour price change** with directional indicator
- **ATH distance indicator** — shows percentage below all-time high, or "AT ATH" when within 0.1%
- **Multi-currency display** — switch between USD, GBP, EUR, CAD, and CHF at any time; all values update instantly
- **24h trading volume** with comparison against the 7-day rolling average
- **Market capitalisation** and **BTC dominance** with market season interpretation (Bitcoin season / Altcoin season / Mixed market)
- **Sats per fiat** — live satoshis-per-unit-of-selected-currency, updating with every price tick
- **Live Bitcoin supply issued** — total BTC issued to date derived from block height, with no extra API call

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
- Range percentage change displayed alongside the chart label
- **High and low reference lines** for the selected period
- **Chart locked to USD** with a clear "Chart in USD" label
- **Volume bars show Kraken BTC/USD pair volume only** — a tooltip in the chart header explains the discrepancy with the 24H Volume card, which shows global volume aggregated across all exchanges
- Manual **refresh button** — useful when using the app as a PWA with no browser chrome
- Chart data is memoised per range for the session, and the three inactive ranges are prefetched in the background once the active one loads, so switching range is instant

### Network Fees & Mempool
- **Fee tiers** — Slow (~1 hour), Medium (~30 min), and Fast (~10 min) in sat/vB
- **Mempool congestion** indicator (Low / Moderate / High) with a visual fill bar and unconfirmed transaction count
- On desktop, the Network Fees card sits in the **network health row** alongside Network Pulse and Recent Blocks (3-column layout)

### Lightning Network
- **Total network capacity** in BTC
- **Channel count** and **node count**

### Price Alerts
- Set custom price alerts for BTC in any supported currency
- Browser **push notification** support with a one-time permission request
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
- **Satoshi's Weekly Brief** — Beehiiv-powered newsletter signup embedded in the sidebar and surfaced as a modal 5 seconds after a first visit
- Modal is shown once per browser (suppressed via `localStorage`); auto-dismisses after a successful subscribe event

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
| Hosting | [Vercel](https://vercel.com) — static site plus two serverless functions |
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
| `/api/chain-data` → [BGeometrics](https://bgeometrics.com) | MVRV Ratio, via this project's own serverless route (24h CDN cache; free tier is 15 requests/day) |

`api/og.js` calls the same keyless sources server-side to draw the link preview. It is not listed above because nothing in the browser requests it — link unfurlers do — so it needs no service-worker caching rule.

> ⚠️ **Binance must not be reintroduced anywhere.** It answers US jurisdictions with HTTP 451, which broke the snapshot job and then the browser chart — US visitors saw no chart, no 200-day MA and no Mayer Multiple. Kraken is the replacement, and `src/lib/ohlc.js` is the single shared implementation.

> CoinGecko is no longer used. It was replaced by CoinPaprika (market data) and Kraken (charts), and `VITE_COINGECKO_API_KEY` is read by no code.

The service worker keeps one NetworkFirst cache per source above. `src/__tests__/pwaRuntimeCaching.test.js` asserts that correspondence, so adding a data source without giving it a cache — or retiring one and leaving its rule behind — fails the unit suite rather than quietly degrading the offline experience.

---

## Project Structure

```
src/
  App.jsx                    most components, plus all data fetching and state orchestration
  utils.js                   pure helpers — formatting, halving math, dominance labels
  lib/
    calculations.js          Vibe Score, ATH distance, sats per fiat, supply issued, hash trend
    ohlc.js                  Kraken OHLC primitives — URL building, unwrapping, candle parsing
    supabase.js              Supabase client; returns null when env vars are absent
  utils/cycleCalculations.js Power Law fair value, Mayer Multiple
  hooks/                     usePersistedState, usePriceAlerts, useShareImage
  components/                BtcPriceCard, CycleIndicatorsCard, share flow, price alerts, tooltip
  __tests__/ · **/__tests__/ Vitest unit tests
api/chain-data.js            Vercel serverless function — BGeometrics MVRV proxy, CORS-restricted
api/og.js                    Vercel serverless function — live link-preview image (@vercel/og)
api/lib/ogView.js            preview layout as a pure model + element tree (no network, no wasm)
scripts/snapshot.js          daily metrics capture → Supabase (runs on GitHub Actions)
supabase/migrations/         schema as code — every DB change belongs here
e2e/                         Playwright dashboard tests (fully mocked, no network)
smoke/                       Playwright tests against the deployed site (real upstreams)
.github/workflows/           ci · e2e · snapshot · claude
vercel.json                  deploy config plus security and caching headers
```

`src/App.jsx` is around 2,000 lines and holds most of the app. When you touch a card in it, consider extracting that card into `src/components/` — smaller diffs are what make review on a phone practical.

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

The e2e suite is hermetic — all APIs are mocked in `e2e/fixtures.js`, so it passes on a restricted network. It does need a chromium build: `npx playwright install --with-deps chromium`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in what you need. `.env` is gitignored; this repository is public, so never commit real values.

| Variable | Read by | Required for | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `src/lib/supabase.js` | Donor submissions and supporter ticker | |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabase.js` | Donor submissions and supporter ticker | |
| `BGEOMETRICS_API_KEY` | `api/chain-data.js` | MVRV in Cycle Indicators | **Server-side only** — set it in Vercel, never with a `VITE_` prefix |

> `VITE_`-prefixed variables are compiled into the client bundle by design and are readable by anyone who opens devtools on the deployed site. Only publishable/anon keys belong there — never a service-role key.

> `src/lib/supabase.js` fails **soft**: `createClient` returns `null` when its two variables are missing, so the donation card silently stops working rather than throwing. Everything else on the dashboard keeps running.

The snapshot job additionally needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as GitHub Actions secrets — see [`scripts/SNAPSHOT_SETUP.md`](scripts/SNAPSHOT_SETUP.md).

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
| `e2e.yml` | push to `main`, all PRs | Playwright chromium; uploads the HTML report as an artifact. Required check: `Playwright (chromium)` |
| `snapshot.yml` | daily at 06:17 UTC, plus manual dispatch | daily metrics → Supabase `metric_snapshots` |
| `smoke.yml` | daily at 07:43 UTC, plus manual dispatch | Playwright against the live site with real upstreams, from a US-hosted runner |
| `claude.yml` | `@claude` mention on an issue, PR or review comment | responds and pushes work back |

`claude.yml` runs only for commenters with **write access** — the action checks repository permissions itself, which is what makes an `@claude` trigger safe on a public repo.

Dependabot opens one grouped npm PR weekly and a monthly Actions PR; React and Vite majors are deliberately excluded.

### Repo tooling for mobile sessions

`.claude/` holds the setup that makes phone-driven development practical: a SessionStart hook that installs dependencies and resolves a chromium, a permission allowlist so routine commands do not re-prompt, and three slash commands — `/ship` (branch, implement, verify, push, open a PR for review), `/verify` (run all four gates and report only failures) and `/preview` (find the PR's Vercel preview URL and check it was built from the latest commit).

Auto-merge is deliberately disabled on this repository. CI proves a change is correct; it cannot tell you whether it looks right. Every PR waits for a human to open the preview and press merge.

---

## Deployment

Vercel builds and deploys the app. `vercel.json` is committed so the configuration is reviewable in a PR rather than living as dashboard click-ops; it sets the framework and build command, security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`), immutable caching for `/assets/*`, and `must-revalidate` for `/sw.js`.

Every branch gets a preview URL. Merging to `main` deploys production to [bitcoinvibecheck.com](https://bitcoinvibecheck.com).

There are two serverless functions:

- **`api/chain-data.js`** proxies BGeometrics MVRV with a 24-hour CDN cache. Its CORS allowlist is restricted to this project's own origins plus its Vercel preview namespace — a wildcard would let any site burn the 15-requests-per-day free tier.
- **`api/og.js`** renders the link-preview image, reached as `/og-live.png` via a rewrite in `vercel.json`. It is an unauthenticated compute endpoint, so the edge cache is the defence: `s-maxage=300` with a day of `stale-while-revalidate` collapses a burst of unfurls into one render. It never calls `/api/chain-data` — that quota belongs to the live dashboard.

---

## Data & Scheduled Jobs

Schema lives in `supabase/migrations/`. Both tables have RLS enabled.

| Table | Purpose | Anonymous access |
|---|---|---|
| `donors` | Names submitted via the donation card | `SELECT` where `approved = true`; `INSERT` only with `approved = false`. No update or delete. |
| `metric_snapshots` | One row per UTC day of dashboard metrics (`jsonb`) | `SELECT` only. Writes use the service role. |

`scripts/snapshot.js` captures every dashboard metric once a day and upserts it into `metric_snapshots`, keyed by a generated `captured_on` date, so re-runs are idempotent. It runs on GitHub Actions rather than any local machine, and can be triggered by hand from the Actions tab — including from the GitHub mobile app. Nothing in the app reads the table yet; it exists so historical charting becomes possible. Setup lives in [`scripts/SNAPSHOT_SETUP.md`](scripts/SNAPSHOT_SETUP.md).

Donor notifications come from the `new_donor_notification` trigger on `donors`, which POSTs to a Make.com webhook. That URL is a capability URL and is deliberately not committed — the baseline migration documents it with a placeholder.

---

## Further Reading

| Document | What it covers |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Architecture, data flow, component map, version history — the working reference for anyone (human or agent) changing this code |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Where the product could go next, and what it deliberately will not do — intent, not commitment |
| [`scripts/SNAPSHOT_SETUP.md`](scripts/SNAPSHOT_SETUP.md) | Setting up and operating the daily metrics snapshot |
| [`docs/DEV_WORKFLOW_AUDIT.md`](docs/DEV_WORKFLOW_AUDIT.md) | The August 2026 audit that produced the current CI, security and mobile-development setup — kept as a historical record |
| [`.env.example`](.env.example) | Annotated list of every environment variable |

---

## Licence

[MIT](LICENSE)
