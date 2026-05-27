import { describe, it, expect } from 'vitest'
import { fmtCurrency, fmtVolume, computeChartChange } from '../utils.js'

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
})
