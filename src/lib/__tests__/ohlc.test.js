import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  KRAKEN_INTERVAL, KRAKEN_MAX_CANDLES,
  krakenParamsForDays, krakenOhlcUrl, extractKrakenOhlc, parseKrakenOhlc,
  fetchKrakenCandles, _resetInFlight, KRAKEN_FETCH_TIMEOUT_MS,
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

  it('ignores the `last` cursor when locating candles', () => {
    const json = { error: [], result: { last: 123, XXBTZUSD: [candle(1, 100), candle(2, 200)] } }
    expect(extractKrakenOhlc(json)).toHaveLength(2)
  })

  it('throws when Kraken reports an error inside a 200 response', () => {
    // res.ok would be true here, so without this the failure passes silently.
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
    // Kraken has no limit parameter, so the slice is the app's job.
    const candles = Array.from({ length: 100 }, (_, i) => candle(i * DAY_S, 1000 + i))
    const out = parseKrakenOhlc(candles, 30, 30)
    expect(out).toHaveLength(30)
    expect(out[out.length - 1].price).toBe(1099)
  })

  it('reads close from index 4', () => {
    const out = parseKrakenOhlc([candle(DAY_S, 42_000)], 30, 1)
    expect(out[0].price).toBe(42_000)
  })

  it('treats index 0 as seconds, not milliseconds', () => {
    // Read as ms this would land in 1970. Binance used ms; Kraken uses seconds.
    const out = parseKrakenOhlc([candle(1_700_000_000, 35_000)], 30, 1)
    expect(out[0].date).not.toMatch(/1970/)
    expect(out[0].date).toMatch(/Nov/)
  })

  it('converts base volume to USD using vwap', () => {
    // Binance's chart read index 7 (quote volume, USD). Kraken index 6 is BTC,
    // so returning it directly would show 2 instead of 100,000 — a chart that
    // still renders, with silently wrong bars.
    const out = parseKrakenOhlc([candle(DAY_S, 49_000, { vwap: 50_000, volumeBtc: 2 })], 30, 1)
    expect(out[0].volume).toBe(100_000)
  })

  it('falls back to close when vwap is zero on a candle with no trades', () => {
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

// #24. The 1M chart, the 1Y chart and the 200-day MA series all resolve to the
// same `interval=1440` URL now that Kraken has no `limit` parameter.
describe('fetchKrakenCandles', () => {
  const okBody = candles => ({
    ok: true,
    status: 200,
    json: async () => ({ error: [], result: { XXBTZUSD: candles, last: 1 } }),
  })

  /** A promise plus its resolvers, so a request can be held in flight. */
  function deferred() {
    let resolve, reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }

  beforeEach(() => {
    _resetInFlight()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    _resetInFlight()
  })

  it('collapses concurrent requests for the same URL into one fetch', async () => {
    const gate = deferred()
    fetch.mockReturnValue(gate.promise)

    // 1M, 1Y and the 200-day series, all interval=1440, all still in flight.
    const a = fetchKrakenCandles(KRAKEN_INTERVAL.DAY)
    const b = fetchKrakenCandles(KRAKEN_INTERVAL.DAY)
    const c = fetchKrakenCandles(KRAKEN_INTERVAL.DAY)
    gate.resolve(okBody([candle(DAY_S, 100)]))

    const [ra, rb, rc] = await Promise.all([a, b, c])
    expect(fetch).toHaveBeenCalledTimes(1)
    // The same array, not merely an equal one — which is why callers must slice
    // rather than mutate.
    expect(ra).toBe(rb)
    expect(rb).toBe(rc)
  })

  it('does not share between different intervals', async () => {
    fetch.mockResolvedValue(okBody([candle(DAY_S, 100)]))

    await Promise.all([
      fetchKrakenCandles(KRAKEN_INTERVAL.DAY),
      fetchKrakenCandles(KRAKEN_INTERVAL.HOUR),
    ])
    expect(fetch).toHaveBeenCalledTimes(2)
    const urls = fetch.mock.calls.map(([url]) => url)
    expect(urls).toContain(krakenOhlcUrl(KRAKEN_INTERVAL.DAY))
    expect(urls).toContain(krakenOhlcUrl(KRAKEN_INTERVAL.HOUR))
  })

  it('refetches once the previous request has settled', async () => {
    // In-flight dedupe, not a response cache. The 200-day series refreshes
    // every 6 hours and the chart retries after a failure; both must reach the
    // network rather than replay a stored body.
    fetch.mockResolvedValue(okBody([candle(DAY_S, 100)]))

    await fetchKrakenCandles(KRAKEN_INTERVAL.DAY)
    await fetchKrakenCandles(KRAKEN_INTERVAL.DAY)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not retain a failed request', async () => {
    // A rejection left in the map would pin the error for the rest of the
    // session: every later caller would replay it without touching the network.
    fetch.mockRejectedValueOnce(new Error('network down'))
    await expect(fetchKrakenCandles(KRAKEN_INTERVAL.DAY)).rejects.toThrow('network down')

    fetch.mockResolvedValueOnce(okBody([candle(DAY_S, 100)]))
    await expect(fetchKrakenCandles(KRAKEN_INTERVAL.DAY)).resolves.toHaveLength(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('rejects every sharer of a failed request', async () => {
    const gate = deferred()
    fetch.mockReturnValue(gate.promise)

    const a = fetchKrakenCandles(KRAKEN_INTERVAL.DAY)
    const b = fetchKrakenCandles(KRAKEN_INTERVAL.DAY)
    gate.reject(new Error('network down'))

    await expect(a).rejects.toThrow('network down')
    await expect(b).rejects.toThrow('network down')
  })

  it('does not raise an unhandled rejection when a shared request fails', async () => {
    // The map is cleared with then(clear, clear), not .finally(clear): finally
    // re-throws, so its derived promise would reject with nothing awaiting it
    // and every failed fetch would log an unhandled rejection.
    // Reached through globalThis because these test files lint against browser
    // globals; the rejection is still reported by the Node process vitest runs
    // in, which is the only place it can be observed.
    const unhandled = []
    const onUnhandled = reason => unhandled.push(reason)
    globalThis.process.on('unhandledRejection', onUnhandled)
    try {
      fetch.mockRejectedValueOnce(new Error('network down'))
      await expect(fetchKrakenCandles(KRAKEN_INTERVAL.DAY)).rejects.toThrow('network down')
      // Node reports unhandled rejections at the end of the event-loop turn.
      await new Promise(resolve => setTimeout(resolve, 0))
    } finally {
      globalThis.process.off('unhandledRejection', onUnhandled)
    }
    expect(unhandled).toEqual([])
  })

  it('bounds the request so a hang cannot pin the URL forever', async () => {
    // The regression this exists for: `clear` only runs on settle, so a fetch
    // that never settles keeps its entry in the map for the page's lifetime —
    // and since the entry is shared, the 1M chart, the 1Y chart and the
    // 6-hourly 200-day refresh would all attach to the dead promise. The chart
    // would spin forever with no error and a disabled Refresh button. Before
    // the dedupe each call site issued its own fetch and recovered on its own.
    //
    // Asserted through a real abort signal rather than by reading the option
    // back off the mock: passing a signal nothing honours would satisfy that
    // and fix nothing.
    fetch.mockImplementation((_url, { signal } = {}) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason))
    }))

    vi.useFakeTimers()
    try {
      const request = fetchKrakenCandles(KRAKEN_INTERVAL.DAY)
      const settled = request.then(() => 'resolved', () => 'rejected')

      // Still in flight: a second caller shares it rather than refetching.
      await vi.advanceTimersByTimeAsync(KRAKEN_FETCH_TIMEOUT_MS - 1)
      fetchKrakenCandles(KRAKEN_INTERVAL.DAY).catch(() => {})
      expect(fetch).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(2)
      expect(await settled).toBe('rejected')

      // Past the deadline the entry is gone, so the next caller — the 1M chart,
      // or the 200-day refresh six hours later — reaches the network again.
      fetchKrakenCandles(KRAKEN_INTERVAL.DAY).catch(() => {})
      expect(fetch).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('throws on a non-ok response', async () => {
    fetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    await expect(fetchKrakenCandles(KRAKEN_INTERVAL.DAY)).rejects.toThrow(/429/)
  })

  it('throws on a Kraken error reported inside a 200', async () => {
    // res.ok is true here, so without extractKrakenOhlc the chart would render
    // an empty series rather than retry.
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: ['EGeneral:Temporary lockout'], result: {} }),
    })
    await expect(fetchKrakenCandles(KRAKEN_INTERVAL.DAY)).rejects.toThrow(/Temporary lockout/)
  })

  it('throws when the body carries no candles', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ error: [], result: {} }) })
    await expect(fetchKrakenCandles(KRAKEN_INTERVAL.DAY)).rejects.toThrow(/no candles/)
  })
})
