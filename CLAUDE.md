# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Version history

> `package.json` had read `1.4.1` since that release, through v1.4.2, v1.4.3 and
> v1.4.4; it was corrected to `1.4.5` here. **Bump it in the same commit as the
> version-history row above** — a version field that disagrees with this table
> is a third source of truth and worse than none.

| Version | Changes |
|---|---|
| v1.6.1 | **The e2e suite finally looks at a phone (#17).** `playwright.config.js` gains two projects — `desktop` (1280×720) and `mobile` (iPhone 13, 390×844) — so every spec runs twice. Both are pinned to **chromium**: CI installs no other browser, and the `iPhone 13` descriptor carries `defaultBrowserType: 'webkit'`, which would have errored the run rather than widened it. The finding worth recording is that **all 19 existing tests passed at 390px unchanged**, so the `test.skip()` guards the issue anticipated were never needed — and that is the problem, not the reassurance. Those locators are deliberately loose (`.first()`, union regexes) to survive both layouts, which makes them good *content* assertions and useless as *layout* ones; running them twice would have caught none of the mobile bugs in this project's history. So `responsive.spec.js` adds the checks that would have: no horizontal document overflow (the genesis-hash-off-the-side failure, reported with the offending elements named so a red check is actionable from a phone), `NetworkHeartbeatCard` asserted present on mobile **and** absent on desktop, and the halving countdown asserted to render exactly one of its two always-in-the-DOM layouts — a duplicate that `.first()` would never see. The overflow assertion was verified non-vacuous against an injected 549px-wide element before being committed. `screenshot.spec.js` captures the full page at phone width and `e2e.yml` uploads it as its own `mobile-screenshot` artifact, separate from `playwright-report`, so reviewing a *green* run is one tap rather than unpacking a report bundle; the newsletter modal is suppressed via the localStorage flag the app already checks rather than raced. `mockApis` extracted to `e2e/mocks.js` (not `*.spec.js`, so Playwright's `testMatch` leaves it alone). `playwrightProjects.test.js` pins the project set, because deleting the mobile project would fail no e2e test — the suite would simply go back to covering half of what it does now |
| v1.6.0 | **A live link preview** (roadmap §3.3). `/og-live.png` rewrites to `api/og.js`, which renders a 1200×630 PNG at request time — current price, 24h change, ATH distance, Vibe Score with its temperature label, the summary sentence and Fear & Greed — via `@vercel/og` (Satori). `og:image` and `twitter:image` in `index.html` repoint at it. Three decisions worth keeping: **MVRV is deliberately not fetched**, because unfurler traffic would spend the 15-request/day BGeometrics quota the live card depends on (valuation falls back to the Mayer Multiple alone, which `computeVibeScore` already handles); **every failure path redirects to the old static `/og-image.png`**, including `@vercel/og` failing to load, which is why it is a dynamic import — unfurlers do not retry, so a 500 is a blank preview; and **the ₿ character never reaches the image**, because Satori's bundled Geist has no U+20BF glyph and would draw a tofu box in every chat, so the card spells the name out and `ogImage.test.js` pins the whole allowed character set. Layout lives in `api/lib/ogView.js` as a pure model + element tree, so it is testable without rasterising. `src/lib/vibePalette.js` holds both label→hex scales, shared with `ShareCanvas`: the Vibe temperature labels, and Fear & Greed — which is coloured by **the classification alternative.me sends, not by the number**, after the first live preview drew "25 · Extreme Fear" in the amber reserved for Fear. Their bands are theirs to move; the label is what the reader sees. The same disagreement was fixed a second time in `computeVibeSummary`: its **sentiment phrase bands now mirror alternative.me's classification** (0–25 extreme fear, 26–46 fear, 47–54 neutral, 55–75 greed, 76+ extreme greed) rather than being chosen here, since that dimension's value *is* the Fear & Greed score. This changes the live dashboard's header sentence near those edges, not only the preview card |
| v1.5.0 | **The Vibe Score** (roadmap §3.1). One composite 0–100 reading of how hot the market is running, composed in `computeVibeScore` from data already fetched — no new source, no new request. Lives in the lower half of the BTC Price card, which was empty on desktop because the chart beside it sets the row height. Weights: sentiment 30%, valuation 30%, momentum 25%, congestion 10%, network 5%; anchors and formula published in the card tooltip and below. Two design decisions worth keeping: the score is **single-polarity** (every dimension scaled so higher = hotter) because a contrarian valuation dimension cancels the pro-cyclical ones and flattens the range to ~38–72, and momentum reads **30-day price change** rather than price-vs-200d-MA, which is the Mayer Multiple already counted under valuation. Missing inputs drop their dimension and the remaining weights renormalise, subject to a floor of 3 dimensions and 0.6 weight. `computeVibeLabel` retired — the header sentence is now derived from the same dimension values as the number, so the two cannot disagree. `BtcPriceCard` and `Skeleton` extracted from `App.jsx`; the 30-day hash-rate fetch lifted out of `NetworkPulseCard` to App. `/preview` slash command added |
| v1.4.5 | Documentation, plus the dead config that documenting it exposed. `README.md` brought up to date: corrected the Node prerequisite (24.x, not 18+) and the chart cache description (keyed by range — the chart is USD-only); added `BGEOMETRICS_API_KEY` to the env table; added project-structure, development-workflow, deployment, data/scheduled-jobs and docs-index sections. `docs/DEV_WORKFLOW_AUDIT.md` marked as a historical record with a status table; `scripts/SNAPSHOT_SETUP.md` gained a section on why the 200-day series reads Kraken. **Service-worker caching fixed**: it carried a rule for `api.coingecko.com` — replaced two versions earlier — while CoinPaprika, Kraken and `/api/chain-data` had no rule at all, so the PWA cached a host it never called and dropped the price and chart data it did. `runtimeCaching` now covers exactly the five live sources and is pinned by `pwaRuntimeCaching.test.js`. Stale `VITE_COINGECKO_API_KEY` dropped from `ci.yml`; `package.json` version resynced |
| v1.4.4 | **US fix (#10).** The browser chart still called Binance, which answers US jurisdictions with HTTP 451 — so US visitors saw no price chart, no 200-day MA and no Mayer Multiple. Confirmed by VPN test. `fetchChart` and the 200-day series now use Kraken OHLC. Kraken primitives consolidated into `src/lib/ohlc.js`, with `scripts/lib/ohlc.js` (from #9) reduced to a thin wrapper so both callers share one implementation. Vestigial CoinGecko and TxLookup e2e fixtures removed |
| v1.4.3 | Infrastructure. Daily metrics snapshot moved off a home Proxmox box and local SQLite to GitHub Actions + a new Supabase `metric_snapshots` table (drops the unlisted `better-sqlite3` dependency; the data is now queryable by the app); existing schema captured as a baseline migration; `vercel.json` committed with security and caching headers; `api/chain-data.js` CORS narrowed from `*` to this project's own origins; Dependabot and a PR template added |
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
npm run test:e2e  # Playwright end-to-end tests (mocked, hermetic)
npm run test:smoke # Playwright against the deployed site (real upstreams)
```

## Definition of done

All four must pass before pushing. `/verify` runs them in one go.

| Gate | Expectation |
|---|---|
| `npm run lint` | zero errors — the config is clean, so any error is new |
| `npm test` | all green |
| `npm run build` | succeeds |
| `npm run test:e2e` | all green — required for any UI change. Runs every spec twice, desktop and mobile; `--project=mobile` narrows it while iterating |
| `npm run test:smoke` | **not** part of the pre-push gates — it hits the deployed site, so it can only be meaningful after a merge. Run it (or the `smoke.yml` dispatch) when you want to confirm production is actually healthy |

Rules that hold regardless:

- **Never push to `main`.** It is protected; open a PR from a `claude/*` branch.
  CI (`Lint, test, build` + `Playwright (chromium)`) must pass before merge.
- **Re-check your base before opening a PR.** A long session can outlive the
  `main` it branched from. Run `git fetch origin main && git log --oneline
  HEAD..origin/main`; if that prints anything, rebase and re-run the gates — a
  clean rebase does not mean the combination still works. Then check
  `git diff --stat origin/main HEAD`: a file showing **pure deletions you did not
  intend** means you are about to revert merged work. PR #12 nearly reverted six
  PRs this way, with auto-merge already enabled.
- **Never enable auto-merge.** It is off for this repo by deliberate choice, at
  both layers: the "Allow auto-merge" repository setting is disabled, and `/ship`
  is written not to turn it on. A PR that merges the moment CI goes green races
  the human to production and makes the Vercel preview URL pointless — CI proves
  the code is *correct*, not that the change *looks right*, and on a visual
  product those are different questions. Open the PR, say what to look at, and
  let a person press merge. Do not re-enable it as a convenience, and do not
  suggest it; if the user wants something merged unattended, they will say so.
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
| `src/lib/calculations.js` | Pure calculation functions (Vibe Score and its summary sentence, ATH distance, sats per fiat, supply issued, hash rate trend, mempool pressure) |
| `src/lib/ohlc.js` | Kraken OHLC primitives — URL building, envelope unwrapping, candle parsing. Shared by the chart and, via `scripts/lib/ohlc.js`, the snapshot job |
| `src/lib/supabase.js` | Supabase client (donor name submissions) — returns `null` when env vars are absent |
| `src/lib/vibePalette.js` | Vibe Score label → hex. Shared by `ShareCanvas` and `api/lib/ogView.js`, both of which render outside the stylesheet |
| `src/index.css` | Tailwind v4 import and dark-mode variant |
| `src/hooks/usePersistedState.js` | `useState` mirrored to localStorage |
| `src/hooks/usePriceAlerts.js` | Price alert thresholds and firing logic |
| `src/hooks/useShareImage.js` | Captures the share canvas via lazy-loaded html2canvas |
| `src/components/BtcPriceCard.jsx` | BTC price, 24h change, ATH distance — and the **Vibe Score** section that fills the space the chart's height creates beside it |
| `src/components/CycleIndicatorsCard.jsx` | MVRV, Power Law, 200-Day MA, Mayer Multiple (2×2 grid) |
| `src/components/Skeleton.jsx` | Shared loading placeholder |
| `src/components/CardTooltip.jsx` | Info tooltip used across cards |
| `src/components/ShareButton.jsx` · `ShareModal.jsx` · `ShareCanvas.jsx` | Social share flow — trigger, card picker, off-screen render target |
| `src/components/shareCards.js` | `SHARE_CARDS` list (separate module so ShareModal only exports components) |
| `src/components/PriceAlertsButton.jsx` · `PriceAlertsPanel.jsx` | Price alert UI |
| `src/components/BeehiivEmbed.jsx` · `BeehiivForm.jsx` | Newsletter embed |
| `api/chain-data.js` | Vercel serverless function proxying BGeometrics MVRV (24h CDN cache); CORS restricted to own origins |
| `api/og.js` | Vercel serverless function rendering the live link-preview image. Fetches the keyless sources, composes the Vibe Score, rasterises via `@vercel/og`; redirects to the static `/og-image.png` on any failure |
| `api/lib/ogView.js` | The preview image as data and as a Satori element tree — pure, no network, no rasterising, so the layout is unit-testable |
| `scripts/snapshot.js` | Daily metrics capture → Supabase `metric_snapshots`. Runs on GitHub Actions, not a local machine — see `scripts/SNAPSHOT_SETUP.md` |
| `vercel.json` | Deploy config and security/caching headers — kept in the repo so it is reviewable |
| `supabase/migrations/` | Schema as code — every DB change belongs here |
| `src/__tests__/` · `src/**/__tests__/` | Vitest unit tests |
| `e2e/` | Playwright dashboard tests (fully mocked — no network). Runs twice, once per project: `desktop` (1280×720) and `mobile` (iPhone 13, 390×844). `mocks.js` holds the shared upstream stubs; `responsive.spec.js` the breakpoint assertions; `screenshot.spec.js` the mobile-only capture |
| `smoke/` | Playwright tests against the **deployed** site — real upstreams, no mocks. Kept out of `e2e/` on purpose: `playwright.config.js` has `testDir: './e2e'` with no `testMatch`, so a spec placed there would join `npm run test:e2e` and break its hermeticity |
| `playwright.smoke.config.js` | Smoke config — `baseURL` defaults to production, overridable via `SMOKE_BASE_URL` |
| `.claude/hooks/session-start.sh` | Installs deps + resolves a chromium for remote sessions |
| `.claude/commands/ship.md` · `verify.md` · `preview.md` | `/ship`, `/verify` and `/preview` — the mobile workflow commands |
| `vite.config.js` | Vite plugins and the `vite-plugin-pwa` service-worker config (precache + runtime caching) |
| `README.md` | Public-facing: features, data sources, local setup, workflow, deployment |
| `docs/DEV_WORKFLOW_AUDIT.md` | The 2026-08-04 audit that produced the current CI/security setup. **Historical** — carries a status banner saying what has since changed |
| `docs/ROADMAP.md` | Product roadmap — forward-looking intent, plus an explicit not-doing list. **Not a commitment.** When an item ships it leaves the roadmap and gains a version-history row above |

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

Chart data (`fetchChart`) comes from **Kraken OHLC** via `src/lib/ohlc.js`, with the interval derived from the selected range (1D → 60min/24 candles, 7D → 240min/42, 1M → 1440min/30, 1Y → 1440min/365). Kraken has no `limit` parameter and returns up to 720 candles, so the app slices client-side. Fetched charts are memoised for the session in a `useRef(new Map())` keyed by range, and the other three ranges are prefetched in the background once the active one loads.

> **CoinGecko is no longer used.** It was replaced by CoinPaprika (market data) and Kraken (charts). The vestigial CoinGecko mocks were removed from `e2e/dashboard.spec.js`.
>
> Two dead references outlived the switch and were removed in v1.4.5: a Workbox
> `runtimeCaching` rule for `api.coingecko.com` in `vite.config.js`, and
> `VITE_COINGECKO_API_KEY` in `ci.yml`'s build step. The caching rule is the
> instructive one — while it sat there caching a host the app never called,
> CoinPaprika, Kraken and `/api/chain-data` had **no** rule, so the PWA was
> dropping exactly the data it existed to keep. `pwaRuntimeCaching.test.js` now
> pins the rule set to the External APIs table below.

### Components

Most live in `src/App.jsx`; the rest are in `src/components/` (noted below).
`src/App.jsx` is ~1,900 lines — when you touch a card in it, consider extracting
that card to `src/components/`, since smaller diffs are what make review on a
phone practical.

| Component | Description |
|---|---|
| `App` | Root — state, effects, layout |
| `BtcPriceCard` † | Live BTC price with 24h change, ATH distance, and the Vibe Score with its five components |
| `MarketSentimentCard` | Fear & Greed value, classification and 30-day sparkline |
| `NetworkPulseCard` | Network health — difficulty adjustment bar and 2×2 stat grid |
| `NetworkHeartbeatCard` | Block height, avg block time, last-block breathing dot (mobile only; desktop merges this into Recent Blocks) |
| `RecentBlocksCard` | Last five blocks with live "time ago", plus desktop heartbeat header |
| `VolumeCard` | 24h volume, BTC dominance, 7d avg comparison, market cap |
| `HalvingCountdown` | Blocks remaining, deadline-derived countdown, epoch progress bar |
| `SatoshiQuote` | Auto-rotating Satoshi quotes in the footer |
| `KpiCard` | Generic labelled stat card (also exported for tests) |
| `Skeleton` † · `DifficultyBar` · `ChartTooltip` | Small presentational helpers |
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

### The Vibe Score

`computeVibeScore` in `src/lib/calculations.js`. A pure function over data the
dashboard already fetched — no network call, no new dependency, no new
`runtimeCaching` rule.

| Dimension | Input | Anchors (clamped) | Weight |
|---|---|---|---|
| Sentiment | Fear & Greed | 0–100 direct | 30% |
| Valuation | mean of Mayer Multiple and MVRV | Mayer 0.8 → 2.4; MVRV 1.0 → 3.7 | 30% |
| Momentum | 30-day price change from the 200-day candle series | −25% → +25% | 25% |
| Congestion | mean of fastest fee tier and mempool pressure | log₁₀ 1 → 100 sat/vB; 0 → 200k txs | 10% |
| Network | 30-day hash-rate trend | −10% → +15% | 5% |

Three rules that are load-bearing, not stylistic:

- **Single polarity.** Every dimension is scaled so higher means hotter. The
  roadmap originally proposed a contrarian valuation dimension inside an
  otherwise pro-cyclical composite; scored against five historical market
  states that version spanned only 38–72 and read the December 2022 bottom as
  45 — "slightly below neutral". Single polarity spans 8–76 on the same inputs.
  It also keeps the number descriptive: a score where *cheap* pushes the value
  up is a buy signal by another name, and signals are in §7's not-doing list.
- **Momentum is not the Mayer Multiple.** Mayer *is* price ÷ 200-day MA, so
  sourcing momentum from the same ratio would have put 35% of the score on one
  number. It reads 30-day price change instead, off candles already in memory.
- **Degrade, never vanish.** A missing input drops its dimension and the rest
  renormalise — MVRV rides a 15-request/day free tier and will be absent
  sometimes. Below 3 dimensions or 0.6 of the weight the function returns
  `null` and the card says so rather than inventing a number.

The header sentence comes from `computeVibeSummary`, over the same dimension
values, naming the three furthest from neutral. Deriving both from one source is
what stops the words and the number contradicting each other on screen.

> **The weights are not calibrated against anything.** `metric_snapshots` held 2
> rows when this shipped, so there was no history to fit them to. They are
> chosen for legibility and live in `VIBE_WEIGHTS`/`VIBE_ANCHORS` so they are
> cheap to revise. If the score is ever persisted, persist the *inputs* and
> recompute — storing the score itself puts a permanent discontinuity in the
> series at every weight change.

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
| `api.kraken.com` | OHLC candles — chart data for every range, plus the 200-day series for MA and Mayer Multiple. Also the REST ticker that seeds prices before the socket connects |
| `wss://ws.kraken.com/v2` | Real-time BTC price ticker (WebSocket), 5 currency pairs |
| `mempool.space` | Fee tiers, block height, difficulty, mempool, recent blocks, hash rate, Lightning stats |
| `api.alternative.me/fng` | Fear & Greed index — single `?limit=30` call used for both current value and 30-day sparkline |
| `/api/chain-data` | Own serverless route → BGeometrics MVRV, cached 24h at the CDN edge |

> `/api/og` (reached as `/og-live.png`) calls the same keyless sources
> server-side to draw the link preview. It is **not** in the table above because
> nothing in the browser requests it — it exists for link unfurlers, so it needs
> no `runtimeCaching` rule and `pwaRuntimeCaching.test.js` is unaffected. It
> deliberately skips `/api/chain-data`: MVRV's free tier is 15 requests/day and
> that quota belongs to the live card, not to chat previews.

> ⚠️ **Do not reintroduce Binance anywhere.** It answers US jurisdictions with
> HTTP 451. This bit the project twice:
>
> 1. **The snapshot job** (#9) — GitHub Actions runners are US-hosted, so the
>    fetch failed 100% of the time and silently recorded a null 200-day MA on
>    every run.
> 2. **The browser app** (#10) — `fetchChart` runs client-side from each
>    visitor's own IP, so it worked fine outside the US while US visitors saw no
>    price chart, no 200-day MA and no Mayer Multiple. Confirmed by VPN test.
>
> Both now use Kraken OHLC. The primitives live in `src/lib/ohlc.js`;
> `scripts/lib/ohlc.js` wraps them for the snapshot job, which wants a `null`
> rather than a throw when Kraken reports an error, and refuses to average a
> series shorter than 200 candles because its output is persisted permanently.

### Database (Supabase Postgres)

Schema lives in `supabase/migrations/`. Both tables have RLS enabled; re-run the
security advisors after any change and expect zero lints.

| Table | Purpose | Anon access |
|---|---|---|
| `donors` | Names submitted via the donation card | `SELECT` where `approved = true`; `INSERT` only with `approved = false`. No update or delete. |
| `metric_snapshots` | One row per UTC day of dashboard metrics (`jsonb`), written by the Actions snapshot job | `SELECT` only. Writes are service-role. |

`metric_snapshots` is keyed by a generated `captured_on` date with a unique
index, so the job upserts and re-runs are idempotent. Nothing in the app reads it
yet — it exists so historical charting becomes possible.

> A Supabase Database Webhook (`new_donor_notification`) POSTs each new donor row
> to a Make.com automation. That URL is a capability URL and is deliberately
> **not** committed — the baseline migration documents it with a placeholder.
> Manage it from the Supabase dashboard, not from the repo.

### Scheduled jobs

| Job | Where | Cadence |
|---|---|---|
| Daily metrics snapshot | GitHub Actions (`snapshot.yml`) | 06:17 UTC, plus `workflow_dispatch` |

There are no `pg_cron` jobs. A `donor-email-worker` job used to run every minute
against an edge function that never existed — every response was a 404, while
pg_cron reported "succeeded" because `net.http_post` only confirms the request
was queued. Removed in `20260805063000_remove_orphaned_donor_email_worker.sql`.

Donor notifications do **not** depend on it. They come from the
`new_donor_notification` trigger on `donors`, which POSTs to a Make.com webhook.

### Workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | push to `main`, all PRs | lint + unit tests + build. Required check: `Lint, test, build` |
| `e2e.yml` | push to `main`, all PRs | Playwright chromium, desktop + mobile projects. Uploads `playwright-report` and, separately, a `mobile-screenshot` artifact of the dashboard at 390×844. Required check: `Playwright (chromium)` |
| `snapshot.yml` | daily cron + manual | daily metrics → `metric_snapshots` |
| `smoke.yml` | daily cron + manual | Playwright against the **deployed** site, real upstreams. Not a required check — it verifies production, which by definition exists only after merge |
| `claude.yml` | `@claude` mention | responds on issues, PRs and review comments |

> `claude.yml` runs only for commenters with **write access** — the action checks
> repository permissions itself, which is what makes an `@claude` trigger safe on
> a public repo. Do not add `allowed_bots` or `allowed_non_write_users` without
> reading `docs/security.md` in `anthropics/claude-code-action` first; both bypass
> that check.
