# Bitcoin Vibe Check

**Read the room.**

A real-time Bitcoin dashboard that surfaces everything you need to understand the current state of the network — price, sentiment, fees, mempool, halving countdown, and more — in a single dark-themed page. Built for people who want a fast, information-dense overview without navigating multiple block explorers or exchanges.

---

## Features

### Live Market Data
- **Real-time BTC price** streamed via Kraken WebSocket v2, updating continuously without page refresh
- **24-hour price change** with directional indicator, sourced from CoinGecko
- **Multi-currency display** — switch between USD, GBP, EUR, CAD, and CHF at any time; all values update instantly
- **24h trading volume** with comparison against the 7-day rolling average
- **Market capitalisation** and **BTC dominance** with market season interpretation (Bitcoin season / Altcoin season / Mixed market)

### Sentiment & Network Health
- **Fear & Greed index** (0–100) from Alternative.me, with colour-coded arc gauge and classification label
- **Mining difficulty** — current epoch change percentage, time until next adjustment, and textual interpretation
- **Average block time** — colour-coded green/amber/red relative to the 10-minute target
- **Current block height** with animated breathing dot showing the time since the last block

### Halving Countdown
- **Live countdown timer** (days, hours, minutes) ticking down in real time
- **Blocks remaining** to the next halving
- **Estimated date** for the next halving
- **Epoch progress bar** showing how far through the current 210,000-block epoch the network has advanced

### Price Chart
- Interactive area chart with overlaid volume bars
- Four time ranges: **1D · 7D · 1M · 1Y**
- Range percentage change displayed alongside the chart label
- **High and low reference lines** for the selected period
- Manual **refresh button** — useful when using the app as a PWA with no browser chrome
- Chart data is cached per range/currency combination for the session to avoid redundant API requests

### Network Fees & Mempool
- **Fee tiers** — Slow (~1 hour), Medium (~30 min), and Fast (~10 min) in sat/vB
- **Mempool congestion** indicator (Low / Moderate / High) with a visual fill bar and unconfirmed transaction count

### Lightning Network
- **Total network capacity** in BTC
- **Channel count** and **node count**

### Transaction & Address Lookup
- Look up any **Bitcoin transaction ID** — shows confirmation status, block number, total value (BTC and fiat), fee, fee rate (sat/vB), and virtual size
- Look up any **Bitcoin address** — shows on-chain balance (BTC and fiat), total transaction count, and any pending unconfirmed transactions

### Header & Navigation
- **Latest block hash** (first 8 characters) displayed in the header, updating on every new block
- **Live indicator** showing whether the WebSocket price feed is connected, with fallback to last-updated timestamp
- **Currency selector** — always visible

### Sound Mode
- Optional ambient sound mode toggled from the header
- Synthesised entirely with the **Web Audio API** — no external audio files
  - Deep thud (80 Hz) when a new block is found
  - High tone (880 Hz) on price increases, lower tone (440 Hz) on decreases
  - Price ticks are debounced to a maximum of one per second
- Preference persisted in `localStorage`; AudioContext is only created after the first user interaction to comply with browser autoplay policy

### Progressive Web App
- Fully installable on **iOS, Android, and desktop** via the browser's native install prompt
- **Service worker** (Workbox) with NetworkFirst caching for all API calls and CacheFirst for static assets
- The last-fetched dashboard state is shown when offline — no blank screen

### Quality of Life
- **Satoshi quote rotator** in the footer — eight quotes cycling every 12 seconds with a fade transition
- All KPI data is written to `localStorage` so the last known values appear immediately on subsequent loads rather than showing skeletons for the full fetch duration
- Fully **responsive** — single-column layout on mobile, four-column grid on desktop
- No login, no account, no API keys required

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

---

## Data Sources

All APIs are free and require no authentication.

| Source | What it provides |
|---|---|
| [CoinGecko API](https://www.coingecko.com/en/api) | BTC price in all currencies, 24h volume, market cap, 24h change, historical chart data |
| [mempool.space API](https://mempool.space/docs/api) | Recommended fee tiers, current block height, difficulty adjustment, mempool stats, recent blocks, Lightning Network statistics |
| [Alternative.me Fear & Greed API](https://alternative.me/crypto/fear-and-greed-index/) | Crypto Fear & Greed index score and classification |
| [Kraken WebSocket v2](https://docs.kraken.com/websockets-v2/) | Real-time BTC ticker in USD, GBP, EUR, CAD, and CHF |

---

## Running Locally

### Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later

### Installation

```bash
git clone https://github.com/fizzybreeze/bitcoin-dashboard.git
cd bitcoin-dashboard
npm install
```

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

### Linting

```bash
npm run lint
```

### Tests

```bash
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end tests (Playwright)
```

---

## Environment Variables

None. All data sources are public APIs that do not require keys or tokens. No `.env` file is needed.

---

## Licence

MIT
