import { describe, it, expect } from 'vitest'
import {
  sanitiseInput, detectInputType, satsToBtc, calcFeeRate, btcToFiat,
} from '../utils.js'

describe('sanitiseInput', () => {
  it('strips leading and trailing whitespace', () => {
    expect(sanitiseInput('  abc  ')).toBe('abc')
  })

  it('strips internal whitespace', () => {
    expect(sanitiseInput('a b c')).toBe('abc')
  })

  it('strips non-alphanumeric characters', () => {
    expect(sanitiseInput('abc-def!@#')).toBe('abcdef')
  })

  it('handles null/undefined without throwing', () => {
    expect(sanitiseInput(null)).toBe('')
    expect(sanitiseInput(undefined)).toBe('')
  })
})

describe('detectInputType', () => {
  it('identifies a 64-character hex string as a transaction ID', () => {
    expect(detectInputType('a'.repeat(64))).toBe('tx')
    expect(detectInputType('0'.repeat(64))).toBe('tx')
    expect(detectInputType('abcdefABCDEF0123'.repeat(4))).toBe('tx')
  })

  it('rejects hex strings that are not exactly 64 characters', () => {
    expect(detectInputType('a'.repeat(63))).toBeNull()
    expect(detectInputType('a'.repeat(65))).toBeNull()
  })

  it('rejects a 64-character non-hex string', () => {
    expect(detectInputType('g'.repeat(64))).toBeNull()
  })

  it('identifies a P2PKH address (starts with 1) as an address', () => {
    // 34 chars, starts with 1
    expect(detectInputType('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe('address')
  })

  it('identifies a P2SH address (starts with 3) as an address', () => {
    expect(detectInputType('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe('address')
  })

  it('identifies a bech32 address (starts with bc1) as an address', () => {
    expect(detectInputType('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe('address')
  })

  it('rejects an address that is too short (< 25 chars)', () => {
    expect(detectInputType('1abc')).toBeNull()
    expect(detectInputType('1' + 'a'.repeat(23))).toBeNull() // 24 chars
  })

  it('rejects an address that is too long (> 62 chars)', () => {
    expect(detectInputType('1' + 'a'.repeat(62))).toBeNull() // 63 chars
  })

  it('rejects a string that matches neither pattern', () => {
    expect(detectInputType('')).toBeNull()
    expect(detectInputType('notvalid')).toBeNull()
    expect(detectInputType('xyz' + 'a'.repeat(30))).toBeNull()
  })
})

describe('satsToBtc', () => {
  it('converts 1 BTC worth of satoshis correctly', () => {
    expect(satsToBtc(100_000_000)).toBe(1)
  })

  it('converts to correct decimal places (4 dp)', () => {
    expect(satsToBtc(10_000).toFixed(4)).toBe('0.0001')
    expect(satsToBtc(12_345_678).toFixed(4)).toBe('0.1235')
    expect(satsToBtc(50_000_000).toFixed(4)).toBe('0.5000')
  })

  it('handles zero satoshis', () => {
    expect(satsToBtc(0)).toBe(0)
  })
})

describe('calcFeeRate', () => {
  it('calculates fee rate as fee divided by vsize', () => {
    expect(calcFeeRate(2250, 225)).toBe(10)
    expect(calcFeeRate(4500, 300)).toBe(15)
    expect(calcFeeRate(1000, 200)).toBe(5)
  })

  it('returns null when vsize is zero', () => {
    expect(calcFeeRate(100, 0)).toBeNull()
  })

  it('returns null when vsize is null or undefined', () => {
    expect(calcFeeRate(100, null)).toBeNull()
    expect(calcFeeRate(100, undefined)).toBeNull()
  })

  it('returns null when fee is null', () => {
    expect(calcFeeRate(null, 200)).toBeNull()
  })
})

describe('btcToFiat', () => {
  it('converts BTC to USD using live price', () => {
    expect(btcToFiat(1, 105000)).toBe(105000)
    expect(btcToFiat(0.5, 105000)).toBe(52500)
    expect(btcToFiat(2, 105000)).toBe(210000)
  })

  it('converts BTC to GBP using live price', () => {
    expect(btcToFiat(1, 82000)).toBe(82000)
    expect(btcToFiat(0.5, 82000)).toBe(41000)
  })

  it('returns null when price is null', () => {
    expect(btcToFiat(1, null)).toBeNull()
  })

  it('returns null when price is undefined', () => {
    expect(btcToFiat(1, undefined)).toBeNull()
  })
})
