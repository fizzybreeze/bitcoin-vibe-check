import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  KRAKEN_INTERVAL, KRAKEN_MAX_CANDLES,
  krakenParamsForDays, krakenOhlcUrl, extractKrakenOhlc, parseKrakenOhlc,
  fetchKrakenCandles, _resetInFlight, KRAKEN_FETCH_TIMEOUT_MS,
  KRAKEN_PAIR_BY_CURRENCY, krakenPairForCurrency, isUnsupportedPairError,
} from '../ohlc.js'
import { CURRENCY_META } from '../../utils.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

  it('carries whichever pair it was given', () => {
    expect(krakenOhlcUrl(KRAKEN_INTERVAL.DAY, 'XBTGBP')).toContain('pair=XBTGBP')
  })
})

describe('krakenPairForCurrency', () => {
  it('covers every currency the header offers', () => {
    // Derived from CURRENCY_META rather than restated, so a sixth currency added
    // to the selector fails here instead of silently drawing a dollar chart
    // under its name. That claim only holds because `App` builds the selector's
    // options from `CURRENCY_META` too — it was a third hard-coded copy of this
    // list until the review found it, and this test was green either way.
    for (const currency of Object.keys(CURRENCY_META)) {
      expect(krakenPairForCurrency(currency), currency).toBeTruthy()
    }
    expect(Object.keys(KRAKEN_PAIR_BY_CURRENCY).sort()).toEqual(Object.keys(CURRENCY_META).sort())
  })

  it('is the list the header actually renders', () => {
    // Read out of App's source, because the selector is JSX in a file with no
    // unit test — and a literal array there is exactly how the three lists came
    // apart in the first place.
    const app = readFileSync(resolve('src/App.jsx'), 'utf8')
    expect(app).toContain('{Object.keys(CURRENCY_META).map(c => (')
    expect(app).not.toMatch(/\[\s*'usd'\s*,\s*'gbp'/)
  })

  it('answers null for a currency with no market, rather than defaulting to dollars', () => {
    // A quiet default here is the bug this replaced: USD candles under another
    // currency's label. The caller has to name the fallback, which is what lets
    // it say so on screen.
    expect(krakenPairForCurrency('jpy')).toBeNull()
    expect(krakenPairForCurrency(undefined)).toBeNull()
    expect(krakenPairForCurrency('')).toBeNull()
  })

  it('does not care how the currency is cased', () => {
    expect(krakenPairForCurrency('GBP')).toBe('XBTGBP')
  })
})

describe('isUnsupportedPairError', () => {
  it('recognises the error Kraken really sends for a pair that does not exist', () => {
    // Composed the way the app composes it — Kraken reports this inside a 200,
    // so it arrives via extractKrakenOhlc rather than as an HTTP status.
    let thrown
    try { extractKrakenOhlc({ error: ['EQuery:Unknown asset pair'], result: {} }) } catch (err) { thrown = err }
    expect(isUnsupportedPairError(thrown)).toBe(true)
  })

  it('does not mistake a bad minute for a missing market', () => {
    // The distinction the fallback rests on: these must retry, not silently
    // redraw the chart in dollars.
    expect(isUnsupportedPairError(new Error('Kraken OHLC: HTTP 502'))).toBe(false)
    expect(isUnsupportedPairError(new Error('Kraken: EGeneral:Temporary lockout'))).toBe(false)
    expect(isUnsupportedPairError(new Error(`Kraken OHLC: no response within ${KRAKEN_FETCH_TIMEOUT_MS}ms`))).toBe(false)
    expect(isUnsupportedPairError(undefined)).toBe(false)
  })

  it('cannot be satisfied by a message alone', () => {
    // It reads a tag set where the condition is known, not the text. The first
    // version matched `'no candles in response'`, which is what this module
    // throws for *any* unreadable body — so an unrecognised 200 for a pair that
    // exists would have been reported to the reader as a missing market.
    expect(isUnsupportedPairError(new Error('Kraken: EQuery:Unknown asset pair'))).toBe(false)
    expect(isUnsupportedPairError(new Error('Kraken OHLC: no candles in response'))).toBe(false)
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

  it('stamps each point with the instant its candle stops forming', () => {
    // The whole reason this field exists: `patchSeriesTail` may only overwrite
    // a close that is still being written, and without the candle's own window
    // it would have to guess — which is how a live price ends up drawn against
    // an earlier label.
    const out = parseKrakenOhlc([candle(DAY_S, 42_000)], 30, 1)
    expect(out[0].until).toBe((DAY_S + DAY_S) * 1000)
  })

  it('derives that window from the range\'s own interval', () => {
    // Hourly candles at 1D, daily at 1M/1Y — a fixed span here would keep the
    // 1D chart patchable for a day, which is 23 hours of fabrication.
    const hourly = parseKrakenOhlc([candle(HOUR_S, 42_000)], 1, 1)
    expect(hourly[0].until).toBe((HOUR_S + HOUR_S) * 1000)

    const yearly = parseKrakenOhlc([candle(DAY_S, 42_000)], 365, 1)
    expect(yearly[0].until).toBe((DAY_S + DAY_S) * 1000)
  })

  it('gives a 7D group the window of the candle whose close it kept', () => {
    // The group's price is one 4-hourly close, so it stops being live when that
    // candle closes — not at the end of the calendar day it is labelled with.
    // The conservative reading on purpose: refusing to patch is never wrong.
    const day = 10 * DAY_S
    const out = parseKrakenOhlc([
      candle(day, 41_000),
      candle(day + 4 * HOUR_S, 42_000),
    ], 7, 42)
    expect(out).toHaveLength(1)
    expect(out[0].price).toBe(42_000)
    expect(out[0].until).toBe((day + 4 * HOUR_S + 4 * HOUR_S) * 1000)
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

  it('throws a retryable error for a body it cannot read', async () => {
    // Not a missing market: this module could not find a series, which is a
    // statement about the response rather than about Kraken's listings. Tagging
    // it would send the chart silently to dollars for the session.
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ error: [], result: {} }) })
    const err = await fetchKrakenCandles(KRAKEN_INTERVAL.DAY).catch(e => e)
    expect(err.message).toMatch(/unrecognised response body/)
    expect(isUnsupportedPairError(err)).toBe(false)
  })

  it('throws a missing-market error for a listed pair with an empty series', async () => {
    // The shape that shipped broken: an empty array is truthy, so nothing threw,
    // the caller resolved with null points, and the chart drew an empty plot
    // area under the selected currency with no error and no fallback.
    fetch.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ error: [], result: { XBTCHF: [], last: 1 } }),
    })
    const err = await fetchKrakenCandles(KRAKEN_INTERVAL.DAY, 'XBTCHF').catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect(isUnsupportedPairError(err)).toBe(true)
  })

  it('tags Kraken’s own unknown-pair error', async () => {
    fetch.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ error: ['EQuery:Unknown asset pair'], result: {} }),
    })
    const err = await fetchKrakenCandles(KRAKEN_INTERVAL.DAY, 'XBTZZZ').catch(e => e)
    expect(isUnsupportedPairError(err)).toBe(true)
  })

  it('leaves every other Kraken error retryable', async () => {
    fetch.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ error: ['EGeneral:Temporary lockout'], result: {} }),
    })
    const err = await fetchKrakenCandles(KRAKEN_INTERVAL.DAY, 'XBTGBP').catch(e => e)
    expect(isUnsupportedPairError(err)).toBe(false)
  })
})
