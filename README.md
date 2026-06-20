# Bitcoin Vibe Check

**Read the room.**

A real-time Bitcoin dashboard that surfaces everything you need to understand the current state of the network — price, sentiment, fees, mempool, halving countdown, and more — in a single dark-themed page. Built for people who want a fast, information-dense overview without navigating multiple block explorers or exchanges.

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

### Sentiment & Network Health
- **Live sentiment summary line** in the header — a human-readable sentence combining price direction, Fear & Greed, and mining difficulty
- **Market Sentiment card** — Fear & Greed index (0–100) from Alternative.me, with colour-coded classification label and 30-day sparkline
- **Network Pulse card** — Hash Rate and Difficulty side by side, with a full-width difficulty adjustment bar below
- **Hash rate** — current network hash rate in EH/s with a **30-day trend indicator** (▲/▼ percentage)
- **Mining difficulty** — current epoch change percentage, time until next adjustment, and textual interpretation
- **Recent Blocks feed** — live list of the five most recent blocks with transaction count, total fees, and average fee rate; replaces the Whale Watch card
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
- MVRV data is fetched via a serverless proxy from BGeometrics; the other three metrics are derived from Binance daily OHLC data

### Price Chart
- Interactive area chart with overlaid volume bars
- Four time ranges: **1D · 7D · 1M · 1Y**
- Range percentage change displayed alongside the chart label
- **High and low reference lines** for the selected period
- **Chart locked to USD** with a clear "Chart in USD" label
- **Volume bars show Binance BTC/USD pair volume only** — a tooltip in the chart header explains the discrepancy with the 24H Volume card, which shows global volume aggregated across all exchanges
- Manual **refresh button** — useful when using the app as a PWA with no browser chrome
- Chart data is cached per range/currency combination for the session to avoid redundant API requests

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

### Header & Navigation
- **Live indicator** showing whether the WebSocket price feed is connected, with fallback to last-updated timestamp
- **Currency selector** — always visible
- **Share button** — generates a shareable snapshot card for the current dashboard state
- **Sound toggle** and **Price Alerts button** in the header

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

### Newsletter

- **Satoshi's Weekly Brief** — Beehiiv-powered newsletter signup embedded in the sidebar and surfaced as a modal 5 seconds after a first visit
- Modal is shown once per browser (suppressed via `localStorage`); auto-dismisses after a successful subscribe event

### Lightning Donations & Supporters

- **Donate via Strike** — one-click link to `strike.me/fizzybreeze` for Lightning payments
- After paying, visitors submit their name or handle; entries are stored in **Supabase** with `approved: false` and go live within 24 hours once approved
- Approved donors are displayed in a scrolling ticker on desktop and as pill badges on mobile

### Quality of Life
- **Satoshi quote rotator** in the footer — eight quotes cycling every 12 seconds with a fade transition
- All KPI data is written to `localStorage` so the last known values appear immediately on subsequent loads rather than showing skeletons for the full fetch duration
- Fully **responsive** — single-column layout on mobile, optimised **3-column grid on desktop** with Network Pulse spanning the full column height
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
| Backend | [Supabase](https://supabase.com) (donor name storage) |
| Newsletter | [Beehiiv](https://beehiiv.com) (embedded signup form) |

---

## Data Sources

| Source | What it provides |
|---|---|
| [CoinPaprika API](https://api.coinpaprika.com) | BTC price, 24h volume, market cap, 24h change, ATH, BTC dominance |
| [Binance API](https://binance-docs.github.io/apidocs/spot/en/) | Historical OHLC data for the price chart and 200-day MA / Mayer Multiple calculations |
| [BGeometrics](https://bgeometrics.com) (via serverless proxy) | MVRV Ratio |
| [mempool.space API](https://mempool.space/docs/api) | Recommended fee tiers, current block height, difficulty adjustment, mempool stats, recent blocks, Lightning Network statistics, hash rate |
| [Alternative.me Fear & Greed API](https://alternative.me/crypto/fear-and-greed-index/) | Crypto Fear & Greed index score and 30-day history |
| [Kraken WebSocket v2](https://docs.kraken.com/websockets-v2/) | Real-time BTC ticker in USD, GBP, EUR, CAD, and CHF |

---

## Running Locally

### Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later

### Installation

```bash
git clone https://github.com/fizzybreeze/bitcoin-vibe-check.git
cd bitcoin-vibe-check
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

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL — required for donor name submission and retrieval |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key — required for donor name submission and retrieval |

Create a `.env` file in the project root and add:

```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

The donor ticker and submission form will silently degrade if these are absent. All other dashboard data comes from public APIs with no authentication required.

---

## Licence

MIT
