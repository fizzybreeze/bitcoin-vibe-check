// Kraken OHLC — shared by the browser chart and the snapshot job.
//
// Binance answers US jurisdictions with HTTP 451. The snapshot job hit this
// first (#9) because Actions runners are US-hosted; the browser app hit it too,
// because `fetchChart` runs client-side from each visitor's own IP — so US
// visitors saw no price chart, no 200-day MA and no Mayer Multiple (#10).
// Kraken serves the US, needs no key, and is already trusted here for the live
// price ticker.
//
// Kraken candle shape, and the three ways it differs from a Binance kline:
//   [ time_seconds, open, high, low, close, vwap, volume_base, count ]
//     index 0 is SECONDS, not milliseconds
//     index 4 is close — the same index Binance used, so calc200DMA is unchanged
//     index 6 is volume in BTC. Binance's chart volume came from index 7, which
//       is quote (USD) volume — so this needs converting, not just re-indexing.

// Kraken accepts only a fixed set of interval values, in minutes.
export const KRAKEN_INTERVAL = { HOUR: 60, FOUR_HOUR: 240, DAY: 1440 }

// Kraken returns at most this many candles and has no `limit` parameter, so
// callers slice client-side. The largest range needed is 1Y at 365 daily
// candles, which fits comfortably.
export const KRAKEN_MAX_CANDLES = 720

/**
 * Interval and candle count for a chart range, mirroring the previous Binance
 * mapping exactly so the chart looks unchanged.
 */
export function krakenParamsForDays(days) {
  if (days === 1)  return { interval: KRAKEN_INTERVAL.HOUR,      count: 24  }
  if (days === 7)  return { interval: KRAKEN_INTERVAL.FOUR_HOUR, count: 42  }
  if (days === 30) return { interval: KRAKEN_INTERVAL.DAY,       count: 30  }
  return { interval: KRAKEN_INTERVAL.DAY, count: 365 }
}

export function krakenOhlcUrl(interval, pair = 'XBTUSD') {
  return `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`
}

/**
 * Pull the candle array out of Kraken's response envelope.
 *
 * The key in `result` is the canonical pair name, not the one requested —
 * asking for XBTUSD returns XXBTZUSD — so the series is found by shape rather
 * than by name. `last` is a cursor, not a series.
 *
 * Throws when Kraken reports an error. Kraken returns those inside a 200
 * response, so a plain `res.ok` check sails straight past a failed request;
 * throwing lets the chart's existing error-and-retry path handle it. Callers
 * that prefer a null (the snapshot job) wrap this.
 *
 * Returns null for an unrecognised body, which is absence of data rather than
 * a reported failure.
 */
export function extractKrakenOhlc(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (Array.isArray(raw.error) && raw.error.length > 0) {
    throw new Error(`Kraken: ${raw.error.join(', ')}`)
  }

  const result = raw.result
  if (!result || typeof result !== 'object') return null

  const series = Object.entries(result)
    .find(([key, value]) => key !== 'last' && Array.isArray(value))

  return series ? series[1] : null
}

// Requests currently in flight, keyed by URL (#24).
//
// Binance took a `limit` parameter, so every caller produced a distinct URL.
// Kraken has none — the app slices client-side — so the 1M chart, the 1Y chart
// and the 200-day MA series all resolve to the same `interval=1440` URL. This
// collapses the ones that overlap in time into a single network call.
//
// Deliberately in-flight only, not a response cache: an entry lives exactly as
// long as its request does. A caller arriving after the previous one settled
// refetches, which is what keeps the 6-hourly 200-day refresh and every chart
// retry actually fetching rather than replaying a stale body.
const inFlight = new Map()

/** Test seam: no test should be able to pass because a previous one left state. */
export function _resetInFlight() {
  inFlight.clear()
}

// A request that never settles would otherwise pin its URL in `inFlight` for
// the lifetime of the page — and because the entry is now *shared*, one stalled
// request would take the 1M chart, the 1Y chart and the 6-hourly 200-day
// refresh down with it, permanently. Browsers apply no default `fetch` timeout,
// and a TCP blackhole across a mobile network handoff is exactly the case this
// app has to survive, so the deadline is ours to set.
//
// Generous against a slow handset connection — Kraken normally answers in well
// under a second — and short enough that the chart's own retry, five seconds
// after the failure it surfaces, is still a recovery rather than a formality.
export const KRAKEN_FETCH_TIMEOUT_MS = 15_000

/**
 * Fetch Kraken candles for an interval, sharing a request already in flight for
 * the same URL.
 *
 * Throws on transport failure, on a Kraken-reported error (which arrives inside
 * a 200, so `res.ok` sails past it), on a body with no candles, and on the
 * request outlasting `KRAKEN_FETCH_TIMEOUT_MS`. The chart's retry path and the
 * 200-day effect's error state both want the throw — a hang gives them neither,
 * which is why the timeout exists at all.
 *
 * The resolved array is *shared* between concurrent callers, so consumers must
 * treat it as read-only. Both do — `parseKrakenOhlc` and the 200-day effect
 * slice, which copies.
 */
export function fetchKrakenCandles(interval, pair = 'XBTUSD') {
  const url = krakenOhlcUrl(interval, pair)

  const existing = inFlight.get(url)
  if (existing) return existing

  const request = (async () => {
    // An explicit controller rather than `AbortSignal.timeout`, for two
    // reasons: the timer is cleared on success, so a completed request does not
    // leave one pending for the rest of the window; and it is an ordinary
    // `setTimeout`, which means the timeout is exercisable under fake timers
    // instead of only by waiting fifteen seconds.
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, KRAKEN_FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`Kraken OHLC: HTTP ${res.status}`)
      const candles = extractKrakenOhlc(await res.json())
      if (!candles) throw new Error('Kraken OHLC: no candles in response')
      return candles
    } catch (err) {
      // An abort surfaces as a bare "operation was aborted"; say what actually
      // happened, since this is the one failure with no server response to
      // quote back.
      throw timedOut ? new Error(`Kraken OHLC: no response within ${KRAKEN_FETCH_TIMEOUT_MS}ms`) : err
    } finally {
      clearTimeout(timer)
    }
  })()

  inFlight.set(url, request)

  // `then(clear, clear)` rather than `.finally(clear)`: finally re-throws, so
  // the derived promise would reject with nothing awaiting it and every failed
  // fetch would raise an unhandled rejection — in the degraded path, where the
  // console is the only thing left to read. This form settles fulfilled.
  const clear = () => { inFlight.delete(url) }
  request.then(clear, clear)

  return request
}

/**
 * USD volume for a candle: base volume × vwap.
 *
 * Binance's chart read index 7 (quote volume, already USD). Kraken has no quote
 * column, so returning index 6 directly would silently swap USD bars for BTC
 * bars — a difference of roughly the price of Bitcoin, on a chart that would
 * still render perfectly.
 */
function quoteVolume(candle) {
  const base = parseFloat(candle[6])
  if (!Number.isFinite(base)) return 0
  const vwap = parseFloat(candle[5])
  // vwap is 0 on a candle with no trades; fall back to close.
  const price = Number.isFinite(vwap) && vwap > 0 ? vwap : parseFloat(candle[4])
  return Number.isFinite(price) ? base * price : 0
}

/**
 * Shape Kraken candles into the chart's { date, price, volume } points, taking
 * the most recent `count` since Kraken cannot bound the response itself.
 */
export function parseKrakenOhlc(candles, days, count) {
  if (!candles?.length) return null
  const recent = count != null ? candles.slice(-count) : candles

  if (days === 1) {
    return recent.map(c => ({
      date: new Date(c[0] * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      price: Math.round(parseFloat(c[4])),
      volume: quoteVolume(c),
    }))
  }

  // 7D fetches 4-hourly candles but renders one bar per day: sum the volumes
  // and keep the last close of each day.
  if (days === 7) {
    const groups = {}
    for (const c of recent) {
      const date = new Date(c[0] * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      groups[date] = {
        date,
        price: Math.round(parseFloat(c[4])),
        volume: (groups[date]?.volume ?? 0) + quoteVolume(c),
      }
    }
    return Object.values(groups)
  }

  return recent.map(c => ({
    date: new Date(c[0] * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    price: Math.round(parseFloat(c[4])),
    volume: quoteVolume(c),
  }))
}
