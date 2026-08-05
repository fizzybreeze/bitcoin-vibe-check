import { describe, it, expect } from 'vitest'
import {
  KRAKEN_INTERVAL, KRAKEN_MAX_CANDLES,
  krakenParamsForDays, krakenOhlcUrl, extractKrakenOhlc, parseKrakenOhlc,
} from '../ohlc.js'

// Kraken candle: [time_s, open, high, low, close, vwap, volume_base, count]
function candle(timeSeconds, close, { vwap = close, volumeBtc = 10 } = {}) {
  return [timeSeconds, String(close - 100), String(close + 100), String(close - 200),
          String(close), String(vwap), String(volumeBtc), 50]
}

const DAY_S = 86_400
const HOUR_S = 3_600

describe('krakenParamsForDays', () => {
  it('mirrors the ranges the chart offers', () => {
    expect(krakenParamsForDays(1)).toEqual({ interval: KRAKEN_INTERVAL.HOUR, count: 24 })
    expect(krakenParamsForDays(7)).toEqual({ interval: KRAKEN_INTERVAL.FOUR_HOUR, count: 42 })
    expect(krakenParamsForDays(30)).toEqual({ interval: KRAKEN_INTERVAL.DAY, count: 30 })
    expect(krakenParamsForDays(365)).toEqual({ interval: KRAKEN_INTERVAL.DAY, count: 365 })
  })

  it('never asks for more candles than Kraken will return', () => {
    for (const days of [1, 7, 30, 365]) {
      expect(krakenParamsForDays(days).count).toBeLessThanOrEqual(KRAKEN_MAX_CANDLES)
    }
  })

  it('falls back to the 1Y shape for an unknown range', () => {
    expect(krakenParamsForDays(999)).toEqual({ interval: KRAKEN_INTERVAL.DAY, count: 365 })
  })
})

describe('krakenOhlcUrl', () => {
  it('targets the US-accessible Kraken endpoint, not Binance', () => {
    const url = krakenOhlcUrl(KRAKEN_INTERVAL.DAY)
    expect(url).toContain('api.kraken.com')
    expect(url).not.toContain('binance')
    expect(url).toContain('interval=1440')
    expect(url).toContain('pair=XBTUSD')
  })
})

describe('extractKrakenOhlc', () => {
  it('finds the candle array under the canonical pair key', () => {
    // Kraken renames XBTUSD to XXBTZUSD in the response — never hardcode it.
    const json = { error: [], result: { XXBTZUSD: [candle(1, 100)], last: 123 } }
    expect(extractKrakenOhlc(json)).toHaveLength(1)
  })

  it('ignores the `last` key when locating candles', () => {
    const json = { error: [], result: { last: 123, XXBTZUSD: [candle(1, 100), candle(2, 200)] } }
    expect(extractKrakenOhlc(json)).toHaveLength(2)
  })

  it('throws when Kraken reports an error inside a 200 response', () => {
    const json = { error: ['EQuery:Unknown asset pair'], result: {} }
    expect(() => extractKrakenOhlc(json)).toThrow(/Unknown asset pair/)
  })

  it('returns null for malformed or empty payloads', () => {
    expect(extractKrakenOhlc(null)).toBeNull()
    expect(extractKrakenOhlc({})).toBeNull()
    expect(extractKrakenOhlc({ error: [], result: {} })).toBeNull()
    expect(extractKrakenOhlc({ error: [], result: { last: 1 } })).toBeNull()
  })
})

describe('parseKrakenOhlc', () => {
  it('returns null when there are no candles', () => {
    expect(parseKrakenOhlc([], 30, 30)).toBeNull()
    expect(parseKrakenOhlc(null, 30, 30)).toBeNull()
  })

  it('takes only the most recent `count` candles', () => {
    const candles = Array.from({ length: 100 }, (_, i) => candle(i * DAY_S, 1000 + i))
    const out = parseKrakenOhlc(candles, 30, 30)
    expect(out).toHaveLength(30)
    // Last candle of the input must be the last point of the output.
    expect(out[out.length - 1].price).toBe(1099)
  })

  it('reads close from index 4', () => {
    const out = parseKrakenOhlc([candle(DAY_S, 42_000)], 30, 1)
    expect(out[0].price).toBe(42_000)
  })

  it('treats index 0 as seconds, not milliseconds', () => {
    // 1 700 000 000s is 2023; if read as ms it would be 1970 and the label
    // would say "Jan". This is the exact bug the Binance→Kraken swap could
    // have introduced.
    const out = parseKrakenOhlc([candle(1_700_000_000, 35_000)], 30, 1)
    expect(out[0].date).not.toMatch(/Jan 1970|1 Jan/)
    expect(out[0].date).toMatch(/Nov/)
  })

  it('converts base volume to USD using vwap', () => {
    // 2 BTC at a vwap of 50 000 is 100 000 USD — not 2, which is what reading
    // Kraken's volume column as if it were Binance quote volume would give.
    const out = parseKrakenOhlc([candle(DAY_S, 49_000, { vwap: 50_000, volumeBtc: 2 })], 30, 1)
    expect(out[0].volume).toBe(100_000)
  })

  it('falls back to close when vwap is zero on an empty candle', () => {
    const out = parseKrakenOhlc([candle(DAY_S, 60_000, { vwap: 0, volumeBtc: 3 })], 30, 1)
    expect(out[0].volume).toBe(180_000)
  })

  it('buckets the 7D range into one bar per day', () => {
    // Six candles spanning two days -> two daily bars. Anchored at midday UTC
    // and clustered within four hours so each day's candles stay on the same
    // calendar date under any plausible runner timezone.
    const base = Date.UTC(2023, 10, 15, 12, 0, 0) / 1000
    const candles = [
      candle(base,                      100, { vwap: 1, volumeBtc: 5 }),
      candle(base + 2 * HOUR_S,         110, { vwap: 1, volumeBtc: 5 }),
      candle(base + 4 * HOUR_S,         120, { vwap: 1, volumeBtc: 5 }),
      candle(base + DAY_S,              130, { vwap: 1, volumeBtc: 7 }),
      candle(base + DAY_S + 2 * HOUR_S, 140, { vwap: 1, volumeBtc: 7 }),
      candle(base + DAY_S + 4 * HOUR_S, 150, { vwap: 1, volumeBtc: 7 }),
    ]
    const out = parseKrakenOhlc(candles, 7, 42)
    expect(out).toHaveLength(2)
    // Each bar keeps the day's last close and the summed volume.
    expect(out[0].price).toBe(120)
    expect(out[0].volume).toBe(15)
    expect(out[1].price).toBe(150)
    expect(out[1].volume).toBe(21)
  })

  it('uses time labels for 1D and date labels for longer ranges', () => {
    const hourly = parseKrakenOhlc([candle(1_700_000_000, 100)], 1, 24)
    expect(hourly[0].date).toMatch(/^\d{2}:\d{2}$/)

    const daily = parseKrakenOhlc([candle(1_700_000_000, 100)], 30, 30)
    expect(daily[0].date).not.toMatch(/^\d{2}:\d{2}$/)
  })
})
