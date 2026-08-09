// Build: confirm `npm run build` passes before running tests.

export function computeAthDistance(priceUsd, athUsd) {
  if (priceUsd == null || athUsd == null) return null
  return ((priceUsd - athUsd) / athUsd) * 100
}

// Returns a number or `null` — never a third answer. It used to have one:
// `price === 0` was screened but `NaN` was not, so `computeSatsPerFiat(NaN)`
// came back as `NaN`, which passes a `!= null` guard and reaches the DOM as the
// string "NaN". A negative price is refused for the same reason rather than
// producing negative sats.
export function computeSatsPerFiat(price) {
  if (!Number.isFinite(price) || price <= 0) return null
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

// ─── Vibe Score ──────────────────────────────────────────────────────────────
//
// One 0–100 reading of how hot the market is running, composed from data already
// fetched for the dashboard. No network call, no new source.
//
// The score is deliberately **single-polarity**: every dimension is scaled so
// that a higher number means hotter — greedier, more extended, more congested.
// Mixing a contrarian valuation dimension into a pro-cyclical composite makes
// the halves cancel at exactly the moments the number should be most extreme,
// which flattens the range to roughly 38–72 and makes a cycle bottom read as
// "slightly below neutral". A single polarity also keeps this descriptive: a
// score where "cheap" pushes the number *up* is a buy signal by another name,
// and signals are explicitly out of scope for this project.
//
// The cycle cards keep their contrarian reading — "Deeply Undervalued" still
// means what it has always meant. This number answers a different question.

const clamp01 = x => Math.max(0, Math.min(1, x))

// Scale a raw reading onto 0–100 "heat", clamped at both ends so an outlier
// cannot drag the composite past the range its weight allows.
function heat(value, cold, hot) {
  return clamp01((value - cold) / (hot - cold)) * 100
}

// Published in the card tooltip and in CLAUDE.md. A composite that hides its
// arithmetic earns the "made-up number" criticism; one that shows it invites
// people to argue with the weights, which is the point.
export const VIBE_WEIGHTS = Object.freeze({
  sentiment:  0.30,
  valuation:  0.30,
  momentum:   0.25,
  congestion: 0.10,
  network:    0.05,
})

// Anchor points for each input. Mayer and MVRV reuse the thresholds already
// shown on CycleIndicatorsCard, so the score cannot disagree with the card
// sitting below it.
export const VIBE_ANCHORS = Object.freeze({
  mayer:     { cold: 0.8, hot: 2.4 },
  mvrv:      { cold: 1.0, hot: 3.7 },
  momentum:  { cold: -25, hot: 25 },
  hashTrend: { cold: -10, hot: 15 },
  // log10 sat/vB: 1 sat/vB is empty, 100 is a fee market in earnest.
  feeLog10:  { cold: 0,   hot: 2  },
})

// A score is only shown when enough of it is real. Both conditions matter:
// the count stops a two-input score being presented like a five-input one, and
// the weight floor stops the three *cheapest* inputs (momentum + congestion +
// network = 0.40) standing in for the whole composite.
const MIN_DIMENSIONS = 3
const MIN_COVERAGE   = 0.6

const isNum = v => v != null && Number.isFinite(v)

// A dimension is the mean of however many of its inputs arrived. It reports the
// count as well as the value, because a dimension standing on one of its two
// inputs is a degraded reading even though the dimension itself is "available"
// — and that distinction is exactly the one the card has to disclose.
function dimension(parts, inputs) {
  const present = parts.filter(isNum)
  return {
    value: present.length ? present.reduce((sum, v) => sum + v, 0) / present.length : null,
    used:  present.length,
    inputs,
  }
}

/**
 * Normalise every input to 0–100 heat. Exported because the header sentence is
 * built from these values and must survive when the *score* cannot: a sentence
 * naming live Fear & Greed makes no numeric claim, so it has no reason to
 * inherit the score's coverage floor.
 */
export function computeVibeDimensions({
  fngScore            = null,
  mayerMultiple       = null,
  mvrv                = null,
  priceChange30dPct   = null,
  hashRateTrendPct    = null,
  fastestFeeSatsPerVb = null,
  mempoolTxCount      = null,
} = {}) {
  return {
    sentiment: dimension([isNum(fngScore) ? clamp01(fngScore / 100) * 100 : null], 1),

    // Two estimators of one idea. Either alone still estimates it, so the
    // dimension keeps its full weight on one input — but `used` drops to 1 and
    // the card says so. MVRV is the one that goes missing (15 requests/day).
    valuation: dimension([
      isNum(mayerMultiple) ? heat(mayerMultiple, VIBE_ANCHORS.mayer.cold, VIBE_ANCHORS.mayer.hot) : null,
      isNum(mvrv)          ? heat(mvrv,          VIBE_ANCHORS.mvrv.cold,  VIBE_ANCHORS.mvrv.hot)  : null,
    ], 2),

    momentum: dimension([
      isNum(priceChange30dPct)
        ? heat(priceChange30dPct, VIBE_ANCHORS.momentum.cold, VIBE_ANCHORS.momentum.hot)
        : null,
    ], 1),

    // Fee tier alone is a step function with no resolution at the quiet end — it
    // sits at 1 sat/vB for days while the mempool visibly fills — so the two
    // congestion readings are averaged rather than picking one.
    congestion: dimension([
      isNum(fastestFeeSatsPerVb) && fastestFeeSatsPerVb > 0
        ? heat(Math.log10(fastestFeeSatsPerVb), VIBE_ANCHORS.feeLog10.cold, VIBE_ANCHORS.feeLog10.hot)
        : null,
      isNum(mempoolTxCount) ? computeMempoolPressurePct(mempoolTxCount) : null,
    ], 2),

    network: dimension([
      isNum(hashRateTrendPct)
        ? heat(hashRateTrendPct, VIBE_ANCHORS.hashTrend.cold, VIBE_ANCHORS.hashTrend.hot)
        : null,
    ], 1),
  }
}

// Flatten the detailed dimensions to plain key → 0–100 values, which is what the
// summary and the card breakdown consume.
export function vibeDimensionValues(detailed) {
  return Object.fromEntries(
    Object.entries(detailed ?? {}).map(([key, d]) => [key, d?.value ?? null])
  )
}

export function vibeLabelForScore(score) {
  if (!isNum(score)) return null
  if (score < 20) return 'Ice Cold'
  if (score < 35) return 'Cold'
  if (score < 50) return 'Cool'
  if (score < 65) return 'Warm'
  if (score < 80) return 'Hot'
  return 'Overheated'
}

// Sentiment is the odd one out: its dimension value is the Fear & Greed score
// unchanged, so alternative.me has already named the band this number falls in
// and these thresholds mirror theirs (0–25 extreme fear, 26–46 fear, 47–54
// neutral, 55–75 greed, 76+ extreme greed). They previously did not: a 25 came
// back from the source labelled "Extreme Fear" while this table called it
// "market fearful", and the link-preview card printed both at once. The other
// four dimensions are scaled from raw readings nobody else has classified, so
// their bands are ours to choose.
//
// If the source ever moves its bands these drift again — the card's Fear &
// Greed colour is immune because it reads the label itself, but a sentence
// derived from a number cannot be. Worth re-checking if the two ever disagree
// on screen again.
const VIBE_PHRASES = {
  sentiment:  v => v <= 25 ? 'market in extreme fear' : v <= 46 ? 'market fearful'
                 : v <= 54 ? 'sentiment neutral'      : v <= 75 ? 'market greedy'
                 : 'market in extreme greed',
  valuation:  v => v < 20 ? 'historically cheap'     : v < 40 ? 'below fair value'
                 : v <= 60 ? 'fairly valued'         : v < 80 ? 'richly valued'
                 : 'valuations stretched',
  momentum:   v => v < 20 ? 'price falling hard'     : v < 40 ? 'price drifting down'
                 : v <= 60 ? 'price flat'            : v < 80 ? 'price climbing'
                 : 'price surging',
  congestion: v => v < 25 ? 'mempool empty'          : v < 50 ? 'blocks clearing easily'
                 : v <= 75 ? 'blocks filling'        : 'mempool congested',
  network:    v => v < 30 ? 'hash rate falling'      : v <= 70 ? 'hash rate steady'
                 : 'hash rate climbing',
}

const SUMMARY_ORDER = ['sentiment', 'valuation', 'momentum', 'congestion', 'network']
const SUMMARY_PARTS = 3

// The sentence is derived from the same dimension values as the number, so the
// words and the score can never contradict each other. It names the dimensions
// furthest from neutral, because those are the ones actually moving the score.
export function computeVibeSummary(dimensions) {
  if (!dimensions) return null
  const present = SUMMARY_ORDER.filter(k => isNum(dimensions[k]))
  if (present.length === 0) return null
  const ranked = [...present].sort(
    (a, b) => Math.abs(dimensions[b] - 50) - Math.abs(dimensions[a] - 50)
  )
  const chosen = new Set(ranked.slice(0, SUMMARY_PARTS))
  const sentence = present.filter(k => chosen.has(k))
    .map(k => VIBE_PHRASES[k](dimensions[k]))
    .join(', ')
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`
}

// 30-day price change, read off the 200-day Kraken candle series already
// fetched for the moving average. Independent of the Mayer Multiple — reusing
// price-vs-200d-MA here would have made one ratio drive 35% of the score.
export function computePriceChange30d(ohlcData) {
  if (!Array.isArray(ohlcData) || ohlcData.length < 31) return null
  // Index positionally and validate the two endpoints. Filtering non-finite
  // closes out *before* indexing would silently slide the window: one malformed
  // candle anywhere in the last 31 makes this a 31-day change reported as 30.
  const closes = ohlcData.map(d => parseFloat(d?.[4]))
  const last   = closes[closes.length - 1]
  const prior  = closes[closes.length - 31]
  if (!isNum(last) || !isNum(prior) || prior === 0) return null
  return ((last - prior) / prior) * 100
}

/**
 * Compose the Vibe Score. Every argument is optional — missing inputs drop
 * their dimension and the remaining weights are renormalised, so one flaky
 * source (MVRV rides a 15-request/day free tier) degrades the number instead
 * of deleting it. Returns null when too little is available to be honest about.
 */
export function computeVibeScore(inputs = {}) {
  const detailed   = computeVibeDimensions(inputs)
  const dimensions = vibeDimensionValues(detailed)

  const present  = Object.keys(VIBE_WEIGHTS).filter(k => isNum(dimensions[k]))
  const coverage = present.reduce((sum, k) => sum + VIBE_WEIGHTS[k], 0)
  if (present.length < MIN_DIMENSIONS || coverage < MIN_COVERAGE) return null

  const weighted = present.reduce((sum, k) => sum + dimensions[k] * VIBE_WEIGHTS[k], 0)
  const score    = Math.round(weighted / coverage)

  const all = Object.values(detailed)
  return {
    score,
    label:     vibeLabelForScore(score),
    summary:   computeVibeSummary(dimensions),
    dimensions,
    available: present.length,
    total:     Object.keys(VIBE_WEIGHTS).length,
    // Raw inputs, not dimensions. A score built on 6 of 7 inputs is degraded
    // even when all 5 dimensions report, which is precisely what happens when
    // MVRV is rate-limited — the case the card most needs to disclose.
    inputsUsed:  all.reduce((sum, d) => sum + d.used, 0),
    inputsTotal: all.reduce((sum, d) => sum + d.inputs, 0),
    coverage,
  }
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

// Mean of the tracked 24h-volume history (last 7 days, one entry per day).
// Needs at least two entries — a single day compared against itself is always
// 0% and reads as a real "in line with 7d avg" signal when it is no signal.
export function computeVol7dAvg(history) {
  if (!history || history.length < 2) return null
  return history.reduce((sum, h) => sum + h.volume, 0) / history.length
}
