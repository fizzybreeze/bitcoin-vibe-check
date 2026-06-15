// Build: confirm `npm run build` passes before running tests.

export function computeAthDistance(priceUsd, athUsd) {
  if (priceUsd == null || athUsd == null) return null
  return ((priceUsd - athUsd) / athUsd) * 100
}

export function computeSatsPerFiat(price) {
  if (price == null || price === 0) return null
  return Math.round(1e8 / price)
}

export function computeIssuedSupply(blockHeight) {
  if (blockHeight == null) return null
  const epochs = [
    { start: 0,         end: 209_999,   reward: 50 },
    { start: 210_000,   end: 419_999,   reward: 25 },
    { start: 420_000,   end: 629_999,   reward: 12.5 },
    { start: 630_000,   end: 839_999,   reward: 6.25 },
    { start: 840_000,   end: 1_049_999, reward: 3.125 },
  ]
  let total = 0
  for (const { start, end, reward } of epochs) {
    if (blockHeight < start) break
    total += (Math.min(blockHeight, end) - start + 1) * reward
  }
  return total
}

export function computeVibeLabel(priceChange24h, fngScore, diffChange) {
  if (priceChange24h == null || fngScore == null || diffChange == null) return null
  const priceStr = Math.abs(priceChange24h) <= 0.2 ? 'price is flat'
    : priceChange24h > 0 ? 'price is up' : 'price is down'
  const sentStr = fngScore <= 24 ? 'market is in extreme fear'
    : fngScore <= 44 ? 'market is fearful'
    : fngScore <= 55 ? 'market is neutral'
    : fngScore <= 74 ? 'market is greedy'
    : 'market is in extreme greed'
  const minerStr = diffChange < -3 ? 'miners are slowing'
    : diffChange > 3 ? 'miners are speeding up'
    : 'miners are steady'
  const sentence = `${sentStr}, ${priceStr}, ${minerStr}.`
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

export function computeHashRateTrend(hashrates) {
  if (!Array.isArray(hashrates) || hashrates.length < 2) return null
  const first = hashrates[0].avgHashrate
  const last  = hashrates[hashrates.length - 1].avgHashrate
  if (!first) return null
  return ((last - first) / first) * 100
}

// Fill percentage for the mempool pressure bar based on unconfirmed transaction count.
// Cap at 100% — the bar overflows if the mempool is severely congested.
export function computeMempoolPressurePct(count) {
  if (count == null) return null
  return Math.min(100, (count / 200_000) * 100)
}

// Standard single-input, two-output transaction size used for fee estimates.
const TX_VSIZE = 250

export function calcFiatFee(feeRateSatsPerVbyte, priceInCurrency) {
  const totalSats = feeRateSatsPerVbyte * TX_VSIZE
  return (totalSats / 100_000_000) * priceInCurrency
}
