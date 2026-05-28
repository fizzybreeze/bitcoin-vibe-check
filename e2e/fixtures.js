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
  { timestamp: Math.floor(Date.now() / 1000) - 5 * 60 },  // 5 minutes ago
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
  vsize: 25_000_000,  // Moderate (5M–50M)
  total_fee: 950000000,
  fee_histogram: [],
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
    spent_txo_sum: 40_000_000,  // balance = 60_000_000 sats → 0.6000 BTC
    tx_count: 15,
  },
  mempool_stats: { tx_count: 0 },
}
