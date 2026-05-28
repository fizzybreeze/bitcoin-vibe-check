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
}
