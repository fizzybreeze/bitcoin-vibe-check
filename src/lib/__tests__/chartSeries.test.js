// What the price chart fetches, and what it does when the reader picks a
// currency Kraken has no market for.
//
// These deliberately go through the *real* `fetchKrakenCandles` with `fetch`
// stubbed, rather than injecting a fake fetcher. `isUnsupportedPairError`
// matches on the message `extractKrakenOhlc` composes out of Kraken's own error
// array, so a test that threw `new Error('Unknown asset pair')` by hand would
// prove the predicate matches a string this test wrote — not that Kraken's real
// envelope reaches it. Every failure below is expressed as a response body.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchChartSeries, FALLBACK_CURRENCY } from '../chartSeries.js'
import { _resetInFlight } from '../ohlc.js'

// [ time, open, high, low, close, vwap, volume, count ]
const candle = (t, close) => [t, '1', '1', '1', String(close), String(close), '2', 5]
const ok = candles => ({ error: [], result: { XXBTZUSD: candles, last: 1 } })

// Kraken's real shape for a pair that does not exist: HTTP 200, error array.
const unknownPair = { error: ['EQuery:Unknown asset pair'], result: {} }
// A pair that exists but has never traded — 200, no error, no series.
const noCandles = { error: [], result: { last: 1 } }

/** Route by the `pair` query parameter, so a test can answer each pair differently. */
function routeByPair(bodies) {
  return vi.fn(async url => {
    const pair = new URL(url).searchParams.get('pair')
    const body = bodies[pair]
    if (body === undefined) throw new Error(`unrouted pair: ${pair}`)
    if (body instanceof Error) throw body
    return { ok: true, status: 200, json: async () => body }
  })
}

const CANDLES = [candle(1, 100), candle(2, 200), candle(3, 300)]

beforeEach(() => { _resetInFlight() })
afterEach(() => { vi.unstubAllGlobals() })

describe('fetchChartSeries', () => {
  it('asks Kraken for the pair the reader selected', async () => {
    const fetchMock = routeByPair({ XBTGBP: ok(CANDLES) })
    vi.stubGlobal('fetch', fetchMock)

    const series = await fetchChartSeries(30, 'gbp')

    expect(fetchMock.mock.calls[0][0]).toContain('pair=XBTGBP')
    expect(series.points).toHaveLength(3)
  })

  it('reports the currency the candles are actually in', async () => {
    // The whole contract. Every mark the card draws reads this field, so a
    // series that answered with the *requested* currency would relabel a dollar
    // chart — which is the defect this replaced.
    vi.stubGlobal('fetch', routeByPair({ XBTEUR: ok(CANDLES) }))
    await expect(fetchChartSeries(30, 'eur')).resolves.toMatchObject({ currency: 'eur' })
  })

  it('uses the dollar pair for USD', async () => {
    const fetchMock = routeByPair({ XBTUSD: ok(CANDLES) })
    vi.stubGlobal('fetch', fetchMock)

    const series = await fetchChartSeries(30, 'usd')

    expect(fetchMock.mock.calls[0][0]).toContain('pair=XBTUSD')
    expect(series.currency).toBe('usd')
    // And exactly one request: the USD path must not speculatively try anything
    // else, since it is the one every reader gets by default.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to USD candles when Kraken has no market for the currency', async () => {
    vi.stubGlobal('fetch', routeByPair({ XBTCHF: unknownPair, XBTUSD: ok(CANDLES) }))

    const series = await fetchChartSeries(30, 'chf')

    expect(series.currency).toBe(FALLBACK_CURRENCY)
    expect(series.points).toHaveLength(3)
  })

  it('treats a market with no candles as one that cannot be drawn', async () => {
    // A pair Kraken lists but nobody has traded returns a 200 with no series.
    // There is nothing to plot, so it falls back rather than erroring.
    vi.stubGlobal('fetch', routeByPair({ XBTCAD: noCandles, XBTUSD: ok(CANDLES) }))
    await expect(fetchChartSeries(30, 'cad')).resolves.toMatchObject({ currency: 'usd' })
  })

  it('throws on a transport failure rather than quietly moving the reader to dollars', async () => {
    // The rule that makes the fallback narrow. A dropped packet is what the
    // chart's retry path is for; falling back here would swap the currency for
    // the rest of the session — the result is cached — over a bad minute, and
    // the reader never saw a failure to press Refresh about.
    const fetchMock = routeByPair({ XBTGBP: new Error('network down'), XBTUSD: ok(CANDLES) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchChartSeries(30, 'gbp')).rejects.toThrow(/network down/)
    expect(fetchMock.mock.calls.map(c => new URL(c[0]).searchParams.get('pair'))).toEqual(['XBTGBP'])
  })

  it('throws on a Kraken error that is not a missing market', async () => {
    vi.stubGlobal('fetch', routeByPair({
      XBTGBP: { error: ['EGeneral:Temporary lockout'], result: {} },
      XBTUSD: ok(CANDLES),
    }))
    await expect(fetchChartSeries(30, 'gbp')).rejects.toThrow(/Temporary lockout/)
  })

  it('answers an unknown currency with dollars, labelled as dollars', async () => {
    const fetchMock = routeByPair({ XBTUSD: ok(CANDLES) })
    vi.stubGlobal('fetch', fetchMock)

    const series = await fetchChartSeries(30, 'jpy')

    expect(series.currency).toBe('usd')
    // Straight to the fallback: there is no XBTJPY request to make when the
    // currency was never in the map.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('pair=XBTUSD')
  })

  it('shapes the candles for the range it was asked for', async () => {
    // 1D renders hourly points; the daily ranges render dates. Getting this
    // wrong per currency would be invisible in the currency assertions above.
    vi.stubGlobal('fetch', routeByPair({ XBTGBP: ok(CANDLES) }))
    const { points } = await fetchChartSeries(1, 'gbp')
    expect(points[0].date).toMatch(/^\d{2}:\d{2}$/)
  })
})
