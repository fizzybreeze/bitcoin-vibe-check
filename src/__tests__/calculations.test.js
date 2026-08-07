// Build: confirm `npm run build` passes before running these tests.
// Run: npm test
import { describe, it, expect } from 'vitest'
import {
  computeAthDistance,
  computeSatsPerFiat,
  computeIssuedSupply,
  computeHashRateTrend,
  computeMempoolPressurePct,
  calcFiatFee,
  computeVol7dAvg,
  computeVibeScore,
  computeVibeSummary,
  computeVibeDimensions,
  vibeDimensionValues,
  computePriceChange30d,
  vibeLabelForScore,
  VIBE_WEIGHTS,
} from '../lib/calculations.js'

// ─── ATH distance ────────────────────────────────────────────────────────────

describe('computeAthDistance', () => {
  it('returns the correct negative percentage when below ATH', () => {
    // (105000 - 109000) / 109000 * 100 ≈ -3.67%
    expect(computeAthDistance(105000, 109000)).toBeCloseTo(-3.67, 1)
  })

  it('returns 0 when price equals ATH exactly', () => {
    expect(computeAthDistance(109000, 109000)).toBeCloseTo(0, 5)
  })

  it('returns a positive value when price is above ATH', () => {
    expect(computeAthDistance(110000, 109000)).toBeGreaterThan(0)
  })

  it('returns null when priceUsd is null', () => {
    expect(computeAthDistance(null, 109000)).toBeNull()
  })

  it('returns null when athUsd is null', () => {
    expect(computeAthDistance(105000, null)).toBeNull()
  })

  it('is within the AT ATH threshold at exactly -0.1% (>= -0.1)', () => {
    // price = ath * 0.999 → exactly -0.1%
    const result = computeAthDistance(109000 * 0.999, 109000)
    expect(result).toBeGreaterThanOrEqual(-0.1)
  })

  it('is outside the AT ATH threshold just below -0.1% (< -0.1)', () => {
    // price = ath * 0.9989 → ≈ -0.11%
    const result = computeAthDistance(109000 * 0.9989, 109000)
    expect(result).toBeLessThan(-0.1)
  })
})

// ─── Sats per fiat ────────────────────────────────────────────────────────────

describe('computeSatsPerFiat', () => {
  it('returns the correct sats for a USD price of 100,000', () => {
    expect(computeSatsPerFiat(100000)).toBe(1000)
  })

  it('returns the correct sats for a GBP price of 50,000', () => {
    expect(computeSatsPerFiat(50000)).toBe(2000)
  })

  it('always returns an integer', () => {
    expect(Number.isInteger(computeSatsPerFiat(103456))).toBe(true)
    expect(Number.isInteger(computeSatsPerFiat(87654))).toBe(true)
  })

  it('returns null for a null price', () => {
    expect(computeSatsPerFiat(null)).toBeNull()
  })

  it('returns null for a zero price', () => {
    expect(computeSatsPerFiat(0)).toBeNull()
  })
})

// ─── Supply issued ────────────────────────────────────────────────────────────

describe('computeIssuedSupply', () => {
  it('returns 50 BTC at block 0 (epoch 0, first block)', () => {
    expect(computeIssuedSupply(0)).toBe(50)
  })

  it('returns 10,500,000 BTC at block 209,999 (end of epoch 0)', () => {
    expect(computeIssuedSupply(209_999)).toBe(10_500_000)
  })

  it('returns the correct total at block 420,000 (start of epoch 2)', () => {
    // 10,500,000 + 5,250,000 + (1 block × 12.5) = 15,750,012.5
    expect(computeIssuedSupply(420_000)).toBeCloseTo(15_750_012.5, 5)
  })

  it('returns the correct total at block 630,000 (start of epoch 3)', () => {
    // 15,750,000 + 2,625,000 + (1 block × 6.25) = 18,375,006.25
    expect(computeIssuedSupply(630_000)).toBeCloseTo(18_375_006.25, 5)
  })

  it('returns 19,687,500 BTC at block 839,999 (end of epoch 3)', () => {
    expect(computeIssuedSupply(839_999)).toBeCloseTo(19_687_500, 5)
  })

  it('returns the correct total at block 840,000 (start of epoch 4, current epoch)', () => {
    // 19,687,500 + (1 block × 3.125) = 19,687,503.125
    expect(computeIssuedSupply(840_000)).toBeCloseTo(19_687_503.125, 5)
  })

  it('returns the correct total for block 900,000 (mid current epoch)', () => {
    // (900,000 − 840,000 + 1) × 3.125 = 60,001 × 3.125 = 187,503.125
    // total = 19,687,500 + 187,503.125 = 19,875,003.125
    expect(computeIssuedSupply(900_000)).toBeCloseTo(19_875_003.125, 5)
  })

  it('returns null for null input', () => {
    expect(computeIssuedSupply(null)).toBeNull()
  })
})

// ─── Vibe Score ───────────────────────────────────────────────────────────────

// Inputs chosen so every dimension normalises to exactly 50, which makes the
// weighting arithmetic checkable by hand.
const NEUTRAL_INPUTS = {
  fngScore:            50,
  mayerMultiple:       1.6,     // midpoint of 0.8–2.4
  mvrv:                2.35,    // midpoint of 1.0–3.7
  priceChange30dPct:   0,       // midpoint of -25–+25
  hashRateTrendPct:    2.5,     // midpoint of -10–+15
  fastestFeeSatsPerVb: 10,      // log10 = 1, midpoint of 0–2
  mempoolTxCount:      100_000, // half of the 200k pressure cap
}

describe('computeVibeScore', () => {
  it('scores 50 when every dimension sits at its midpoint', () => {
    const result = computeVibeScore(NEUTRAL_INPUTS)
    expect(result.score).toBe(50)
    expect(result.available).toBe(5)
    expect(result.total).toBe(5)
  })

  it('scores 100 when every input is at or past its hot anchor', () => {
    expect(computeVibeScore({
      fngScore: 100, mayerMultiple: 2.4, mvrv: 3.7, priceChange30dPct: 25,
      hashRateTrendPct: 15, fastestFeeSatsPerVb: 100, mempoolTxCount: 200_000,
    }).score).toBe(100)
  })

  it('scores 0 when every input is at or past its cold anchor', () => {
    expect(computeVibeScore({
      fngScore: 0, mayerMultiple: 0.8, mvrv: 1.0, priceChange30dPct: -25,
      hashRateTrendPct: -10, fastestFeeSatsPerVb: 1, mempoolTxCount: 0,
    }).score).toBe(0)
  })

  it('clamps inputs beyond their anchors rather than letting them run away', () => {
    const beyond = computeVibeScore({
      fngScore: 100, mayerMultiple: 99, mvrv: 99, priceChange30dPct: 5000,
      hashRateTrendPct: 500, fastestFeeSatsPerVb: 100_000, mempoolTxCount: 9e9,
    })
    expect(beyond.score).toBe(100)
    expect(beyond.score).toBeLessThanOrEqual(100)
  })

  // The reason this composite is single-polarity. A mixed-polarity version
  // compresses to roughly 38–72 and reads a generational bottom as "neutral".
  it('separates a cycle top from a cycle bottom by a wide margin', () => {
    const top = computeVibeScore({
      fngScore: 84, mayerMultiple: 1.55, mvrv: 3.2, priceChange30dPct: 22,
      hashRateTrendPct: 6, fastestFeeSatsPerVb: 60, mempoolTxCount: 150_000,
    })
    const bottom = computeVibeScore({
      fngScore: 22, mayerMultiple: 0.72, mvrv: 0.75, priceChange30dPct: -18,
      hashRateTrendPct: 2, fastestFeeSatsPerVb: 2, mempoolTxCount: 8_000,
    })
    expect(top.score).toBeGreaterThan(70)
    expect(bottom.score).toBeLessThan(25)
    expect(top.score - bottom.score).toBeGreaterThan(50)
  })

  // ── Degradation ──
  it('renormalises the remaining weights when a dimension is missing', () => {
    // Sentiment + valuation + momentum only = 0.85 of the weight. All three are
    // maxed, so a renormalised score is 100 — not 85.
    const result = computeVibeScore({
      fngScore: 100, mayerMultiple: 2.4, mvrv: 3.7, priceChange30dPct: 25,
    })
    expect(result.score).toBe(100)
    expect(result.available).toBe(3)
    expect(result.coverage).toBeCloseTo(0.85, 5)
  })

  it('still scores valuation when MVRV is missing but Mayer is present', () => {
    const result = computeVibeScore({ ...NEUTRAL_INPUTS, mvrv: null })
    expect(result.score).toBe(50)
    expect(result.available).toBe(5)
  })

  // Regression: all five dimensions report, so a dimension count alone would
  // have said "5 of 5" and disclosed nothing — while valuation stood on one of
  // its two inputs. MVRV is the input that actually goes missing in production.
  it('reports a missing MVRV as a used input even though all 5 dimensions report', () => {
    const full    = computeVibeScore(NEUTRAL_INPUTS)
    const noMvrv  = computeVibeScore({ ...NEUTRAL_INPUTS, mvrv: null })
    expect(full.inputsUsed).toBe(7)
    expect(full.inputsTotal).toBe(7)
    expect(noMvrv.available).toBe(5)      // dimension still available…
    expect(noMvrv.inputsUsed).toBe(6)     // …but the score is built on less
    expect(noMvrv.inputsTotal).toBe(7)
  })

  it('counts a dropped congestion input too', () => {
    const result = computeVibeScore({ ...NEUTRAL_INPUTS, mempoolTxCount: null })
    expect(result.inputsUsed).toBe(6)
    expect(result.dimensions.congestion).not.toBeNull()
  })

  it('drops the valuation dimension when both Mayer and MVRV are missing', () => {
    const result = computeVibeScore({ ...NEUTRAL_INPUTS, mvrv: null, mayerMultiple: null })
    expect(result.available).toBe(4)
    expect(result.dimensions.valuation).toBeNull()
  })

  it('returns null when fewer than three dimensions are available', () => {
    // Sentiment + valuation is 0.60 of the weight — enough coverage, but two
    // inputs must not be presented as though they were the whole composite.
    expect(computeVibeScore({ fngScore: 50, mayerMultiple: 1.6, mvrv: 2.35 })).toBeNull()
  })

  it('returns null when three dimensions are present but carry too little weight', () => {
    // momentum + congestion + network = 0.40, below the 0.60 floor.
    expect(computeVibeScore({
      priceChange30dPct: 0, hashRateTrendPct: 2.5, fastestFeeSatsPerVb: 10,
    })).toBeNull()
  })

  it('returns null for no input at all', () => {
    expect(computeVibeScore()).toBeNull()
    expect(computeVibeScore({})).toBeNull()
  })

  it('ignores non-finite inputs rather than poisoning the score with NaN', () => {
    const result = computeVibeScore({ ...NEUTRAL_INPUTS, fngScore: NaN, mvrv: Infinity })
    expect(Number.isFinite(result.score)).toBe(true)
    expect(result.dimensions.sentiment).toBeNull()
  })

  it('ignores a zero or negative fee rather than taking log10 of it', () => {
    const result = computeVibeScore({ ...NEUTRAL_INPUTS, fastestFeeSatsPerVb: 0 })
    expect(Number.isFinite(result.score)).toBe(true)
    // Mempool pressure alone still carries the dimension.
    expect(result.dimensions.congestion).toBeCloseTo(50, 5)
  })

  it('always returns an integer within 0–100', () => {
    const cases = [
      NEUTRAL_INPUTS,
      { ...NEUTRAL_INPUTS, fngScore: 7, priceChange30dPct: -40 },
      { ...NEUTRAL_INPUTS, fngScore: 93, priceChange30dPct: 60 },
    ]
    for (const input of cases) {
      const { score } = computeVibeScore(input)
      expect(Number.isInteger(score)).toBe(true)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })

  // The header sentence and the number are read together, so they must never
  // point in opposite directions.
  it('carries a summary that agrees in direction with a hot score', () => {
    const hot = computeVibeScore({
      fngScore: 95, mayerMultiple: 2.4, mvrv: 3.7, priceChange30dPct: 40,
      hashRateTrendPct: 15, fastestFeeSatsPerVb: 120, mempoolTxCount: 220_000,
    })
    expect(hot.score).toBeGreaterThan(80)
    expect(hot.label).toBe('Overheated')
    expect(hot.summary).toMatch(/extreme greed|valuations stretched|price surging|mempool congested|hash rate climbing/)
    expect(hot.summary).not.toMatch(/fear|falling|drifting down|empty|cheap|below fair value/)
  })

  it('carries a summary that agrees in direction with a cold score', () => {
    const cold = computeVibeScore({
      fngScore: 8, mayerMultiple: 0.7, mvrv: 0.8, priceChange30dPct: -30,
      hashRateTrendPct: -9, fastestFeeSatsPerVb: 1, mempoolTxCount: 3_000,
    })
    expect(cold.score).toBeLessThan(20)
    expect(cold.label).toBe('Ice Cold')
    expect(cold.summary).toMatch(/extreme fear|historically cheap|price falling|mempool empty|hash rate falling/)
    expect(cold.summary).not.toMatch(/greed|surging|congested|stretched|climbing/)
  })
})

describe('VIBE_WEIGHTS', () => {
  it('sums to exactly 1', () => {
    const total = Object.values(VIBE_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 10)
  })
})

describe('vibeLabelForScore', () => {
  it('maps each band to its label', () => {
    expect(vibeLabelForScore(0)).toBe('Ice Cold')
    expect(vibeLabelForScore(19)).toBe('Ice Cold')
    expect(vibeLabelForScore(20)).toBe('Cold')
    expect(vibeLabelForScore(34)).toBe('Cold')
    expect(vibeLabelForScore(35)).toBe('Cool')
    expect(vibeLabelForScore(49)).toBe('Cool')
    expect(vibeLabelForScore(50)).toBe('Warm')
    expect(vibeLabelForScore(64)).toBe('Warm')
    expect(vibeLabelForScore(65)).toBe('Hot')
    expect(vibeLabelForScore(79)).toBe('Hot')
    expect(vibeLabelForScore(80)).toBe('Overheated')
    expect(vibeLabelForScore(100)).toBe('Overheated')
  })

  it('returns null for a missing score', () => {
    expect(vibeLabelForScore(null)).toBeNull()
    expect(vibeLabelForScore(NaN)).toBeNull()
  })
})

describe('computeVibeSummary', () => {
  it('names the three dimensions furthest from neutral', () => {
    const summary = computeVibeSummary({
      sentiment: 95, valuation: 50, momentum: 5, congestion: 50, network: 99,
    })
    expect(summary).toContain('extreme greed')   // |95-50| = 45
    expect(summary).toContain('price falling')   // |5-50|  = 45
    expect(summary).toContain('hash rate climbing') // |99-50| = 49
    expect(summary).not.toContain('fairly valued')  // |50-50| = 0, not chosen
  })

  // The sentiment phrase and alternative.me's own classification are read side
  // by side — on the dashboard header, and on the link-preview card, where the
  // sentence and the labelled Fear & Greed value sit two lines apart. A 25 came
  // back from the source as "Extreme Fear" while this table said "market
  // fearful"; these bands now mirror the source's.
  it('matches the source classification at every band edge', () => {
    const phrase = sentiment => computeVibeSummary({ sentiment })
    expect(phrase(0)).toContain('extreme fear')
    expect(phrase(25)).toContain('extreme fear')   // the case that was wrong
    expect(phrase(26)).toContain('fearful')
    expect(phrase(46)).toContain('fearful')
    expect(phrase(47)).toContain('neutral')
    expect(phrase(54)).toContain('neutral')
    expect(phrase(55)).toContain('greedy')
    expect(phrase(75)).toContain('greedy')
    expect(phrase(76)).toContain('extreme greed')
    expect(phrase(100)).toContain('extreme greed')
  })

  it('keeps a stable reading order regardless of which are chosen', () => {
    // Sentiment precedes momentum in the sentence even though momentum ranks
    // higher by deviation.
    const summary = computeVibeSummary({ sentiment: 80, valuation: 50, momentum: 2 })
    expect(summary.indexOf('greed')).toBeLessThan(summary.indexOf('price falling'))
  })

  it('capitalises the first character and ends with a full stop', () => {
    const summary = computeVibeSummary({ sentiment: 72, valuation: 60, momentum: 30 })
    expect(summary.charAt(0)).toBe(summary.charAt(0).toUpperCase())
    expect(summary).toMatch(/\.$/)
  })

  it('returns null when nothing is available', () => {
    expect(computeVibeSummary(null)).toBeNull()
    expect(computeVibeSummary({})).toBeNull()
  })
})

describe('computePriceChange30d', () => {
  const candles = (closes) => closes.map((c, i) => [i, '0', '0', '0', String(c), '0', 0])

  it('compares the last close against the close 30 candles earlier', () => {
    const closes = Array.from({ length: 31 }, (_, i) => (i === 0 ? 100 : 0))
    closes[30] = 110
    expect(computePriceChange30d(candles(closes))).toBeCloseTo(10, 6)
  })

  it('returns a negative percentage when price has fallen', () => {
    const closes = Array.from({ length: 31 }, () => 0)
    closes[0] = 200
    closes[30] = 150
    expect(computePriceChange30d(candles(closes))).toBeCloseTo(-25, 6)
  })

  it('returns null for a series shorter than 31 candles', () => {
    expect(computePriceChange30d(candles(Array.from({ length: 30 }, () => 100)))).toBeNull()
  })

  it('returns null for missing or malformed input', () => {
    expect(computePriceChange30d(null)).toBeNull()
    expect(computePriceChange30d([])).toBeNull()
    expect(computePriceChange30d('nope')).toBeNull()
  })

  // Regression: filtering non-finite closes out *before* indexing slid the
  // window. With 200 candles and one bad close inside the last 31, the function
  // silently returned a 31-day change labelled as 30-day.
  it('keeps an exact 30-candle window when a candle inside it is malformed', () => {
    const closes = Array.from({ length: 200 }, (_, i) => 100 + i)
    const series = candles(closes)
    const withGap = series.map((c, i) => (i === 185 ? [i, '0', '0', '0', '', '0', 0] : c))
    // prior = closes[169] = 269, last = closes[199] = 299 → 11.1524%
    expect(computePriceChange30d(series)).toBeCloseTo(11.1524, 3)
    expect(computePriceChange30d(withGap)).toBeCloseTo(11.1524, 3)
  })

  it('returns null when either endpoint of the window is unusable', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i)
    const series = candles(closes)
    const badLast  = series.map((c, i) => (i === 39 ? [i, '0', '0', '0', '', '0', 0] : c))
    const badPrior = series.map((c, i) => (i === 9  ? [i, '0', '0', '0', '', '0', 0] : c))
    const zeroPrior = series.map((c, i) => (i === 9 ? [i, '0', '0', '0', '0', '0', 0] : c))
    expect(computePriceChange30d(badLast)).toBeNull()
    expect(computePriceChange30d(badPrior)).toBeNull()
    expect(computePriceChange30d(zeroPrior)).toBeNull()
  })
})

// The header sentence must survive a coverage shortfall that kills the score:
// it names live readings and makes no numeric claim.
describe('computeVibeDimensions / summary without a score', () => {
  it('produces a summary when the score is null for lack of coverage', () => {
    // MVRV rate-limited and the OHLC fetch failed: no Mayer, no MVRV, no
    // momentum. Coverage is 0.15 — far below the floor.
    const inputs = { fngScore: 27, fastestFeeSatsPerVb: 2, mempoolTxCount: 30_000, hashRateTrendPct: 3 }
    expect(computeVibeScore(inputs)).toBeNull()

    const summary = computeVibeSummary(vibeDimensionValues(computeVibeDimensions(inputs)))
    expect(summary).toBeTruthy()
    expect(summary).toMatch(/fearful|mempool|hash rate/)
  })

  it('returns a null summary only when genuinely nothing is available', () => {
    expect(computeVibeSummary(vibeDimensionValues(computeVibeDimensions({})))).toBeNull()
  })

  it('flattens detailed dimensions to plain values', () => {
    const values = vibeDimensionValues(computeVibeDimensions(NEUTRAL_INPUTS))
    expect(values.sentiment).toBeCloseTo(50, 5)
    expect(values.valuation).toBeCloseTo(50, 5)
    expect(Object.keys(values).sort()).toEqual(
      ['congestion', 'momentum', 'network', 'sentiment', 'valuation']
    )
  })
})

// ─── Hash rate 30d trend ──────────────────────────────────────────────────────

describe('computeHashRateTrend', () => {
  it('returns the correct positive percentage', () => {
    const rates = [{ avgHashrate: 780e18 }, { avgHashrate: 800e18 }]
    expect(computeHashRateTrend(rates)).toBeCloseTo(((800 - 780) / 780) * 100, 5)
  })

  it('returns the correct negative percentage', () => {
    const rates = [{ avgHashrate: 800e18 }, { avgHashrate: 780e18 }]
    expect(computeHashRateTrend(rates)).toBeCloseTo(((780 - 800) / 800) * 100, 5)
  })

  it('uses the first and last entries only, ignoring middle values', () => {
    const rates = [
      { avgHashrate: 780e18 },
      { avgHashrate: 900e18 },
      { avgHashrate: 800e18 },
    ]
    expect(computeHashRateTrend(rates)).toBeCloseTo(((800 - 780) / 780) * 100, 5)
  })

  it('returns null for null input', () => {
    expect(computeHashRateTrend(null)).toBeNull()
  })

  it('returns null for an empty array', () => {
    expect(computeHashRateTrend([])).toBeNull()
  })

  it('returns null for a single-element array', () => {
    expect(computeHashRateTrend([{ avgHashrate: 800e18 }])).toBeNull()
  })

  it('returns null when the first hashrate is zero (division guard)', () => {
    expect(computeHashRateTrend([{ avgHashrate: 0 }, { avgHashrate: 800e18 }])).toBeNull()
  })
})

// ─── Mempool pressure bar ─────────────────────────────────────────────────────

describe('computeMempoolPressurePct', () => {
  it('returns 0% for an empty mempool', () => {
    expect(computeMempoolPressurePct(0)).toBe(0)
  })

  it('returns 50% for 100,000 unconfirmed transactions', () => {
    expect(computeMempoolPressurePct(100_000)).toBe(50)
  })

  it('returns exactly 100% at the 200,000 transaction threshold', () => {
    expect(computeMempoolPressurePct(200_000)).toBe(100)
  })

  it('caps at 100% for counts above the threshold', () => {
    expect(computeMempoolPressurePct(250_000)).toBe(100)
    expect(computeMempoolPressurePct(1_000_000)).toBe(100)
  })

  it('returns null for null input', () => {
    expect(computeMempoolPressurePct(null)).toBeNull()
  })
})

// ─── Fiat fee estimate ────────────────────────────────────────────────────────

describe('calcFiatFee', () => {
  it('returns 2.5 for 10 sat/vB at $100,000 (10 * 250 / 1e8 * 100000)', () => {
    expect(calcFiatFee(10, 100000)).toBeCloseTo(2.5, 10)
  })

  it('returns 0.25 for 1 sat/vB at $100,000', () => {
    expect(calcFiatFee(1, 100000)).toBeCloseTo(0.25, 10)
  })

  it('returns 0 for fee rate of 0', () => {
    expect(calcFiatFee(0, 100000)).toBe(0)
  })

  it('returns 0 for price of 0', () => {
    expect(calcFiatFee(10, 0)).toBe(0)
  })
})

// ─── 7-day volume average ────────────────────────────────────────────────────

describe('computeVol7dAvg', () => {
  it('averages the tracked history', () => {
    expect(computeVol7dAvg([{ volume: 10 }, { volume: 20 }, { volume: 30 }])).toBe(20)
  })

  it('returns null for a single day — one entry compared against itself is 0%, which is no signal', () => {
    expect(computeVol7dAvg([{ volume: 10 }])).toBeNull()
  })

  it('returns null for missing or empty history', () => {
    expect(computeVol7dAvg(null)).toBeNull()
    expect(computeVol7dAvg([])).toBeNull()
  })
})
