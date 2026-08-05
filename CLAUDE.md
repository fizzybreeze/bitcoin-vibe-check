# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Version history

| Version | Changes |
|---|---|
| v1.4.3 | **US fix:** Binance geo-blocks US IP addresses, so US visitors saw no price chart, no 200-day MA and no Mayer Multiple. All OHLC data now comes from Kraken via `src/lib/ohlc.js` — including `scripts/snapshot.js`, which runs on GitHub's US-based runners and was silently affected too. Daily snapshot moved off a home Proxmox box to GitHub Actions + a new `metric_snapshots` Supabase table |
| v1.4.2 | Tooling, not app behaviour. Supabase RLS enabled on `donors` with a matching INSERT policy (schema now tracked in `supabase/migrations/`); lint reduced from 16 errors to 0; dead `OnChainSignalsCard` and `FngArc` removed; GitHub Actions CI + E2E workflows added with `main` protected; e2e suite made hermetic (17/17, no network); Node pinned to 24.x; `.claude/` set up with a SessionStart hook, permission allowlist and `/ship` + `/verify` commands; `.env.example` added and this file corrected |
| v1.4.1 | Social share updated for v1.4: removed dead toggles (Institutional Pulse, On-Chain Signals); added Market Sentiment toggle; Network Health share card updated to match live card; Cycle Indicators share card expanded to 2x2 grid (MVRV, Power Law, 200-Day MA, Mayer Multiple) |
| v1.4.0 | Desktop layout restructured into logical data categories; On-Chain Signals card removed, MVRV merged into Cycle Indicators card (2x2 internal grid, mobile-safe); Network Fees card moved to network health row (3-column with Network Pulse and Recent Blocks); volume source tooltip added to price chart |
| v1.3.0 | ATH distance indicator, Fear & Greed sparkline, hash rate with 30d trend, Network Pulse card restructure (gauge removed, 2x2 grid, full-width sparkline and adjustment bar), Recent Blocks card replacing Whale Watch and Transaction Lookup, sentiment summary line in header replacing static tagline, sats per fiat indicator, live supply issued indicator, desktop 3-column layout, Network Heartbeat merged into Recent Blocks on desktop, chart currency locked to USD with label, CoinGecko Demo API key integrated, Alternative.me calls consolidated to single 30-day fetch, calculation functions extracted to `src/lib/calculations.js`, full test suite rewritten for v1.3.0 |

## Commands

```bash
npm run dev       # start dev server with HMR
npm run build     # production build to dist/
npm run preview   # preview the production build
npm run lint      # run ESLint
npm test          # unit tests (vitest)
npm run test:e2e  # Playwright end-to-end tests
```

## Definition of done

All four must pass before pushing. `/verify` runs them in one go.

| Gate | Expectation |
|---|---|
| `npm run lint` | zero errors — the config is clean, so any error is new |
| `npm test` | all green |
| `npm run build` | succeeds |
| `npm run test:e2e` | all green — required for any UI change |

Rules that hold regardless:

- **Never push to `main`.** It is protected; open a PR from a `claude/*` branch.
  CI (`Lint, test, build` + `Playwright (chromium)`) must pass before merge.
- **Every behaviour change needs a test.** The fast unit suite is what makes it
  safe to review on a phone without reading the whole diff.
- **Never silence a gate to go green.** Deleting an assertion or adding a blanket
  `eslint-disable` turns a real signal into a silent one. A targeted disable is
  acceptable only when the rule is genuinely wrong there, and must carry a
  comment explaining why.
- **Any database change is a migration** in `supabase/migrations/`, never an
  ad-hoc dashboard edit. Re-run the Supabase security advisors after schema
  changes — they should stay at zero lints.
- **Never commit secrets.** `.env` is gitignored; `.env.example` documents the
  shape. This repo is public.

## Architecture

This is a single-page React 19 + Vite 8 app. Logic is split between **`src/App.jsx`** (components and data orchestration) and **`src/utils.js`** (pure helper functions).

### Key source files

| File | Purpose |
|---|---|
| `src/App.jsx` | Most React components, plus all data-fetching and state orchestration |
| `src/utils.js` | Pure helpers: formatting, halving math, dominance labels, tx/address utils |
| `src/utils/cycleCalculations.js` | Power Law fair value, Mayer Multiple |
| `src/lib/calculations.js` | Pure calculation functions (ATH distance, sats per fiat, supply issued, sentiment summary, hash rate trend, mempool pressure) |
| `src/lib/ohlc.js` | Kraken OHLC — URL building, response unwrapping, candle parsing. Shared with `scripts/snapshot.js` |
| `src/lib/supabase.js` | Supabase client (donor name submissions) — returns `null` when env vars are absent |
| `src/index.css` | Tailwind v4 import and dark-mode variant |
| `src/hooks/usePersistedState.js` | `useState` mirrored to localStorage |
| `src/hooks/usePriceAlerts.js` | Price alert thresholds and firing logic |
| `src/hooks/useShareImage.js` | Captures the share canvas via lazy-loaded html2canvas |
| `src/components/CycleIndicatorsCard.jsx` | MVRV, Power Law, 200-Day MA, Mayer Multiple (2×2 grid) |
| `src/components/CardTooltip.jsx` | Info tooltip used across cards |
| `src/components/ShareButton.jsx` · `ShareModal.jsx` · `ShareCanvas.jsx` | Social share flow — trigger, card picker, off-screen render target |
| `src/components/shareCards.js` | `SHARE_CARDS` list (separate module so ShareModal only exports components) |
| `src/components/PriceAlertsButton.jsx` · `PriceAlertsPanel.jsx` | Price alert UI |
| `src/components/BeehiivEmbed.jsx` · `BeehiivForm.jsx` | Newsletter embed |
| `api/chain-data.js` | Vercel serverless function proxying BGeometrics MVRV (24h CDN cache) |
| `supabase/migrations/` | Schema as code — every DB change belongs here |
| `src/__tests__/` · `src/**/__tests__/` | Vitest unit tests |
| `e2e/` | Playwright dashboard smoke tests (fully mocked — no network) |
| `.claude/hooks/session-start.sh` | Installs deps + resolves a chromium for remote sessions |

### Data flow

On mount, `loadData()` fires parallel API calls via `Promise.allSettled`:
- **CoinPaprika** — BTC price (USD/GBP/EUR/CAD/CHF), 24h volume, market cap, dominance
- **Kraken REST** — price ticker (seeds the values the WebSocket then keeps live)
- **mempool.space** — fee tiers, block height, difficulty adjustment, mempool stats, recent blocks, hash rate, Lightning stats
- **alternative.me** — Fear & Greed index (single `?limit=30` call serves both the current value and the sparkline)
- **`/api/chain-data`** — own serverless route, proxying BGeometrics MVRV
- **Kraken OHLC** — 200 daily candles for the 200-day MA and Mayer Multiple

After `loadData()` resolves, results are merged with `localStorage` (key `btc-cache`). The cache write is partial — only non-null fields overwrite stored values. Volume history (last 7 days) is tracked separately under `btc-vol-history`.

Prices are then kept live via a **Kraken WebSocket v2** connection (`wss://ws.kraken.com/v2`), subscribing to the `ticker` channel for BTC/USD, BTC/GBP, BTC/EUR, BTC/CAD, BTC/CHF. The rest of the KPI data refreshes on a 60-second `setInterval`.

Chart data (`fetchChart`) comes from **Kraken OHLC**, with the interval derived from the selected range (1D → 60min/24 candles, 7D → 240min/42, 1M → 1440min/30, 1Y → 1440min/365). Kraken has no limit parameter and returns up to 720 candles, so the app slices client-side. Fetched charts are memoised for the session in a `useRef(new Map())` keyed by range, and the other three ranges are prefetched in the background once the active one loads.

> **Binance is no longer used — it geo-blocks US IP addresses.** US visitors got
> no chart, no 200-day MA and no Mayer Multiple. Everything that used Binance
> klines now uses Kraken OHLC via `src/lib/ohlc.js`, including
> `scripts/snapshot.js`, which runs on GitHub's US-based runners and would have
> been blocked too. Do not reintroduce Binance for anything user-facing.

> **CoinGecko is no longer used either.** Market data comes from CoinPaprika. Some vestigial CoinGecko routes remain mocked in `e2e/dashboard.spec.js`; they simply never match.

### Components

Most live in `src/App.jsx`; the rest are in `src/components/` (noted below).
`src/App.jsx` is ~2,000 lines — when you touch a card in it, consider extracting
that card to `src/components/`, since smaller diffs are what make review on a
phone practical.

| Component | Description |
|---|---|
| `App` | Root — state, effects, layout |
| `BtcPriceCard` | Live BTC price with 24h change, ATH distance, sats per fiat |
| `MarketSentimentCard` | Fear & Greed value, classification and 30-day sparkline |
| `NetworkPulseCard` | Network health — difficulty adjustment bar and 2×2 stat grid |
| `NetworkHeartbeatCard` | Block height, avg block time, last-block breathing dot (mobile only; desktop merges this into Recent Blocks) |
| `RecentBlocksCard` | Last five blocks with live "time ago", plus desktop heartbeat header |
| `VolumeCard` | 24h volume, BTC dominance, 7d avg comparison, market cap |
| `HalvingCountdown` | Blocks remaining, deadline-derived countdown, epoch progress bar |
| `SatoshiQuote` | Auto-rotating Satoshi quotes in the footer |
| `KpiCard` | Generic labelled stat card (also exported for tests) |
| `Skeleton` · `DifficultyBar` · `ChartTooltip` | Small presentational helpers |
| `NewsletterCard` | "Satoshi's Weekly Brief" newsletter signup (Beehiiv embed, shown in sidebar) |
| `NewsletterModal` | Newsletter modal shown 5 s after first visit; dismissed via localStorage flag |
| `DonationCard` | Lightning donation CTA (Strike link + name submission to Supabase) |
| `SupporterTickerCard` | Desktop scrolling ticker of approved donor names fetched from Supabase |
| `MobileSupportersCard` | Mobile pill-badge list of approved donor names |
| `CycleIndicatorsCard` † | MVRV, Power Law, 200-Day MA, Mayer Multiple |
| `ShareButton` · `ShareModal` · `ShareCanvas` † | Social share flow |
| `PriceAlertsButton` · `PriceAlertsPanel` † | Price alert UI |
| `CardTooltip` † | Info tooltip used across cards |

† in `src/components/`

### Sound

Optional audio feedback via Web Audio API (`btc-vibe-sound-enabled` in localStorage). `playBlockThud` fires on new block; `playPriceTick` fires on price change (debounced to 1/s).

### Styling

Tailwind CSS v4 via the `@tailwindcss/vite` plugin — **not** PostCSS. The import in `src/index.css` is `@import "tailwindcss"`. No `tailwind.config.js` needed. The dark-mode variant is defined via `@custom-variant dark` in `index.css`.

### Environment variables

See `.env.example` for the full annotated list. `VITE_`-prefixed variables are
compiled into the client bundle by design and are readable by anyone on the
deployed site — only publishable/anon keys belong there.

| Variable | Read by | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `src/lib/supabase.js` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabase.js` | Supabase anon key |
| `BGEOMETRICS_API_KEY` | `api/chain-data.js` | Server-side only. MVRV data; free tier is 15 req/day |

> `VITE_COINGECKO_API_KEY` is **no longer read by any code** — CoinGecko was
> replaced by CoinPaprika and Kraken. If it is still set in Vercel it can be
> deleted. All remaining data sources are keyless except BGeometrics.

> `src/lib/supabase.js` fails **soft** — `createClient` returns `null` when its
> two vars are missing, so donations silently stop working rather than erroring.

### External APIs

All keyless except BGeometrics, which is proxied server-side.

| API | Endpoint purpose |
|---|---|
| `api.coinpaprika.com` | Price, 24h volume, market cap, BTC dominance |
| `api.kraken.com` | OHLC candles — chart data for every range, plus the 200-day series for MA and Mayer Multiple. Replaced Binance, which geo-blocks the US |
| `api.kraken.com` | REST ticker, seeding prices before the socket connects |
| `wss://ws.kraken.com/v2` | Real-time BTC price ticker (WebSocket), 5 currency pairs |
| `mempool.space` | Fee tiers, block height, difficulty, mempool, recent blocks, hash rate, Lightning stats |
| `api.alternative.me/fng` | Fear & Greed index — single `?limit=30` call used for both current value and 30-day sparkline |
| `/api/chain-data` | Own serverless route → BGeometrics MVRV, cached 24h at the CDN edge |
