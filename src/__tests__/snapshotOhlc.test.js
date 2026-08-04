import { describe, it, expect } from 'vitest'
import {
  KRAKEN_OHLC_URL, extractKrakenOhlc, calc200DMA, calcMayerMultiple,
} from '../../scripts/lib/ohlc.js'

// Kraken candle: [time, open, high, low, close, vwap, volume, count].
// Close is index 4 — the same position Binance klines use.
function candle(close, time = 1_700_000_000) {
  return [time, '100', '110', '90', String(close), '100', '1.5', 42]
}

// Kraken returns the series under a normalised pair name: asking for XBTUSD
// gives back XXBTZUSD.
function krakenResponse(candles, pairKey = 'XXBTZUSD') {
  return { error: [], result: { [pairKey]: candles, last: 1_700_000_000 } }
}

describe('KRAKEN_OHLC_URL', () => {
  it('requests daily candles, which is what a 200-day MA needs', () => {
    expect(KRAKEN_OHLC_URL).toContain('interval=1440')
    expect(KRAKEN_OHLC_URL).toContain('pair=XBTUSD')
  })
})

describe('extractKrakenOhlc', () => {
  it('finds the series under the normalised pair name, not the requested one', () => {
    const candles = [candle(100), candle(200)]
    expect(extractKrakenOhlc(krakenResponse(candles))).toEqual(candles)
  })

  it('works whatever the pair key is named', () => {
    const candles = [candle(100)]
    expect(extractKrakenOhlc(krakenResponse(candles, 'XBTUSD'))).toEqual(candles)
  })

  it('does not mistake the `last` cursor for the series', () => {
    const candles = [candle(100)]
    const result = extractKrakenOhlc(krakenResponse(candles))
    expect(result).toEqual(candles)
    expect(result).not.toBe(1_700_000_000)
  })

  it('returns null when Kraken reports an error', () => {
    expect(extractKrakenOhlc({
      error: ['EGeneral:Invalid arguments'],
      result: { XXBTZUSD: [candle(100)] },
    })).toBeNull()
  })

  it('returns null for a failed fetch or unrecognised body', () => {
    expect(extractKrakenOhlc(null)).toBeNull()
    expect(extractKrakenOhlc(undefined)).toBeNull()
    expect(extractKrakenOhlc({})).toBeNull()
    expect(extractKrakenOhlc({ error: [], result: {} })).toBeNull()
    expect(extractKrakenOhlc('not an object')).toBeNull()
  })
})

describe('calc200DMA', () => {
  it('averages the trailing 200 closes', () => {
    // 200 candles all closing at 50_000 → mean is 50_000.
    expect(calc200DMA(Array.from({ length: 200 }, () => candle(50_000)))).toBe(50_000)
  })

  it('uses only the most recent 200 when more are returned', () => {
    // Kraken returns ~720 candles. Older ones must not drag the mean.
    const old = Array.from({ length: 520 }, () => candle(10_000))
    const recent = Array.from({ length: 200 }, () => candle(60_000))
    expect(calc200DMA([...old, ...recent])).toBe(60_000)
  })

  it('refuses to compute from a short series rather than mislabelling it', () => {
    // Averaging 40 candles into a column called "200-day MA" would put a
    // plausible-looking wrong number into a permanent historical record.
    expect(calc200DMA(Array.from({ length: 199 }, () => candle(50_000)))).toBeNull()
    expect(calc200DMA([])).toBeNull()
    expect(calc200DMA(null)).toBeNull()
  })

  it('returns null when a close is not a number', () => {
    const candles = Array.from({ length: 200 }, () => candle(50_000))
    candles[10] = [1, '1', '1', '1', 'not-a-number', '1', '1', 1]
    expect(calc200DMA(candles)).toBeNull()
  })
})

describe('calcMayerMultiple', () => {
  it('is price over the 200-day MA', () => {
    expect(calcMayerMultiple(60_000, 50_000)).toBeCloseTo(1.2)
  })

  it('returns null rather than dividing by zero or by nothing', () => {
    expect(calcMayerMultiple(60_000, 0)).toBeNull()
    expect(calcMayerMultiple(60_000, null)).toBeNull()
    expect(calcMayerMultiple(null, 50_000)).toBeNull()
  })
})
