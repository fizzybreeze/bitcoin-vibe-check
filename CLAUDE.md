# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server with HMR
npm run build     # production build to dist/
npm run preview   # preview the production build
npm run lint      # run ESLint
npm test          # unit tests (vitest)
npm run test:e2e  # Playwright end-to-end tests
```

## Architecture

This is a single-page React 19 + Vite 8 app. Logic is split between **`src/App.jsx`** (components and data orchestration) and **`src/utils.js`** (pure helper functions).

### Key source files

| File | Purpose |
|---|---|
| `src/App.jsx` | All React components and data-fetching logic |
| `src/utils.js` | Pure helpers: formatting, halving math, dominance labels, tx/address utils |
| `src/index.css` | Tailwind v4 import and dark-mode variant |
| `src/__tests__/` | Vitest unit tests (utils, KpiCard, txLookup) |
| `e2e/` | Playwright dashboard smoke tests |

### Data flow

On mount, `loadData()` fires nine parallel API calls via `Promise.allSettled`:
- **CoinGecko** — BTC price (USD/GBP/EUR/CAD/CHF), 24h volume, market cap, dominance
- **mempool.space** — fee tiers, block height, difficulty adjustment, mempool stats, recent blocks, Lightning stats
- **alternative.me** — Fear & Greed index

After `loadData()` resolves, results are merged with `localStorage` (key `btc-cache`). The cache write is partial — only non-null fields overwrite stored values. Volume history (last 7 days) is tracked separately under `btc-vol-history`.

Prices are then kept live via a **Kraken WebSocket v2** connection (`wss://ws.kraken.com/v2`), subscribing to the `ticker` channel for BTC/USD, BTC/GBP, BTC/EUR, BTC/CAD, BTC/CHF. The rest of the KPI data refreshes on a 60-second `setInterval`.

Chart data (`fetchChart`) is fetched separately whenever the selected range or currency changes. Fetched charts are memoised for the session in a `useRef(new Map())` keyed by `"${range}-${currency}"` (e.g. `"7D-usd"`).

### Components (all in `src/App.jsx`)

| Component | Description |
|---|---|
| `App` | Root — state, effects, layout |
| `BtcPriceCard` | Live BTC price with 24h change |
| `NetworkPulseCard` | Fear & Greed arc + difficulty adjustment bar |
| `NetworkHeartbeatCard` | Block height, avg block time, last-block breathing dot |
| `VolumeCard` | 24h volume, BTC dominance, 7d avg comparison, market cap |
| `HalvingCountdown` | Blocks remaining, live countdown timer, epoch progress bar |
| `TxLookup` | Transaction ID / address lookup via mempool.space |
| `SatoshiQuote` | Auto-rotating Satoshi quotes in the footer |
| `KpiCard` | Generic labelled stat card (also exported for tests) |

### Sound

Optional audio feedback via Web Audio API (`btc-vibe-sound-enabled` in localStorage). `playBlockThud` fires on new block; `playPriceTick` fires on price change (debounced to 1/s).

### Styling

Tailwind CSS v4 via the `@tailwindcss/vite` plugin — **not** PostCSS. The import in `src/index.css` is `@import "tailwindcss"`. No `tailwind.config.js` needed. The dark-mode variant is defined via `@custom-variant dark` in `index.css`.

### External APIs (no auth required)

| API | Endpoint purpose |
|---|---|
| `api.coingecko.com` | Price, volume, market cap, dominance, historical charts |
| `mempool.space` | Fee tiers, block height, difficulty, mempool, Lightning stats, tx/address lookup |
| `api.alternative.me/fng` | Fear & Greed index |
| `wss://ws.kraken.com/v2` | Real-time BTC price ticker (WebSocket) |
