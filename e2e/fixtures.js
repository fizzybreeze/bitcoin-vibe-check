const now = Date.now()
const DAY_MS = 86_400_000

export function makeChartFixture(days = 7) {
  const prices = []
  const total_volumes = []
  for (let i = days; i >= 0; i--) {
    const ts = now - i * DAY_MS
    prices.push([ts, 100000 + i * 500])
    total_volumes.push([ts, 2_000_000_000])
  }
  return { prices, total_volumes }
}

export const priceFixture = {
  bitcoin: {
    usd: 105000, gbp: 82000, eur: 96000, cad: 142000, chf: 93000,
    usd_24h_vol: 35_000_000_000,
    gbp_24h_vol: 28_000_000_000,
    eur_24h_vol: 32_000_000_000,
    cad_24h_vol: 47_000_000_000,
    chf_24h_vol: 31_000_000_000,
    usd_24h_change: 2.5,
    usd_market_cap: 2_100_000_000_000,
  },
}

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

export const globalFixture = {
  data: {
    market_cap_percentage: { btc: 64.5 },
  },
}

export const difficultyFixture = {
  difficultyChange: 3.2,
  remainingBlocks: 1440,
  timeAvg: 600000,  // 10 minutes in ms → "10.0 min"
}

export const blocksFixture = [
  {
    id: '000000000000000000029cf58b7a4badc83aa720ecdfa0c15c8e07dc5b7c3f3b',
    height: blockHeightFixture,
    tx_count: 2341,
    size: 1_500_000,
    timestamp: Math.floor(now / 1000) - 5 * 60,  // 5 minutes ago
    extras: { totalFees: 12_345_678, avgFeeRate: 8 },
  },
]

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

// /coins/markets — price 105,000 is ~3.7% below ATH of 109,000
export const marketsFixture = [{ ath: 109000 }]

// /mining/hashrate/3d — current network hash rate
export const hashrate3dFixture = { currentHashrate: 800e18 }

// /mining/hashrate/1m — two entries so the trend calculation has a first and last
export const hashrate1mFixture = {
  hashrates: [
    { avgHashrate: 780e18 },
    { avgHashrate: 800e18 },
  ],
}

export const TX_ID = 'a'.repeat(64)

export const txFixture = {
  txid: TX_ID,
  status: { confirmed: true, block_height: 895000 },
  vsize: 250,
  fee: 3750,
  vout: [{ value: 150_000_000 }],  // 1.5000 BTC
}

export const ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'

export const addressFixture = {
  address: ADDRESS,
  chain_stats: {
    funded_txo_sum: 100_000_000,
    spent_txo_sum: 40_000_000,  // balance = 60,000,000 sats → 0.6000 BTC
    tx_count: 15,
  },
  mempool_stats: { tx_count: 0 },
}

// /api/chain-data — serverless proxy response for BGeometrics data
export const chainDataFixture = {
  mvrv: { value: 2.15, date: '2026-06-10' },
  etf:  { btcHeld: 1_100_000, btcHeld7dAgo: 1_085_000, date: '2026-06-10' },
}

// Binance klines — 200 daily candles at a fixed close of $103,000
// Shape: [openTime, open, high, low, close, volume, closeTime, quoteVolume, ...]
export const klines200dFixture = Array.from({ length: 200 }, (_, i) => [
  now - (200 - i) * DAY_MS,
  '100000', '105000', '95000', '103000', '500',
  now - (200 - i) * DAY_MS + DAY_MS - 1,
  '51500000000', '1000', '0', '0', '1',
])
