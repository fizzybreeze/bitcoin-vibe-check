const now = Date.now()

export const feesFixture = {
  fastestFee: 20,
  halfHourFee: 15,
  hourFee: 10,
}

// Used both as the block height state value and as the height in blocksFixture
export const blockHeightFixture = 897000

export const fngFixture = {
  data: [{ value: '72', value_classification: 'Greed' }],
}

export const difficultyFixture = {
  difficultyChange: 3.2,
  remainingBlocks: 1440,
  timeAvg: 600000,  // 10 minutes in ms → "10.0 min"
}

// Parameterised on "now" so the visual-regression spec can pin it to the same
// instant it freezes the browser clock at. Left to the real clock by default:
// the behavioural specs only assert that a "time ago" line is present, and
// hard-coding a date there would make them lie about what the app computed.
export function makeBlocksFixture(nowMs = Date.now()) {
  return [
    {
      id: '000000000000000000029cf58b7a4badc83aa720ecdfa0c15c8e07dc5b7c3f3b',
      height: blockHeightFixture,
      tx_count: 2341,
      size: 1_500_000,
      timestamp: Math.floor(nowMs / 1000) - 5 * 60,  // 5 minutes ago
      extras: { totalFees: 12_345_678, avgFeeRate: 8 },
    },
  ]
}

export const blocksFixture = makeBlocksFixture(now)

export const lightningFixture = {
  latest: {
    channel_count: 54321,
    node_count: 12345,
    total_capacity: 5438000000,  // 54.38 BTC → "54.4 BTC"
  },
}

export const mempoolFixture = {
  count: 14203,
  vsize: 25_000_000,  // Moderate congestion (5M–50M vbytes)
  total_fee: 950000000,
  fee_histogram: [],
}

// CoinPaprika /v1/tickers/btc-bitcoin — price, volume, change, ATH
export const paprikaTickerFixture = {
  quotes: {
    USD: {
      price: 105000,
      volume_24h: 35_000_000_000,
      percent_change_24h: 2.5,
      market_cap: 2_100_000_000_000,
      ath_price: 109000,
    },
  },
}

// CoinPaprika /v1/global — BTC dominance
export const paprikaGlobalFixture = {
  bitcoin_dominance_percentage: 64.5,
}

// Kraken REST /0/public/Ticker — GBP/EUR/CAD/CHF spot prices
// Key must end with the currency suffix for findKrakenPrice() to match it
export const krakenTickerFixture = {
  result: {
    // Kraken's own asset codes, not the pair names you ask for: XBTUSD comes
    // back as XXBTZUSD. Present here because the real response carries it and
    // the app now reads it as the fallback when CoinPaprika is down — a
    // fixture that omits it cannot exercise that path.
    XXBTZUSD: { c: ['104500'] },
    XBTGBP: { c: ['82000'] },
    XBTEUR: { c: ['96000'] },
    XBTCAD: { c: ['142000'] },
    XBTCHF: { c: ['93000'] },
  },
}

// /mining/hashrate/3d — current network hash rate
export const hashrate3dFixture = { currentHashrate: 800e18 }

// /mining/hashrate/1m — two entries so the trend calculation has a first and last
export const hashrate1mFixture = {
  hashrates: [
    { avgHashrate: 780e18 },
    { avgHashrate: 800e18 },
  ],
}

// /api/chain-data — serverless proxy response for BGeometrics data
export const chainDataFixture = {
  mvrv: { value: 2.15, date: '2026-06-10' },
  etf:  { btcHeld: 1_100_000, btcHeld7dAgo: 1_085_000, date: '2026-06-10' },
}

// Kraken OHLC candles.
// Shape: [time_SECONDS, open, high, low, close, vwap, volume_base, count]
// Note index 0 is seconds (Binance used milliseconds) and index 6 is volume in
// BTC rather than USD — see src/lib/ohlc.js.
const nowS = Math.floor(now / 1000)
const DAY_S = 86_400

function krakenCandle(timeSeconds, close) {
  return [
    timeSeconds,
    String(close - 500), String(close + 500), String(close - 800),
    String(close), String(close), '500', 1000,
  ]
}

// 200 daily candles at a fixed close of $103,000 → 200DMA is exactly $103,000.
export const ohlc200dFixture = Array.from({ length: 200 }, (_, i) =>
  krakenCandle(nowS - (200 - i) * DAY_S, 103_000)
)

// Generic candle series for the chart range toggles (1D/7D/1M/1Y). Prices ramp
// gently so the chart renders a visible line and computeChartChange produces a
// non-zero result.
export function makeKrakenCandles(count, stepSeconds = DAY_S) {
  return Array.from({ length: count }, (_, i) =>
    krakenCandle(nowS - (count - i) * stepSeconds, 100_000 + i * 10)
  )
}

// Seconds per Kraken interval value (which is in minutes).
export const KRAKEN_INTERVAL_SECONDS = { 60: 3_600, 240: 14_400, 1440: DAY_S }

// A distinct price level per Kraken pair, so a chart drawn off the *wrong* pair
// is visible on screen rather than merely mislabelled. Roughly the real FX
// relationships, which is not load-bearing — what matters is that no two of them
// round to the same axis tick.
export const PAIR_BASE_PRICE = {
  XBTUSD: 100_000,
  XBTGBP:  79_000,
  XBTEUR:  92_000,
  XBTCAD: 137_000,
  XBTCHF:  88_000,
}

/** `makeKrakenCandles`, at the price level that pair trades at. */
export function makeKrakenCandlesForPair(pair, count, stepSeconds = DAY_S) {
  const base = PAIR_BASE_PRICE[pair] ?? PAIR_BASE_PRICE.XBTUSD
  return Array.from({ length: count }, (_, i) =>
    krakenCandle(nowS - (count - i) * stepSeconds, base + i * 10)
  )
}

/** Kraken's real answer for a pair that does not exist — HTTP 200, error array. */
export const krakenUnknownPairResponse = { error: ['EQuery:Unknown asset pair'], result: {} }

/**
 * A pair Kraken lists but which has no candles in the window — 200, no error,
 * and an **empty array** under the pair key.
 *
 * Its own fixture because it is not the same thing as the response above and was
 * handled as though it were: an empty array is truthy, so nothing threw and the
 * chart resolved with no points, no error and no fallback.
 */
export const krakenEmptySeriesResponse = pair => ({ error: [], result: { [pair]: [], last: nowS } })

/** Wrap candles in Kraken's response envelope, under the canonical pair key. */
export function krakenOhlcResponse(candles) {
  return { error: [], result: { XXBTZUSD: candles, last: nowS } }
}
