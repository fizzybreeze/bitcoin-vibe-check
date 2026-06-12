import { describe, it, expect } from 'vitest'
import { calc200DMA, calcMayerMultiple, calcPowerLawFairValue } from '../cycleCalculations.js'

// Build a synthetic klines array: each entry is [openTime, open, high, low, close, ...]
function makeKlines(closes) {
  return closes.map((close, i) => [i * 86400000, '0', '0', '0', String(close), '0'])
}

describe('calc200DMA', () => {
  it('returns null for empty input', () => {
    expect(calc200DMA([])).toBeNull()
    expect(calc200DMA(null)).toBeNull()
    expect(calc200DMA(undefined)).toBeNull()
  })

  it('averages 200 identical closes correctly', () => {
    const klines = makeKlines(Array(200).fill(50000))
    expect(calc200DMA(klines)).toBeCloseTo(50000, 5)
  })

  it('uses only the last 200 entries when more are provided', () => {
    // 100 entries at 0, then 200 entries at 100000 — average should be 100000
    const klines = makeKlines([...Array(100).fill(0), ...Array(200).fill(100000)])
    expect(calc200DMA(klines)).toBeCloseTo(100000, 5)
  })

  it('works correctly with fewer than 200 entries', () => {
    const klines = makeKlines([10000, 20000, 30000])
    expect(calc200DMA(klines)).toBeCloseTo(20000, 5)
  })

  it('parses close price from index 4 of each row', () => {
    const klines = [[0, '1', '2', '3', '99999', '0']]
    expect(calc200DMA(klines)).toBeCloseTo(99999, 5)
  })
})

describe('calcMayerMultiple', () => {
  it('divides current price by MA200', () => {
    expect(calcMayerMultiple(65000, 50000)).toBeCloseTo(1.3, 5)
  })

  it('returns null when price is null', () => {
    expect(calcMayerMultiple(null, 50000)).toBeNull()
  })

  it('returns null when ma200 is null', () => {
    expect(calcMayerMultiple(65000, null)).toBeNull()
  })

  it('returns null when ma200 is zero (avoids division by zero)', () => {
    expect(calcMayerMultiple(65000, 0)).toBeNull()
  })

  it('handles values below 1 correctly', () => {
    expect(calcMayerMultiple(40000, 50000)).toBeCloseTo(0.8, 5)
  })
})

describe('calcPowerLawFairValue', () => {
  it('returns a number greater than zero', () => {
    const result = calcPowerLawFairValue()
    expect(result).toBeTypeOf('number')
    expect(result).toBeGreaterThan(0)
  })

  it('returns a value in the plausible BTC price range (>1,000 and <10,000,000)', () => {
    const result = calcPowerLawFairValue()
    expect(result).toBeGreaterThan(1_000)
    expect(result).toBeLessThan(10_000_000)
  })
})
