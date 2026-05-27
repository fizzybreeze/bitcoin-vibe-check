# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server with HMR
npm run build     # production build to dist/
npm run preview   # preview the production build
npm run lint      # run ESLint
```

No test suite is configured.

## Architecture

This is a single-page React 19 + Vite 8 app. Almost all logic lives in **`src/App.jsx`** — there are no separate component files, hooks, or services.

### Data flow

On mount, `loadData()` fires four parallel API calls using `Promise.allSettled`:
- **CoinGecko** — BTC price (USD + GBP) and 24h volume
- **mempool.space** — recommended fee tiers and current block height
- **alternative.me** — Fear & Greed index

KPI results are merged with `localStorage` (key `btc-cache`) so stale data is shown immediately on subsequent loads rather than a skeleton. The cache write is partial — only non-null fields overwrite stored values.

Chart data (`fetchChart`) is fetched separately whenever the selected range or currency changes. Fetched charts are memoised for the session in a `useRef(new Map())` keyed by `"${range}-${currency}"` (e.g. `"7D-usd"`), so switching back to a previously viewed range is instant.

### Styling

Tailwind CSS v4 is used via the `@tailwindcss/vite` Vite plugin — **not** PostCSS. The import in `src/index.css` is `@import "tailwindcss"`. Adding a `tailwind.config.js` is not needed; configuration goes through CSS `@theme` directives if required. The dark-mode variant is defined via `@custom-variant dark` in `index.css`.

### External APIs (no auth required)

| API | Endpoint purpose |
|---|---|
| `api.coingecko.com` | Price, volume, historical chart data |
| `mempool.space` | Fee recommendations, block height |
| `api.alternative.me/fng` | Fear & Greed index |
