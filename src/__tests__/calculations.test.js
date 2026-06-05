// Build: confirm `npm run build` passes before running these tests.
// Run: npm test
import { describe, it, expect } from 'vitest'
import {
  computeAthDistance,
  computeSatsPerFiat,
  computeIssuedSupply,
  computeVibeLabel,
  computeHashRateTrend,
  computeMempoolPressurePct,
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

// ─── Sentiment summary line ───────────────────────────────────────────────────

describe('computeVibeLabel', () => {
  it('returns null when any argument is null', () => {
    expect(computeVibeLabel(null, 72, 3.2)).toBeNull()
    expect(computeVibeLabel(2.5, null, 3.2)).toBeNull()
    expect(computeVibeLabel(2.5, 72, null)).toBeNull()
  })

  // Fear & Greed boundaries
  it('includes "extreme fear" for fngScore at the upper boundary (24)', () => {
    expect(computeVibeLabel(1, 24, 0)).toContain('extreme fear')
  })

  it('includes "fearful" for fngScore just above the extreme-fear boundary (25)', () => {
    expect(computeVibeLabel(1, 25, 0)).toContain('fearful')
    expect(computeVibeLabel(1, 25, 0)).not.toContain('extreme fear')
  })

  it('includes "fearful" at the upper boundary (44)', () => {
    expect(computeVibeLabel(1, 44, 0)).toContain('fearful')
  })

  it('includes "neutral" just above the fearful boundary (45)', () => {
    expect(computeVibeLabel(1, 45, 0)).toContain('neutral')
  })

  it('includes "neutral" at the upper boundary (55)', () => {
    expect(computeVibeLabel(1, 55, 0)).toContain('neutral')
  })

  it('includes "greedy" just above the neutral boundary (56)', () => {
    expect(computeVibeLabel(1, 56, 0)).toContain('greedy')
    expect(computeVibeLabel(1, 56, 0)).not.toContain('extreme greed')
  })

  it('includes "greedy" at the upper boundary (74)', () => {
    expect(computeVibeLabel(1, 74, 0)).toContain('greedy')
  })

  it('includes "extreme greed" for fngScore at the lower boundary (75)', () => {
    expect(computeVibeLabel(1, 75, 0)).toContain('extreme greed')
  })

  // Price direction boundaries
  it('uses "price is flat" when |priceChange24h| <= 0.2', () => {
    expect(computeVibeLabel(0.2,  50, 0)).toContain('price is flat')
    expect(computeVibeLabel(-0.2, 50, 0)).toContain('price is flat')
    expect(computeVibeLabel(0,    50, 0)).toContain('price is flat')
  })

  it('uses "price is up" when priceChange24h is just above 0.2', () => {
    expect(computeVibeLabel(0.21, 50, 0)).toContain('price is up')
  })

  it('uses "price is down" when priceChange24h is just below -0.2', () => {
    expect(computeVibeLabel(-0.21, 50, 0)).toContain('price is down')
  })

  // Miner activity boundaries
  it('uses "miners are steady" when diffChange is within ±3', () => {
    expect(computeVibeLabel(1, 50,  3)).toContain('miners are steady')
    expect(computeVibeLabel(1, 50, -3)).toContain('miners are steady')
    expect(computeVibeLabel(1, 50,  0)).toContain('miners are steady')
  })

  it('uses "miners are slowing" when diffChange is just below -3', () => {
    expect(computeVibeLabel(1, 50, -3.01)).toContain('miners are slowing')
  })

  it('uses "miners are speeding up" when diffChange is just above 3', () => {
    expect(computeVibeLabel(1, 50, 3.01)).toContain('miners are speeding up')
  })

  // Formatting
  it('capitalises the first character', () => {
    const result = computeVibeLabel(2.5, 72, 3.2)
    expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase())
    expect(result.charAt(0)).not.toBe(result.charAt(0).toLowerCase())
  })

  it('ends with a full stop', () => {
    expect(computeVibeLabel(2.5, 72, 3.2)).toMatch(/\.$/)
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
