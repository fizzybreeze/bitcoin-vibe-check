import { describe, it, expect } from 'vitest'
import {
  fmtCurrency, fmtVolume, computeChartChange,
  blocksToNextHalving, halvingEstimatedDate, epochPercentage, epochProgressBar, btcDominanceLabel,
} from '../utils.js'

describe('fmtCurrency', () => {
  it('formats USD correctly', () => {
    const result = fmtCurrency(105000, 'usd')
    expect(result).toContain('105,000')
    expect(result).toContain('$')
  })

  it('formats GBP correctly', () => {
    const result = fmtCurrency(105000, 'gbp')
    expect(result).toContain('£')
  })

  it('handles zero without throwing', () => {
    expect(() => fmtCurrency(0, 'usd')).not.toThrow()
    expect(fmtCurrency(0, 'usd')).toContain('0')
  })

  it('handles null without throwing', () => {
    expect(() => fmtCurrency(null, 'usd')).not.toThrow()
  })

  it('handles undefined without throwing', () => {
    expect(() => fmtCurrency(undefined, 'usd')).not.toThrow()
  })
})

describe('fmtVolume', () => {
  it('returns null for null input', () => {
    expect(fmtVolume(null, 'usd')).toBeNull()
  })

  it('formats billions', () => {
    expect(fmtVolume(35_000_000_000, 'usd')).toBe('$35.0B')
  })

  it('formats millions', () => {
    expect(fmtVolume(2_000_000, 'usd')).toBe('$2M')
  })

  it('uses GBP symbol for millions', () => {
    expect(fmtVolume(2_000_000, 'gbp')).toBe('£2M')
  })
})

describe('computeChartChange', () => {
  it('returns null for null input', () => {
    expect(computeChartChange(null)).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(computeChartChange([])).toBeNull()
  })

  it('returns null for single item', () => {
    expect(computeChartChange([{ price: 100000 }])).toBeNull()
  })

  it('calculates positive percentage change', () => {
    const result = computeChartChange([{ price: 100000 }, { price: 105000 }])
    expect(result).toBeCloseTo(5)
  })

  it('calculates negative percentage change', () => {
    const result = computeChartChange([{ price: 100000 }, { price: 90000 }])
    expect(result).toBeCloseTo(-10)
  })

  it('returns zero for flat data', () => {
    const result = computeChartChange([{ price: 100000 }, { price: 100000 }])
    expect(result).toBeCloseTo(0)
  })

  it('uses first and last points only, ignoring middle values', () => {
    const data = [{ price: 100000 }, { price: 200000 }, { price: 110000 }]
    expect(computeChartChange(data)).toBeCloseTo(10)
  })
})

describe('blocksToNextHalving', () => {
  it('returns correct blocks remaining for a known height', () => {
    expect(blocksToNextHalving(897000)).toBe(153000)
  })

  it('returns 0 at the halving height', () => {
    expect(blocksToNextHalving(1050000)).toBe(0)
  })

  it('returns a negative number past the halving', () => {
    expect(blocksToNextHalving(1100000)).toBe(-50000)
  })
})

describe('halvingEstimatedDate', () => {
  it('adds correct milliseconds based on blocks remaining', () => {
    const now = 1748380800000
    const result = halvingEstimatedDate(153000, now)
    expect(result.getTime()).toBe(now + 153000 * 10 * 60 * 1000)
  })

  it('returns a Date instance', () => {
    expect(halvingEstimatedDate(100, Date.now())).toBeInstanceOf(Date)
  })

  it('returns now for 0 blocks remaining', () => {
    const now = 1748380800000
    expect(halvingEstimatedDate(0, now).getTime()).toBe(now)
  })
})

describe('epochPercentage', () => {
  it('calculates correctly for a known block height', () => {
    // 897000 % 210000 = 57000; 57000/210000 * 100 ≈ 27.14
    expect(epochPercentage(897000)).toBeCloseTo(27.14, 1)
  })

  it('returns 0 at the start of an epoch', () => {
    expect(epochPercentage(840000)).toBe(0)
  })

  it('returns near 100 at the end of an epoch', () => {
    expect(epochPercentage(1049999)).toBeCloseTo(99.99, 1)
  })

  it('returns 0 at genesis (height 0)', () => {
    expect(epochPercentage(0)).toBe(0)
  })
})

describe('epochProgressBar', () => {
  it('returns 10 filled blocks for 100%', () => {
    expect(epochProgressBar(100)).toBe('▓▓▓▓▓▓▓▓▓▓')
  })

  it('returns 0 filled blocks for 0%', () => {
    expect(epochProgressBar(0)).toBe('░░░░░░░░░░')
  })

  it('returns 5 filled for ~50%', () => {
    expect(epochProgressBar(50)).toBe('▓▓▓▓▓░░░░░')
  })

  it('always returns a 10-character string', () => {
    for (const pct of [0, 25, 50, 75, 100]) {
      expect(epochProgressBar(pct)).toHaveLength(10)
    }
  })
})

describe('btcDominanceLabel', () => {
  it('returns null for null input', () => {
    expect(btcDominanceLabel(null)).toBeNull()
  })

  it('returns Bitcoin season above 60%', () => {
    const result = btcDominanceLabel(65)
    expect(result.text).toBe('Bitcoin season')
    expect(result.cls).toBe('text-orange-400')
  })

  it('returns Altcoin season below 45%', () => {
    const result = btcDominanceLabel(40)
    expect(result.text).toBe('Altcoin season')
    expect(result.cls).toBe('text-purple-400')
  })

  it('returns Mixed market between 45% and 60%', () => {
    const result = btcDominanceLabel(52)
    expect(result.text).toBe('Mixed market')
    expect(result.cls).toBe('text-gray-500')
  })

  it('returns Mixed market at exactly 60% (not above)', () => {
    expect(btcDominanceLabel(60).text).toBe('Mixed market')
  })

  it('returns Mixed market at exactly 45% (not below)', () => {
    expect(btcDominanceLabel(45).text).toBe('Mixed market')
  })
})
