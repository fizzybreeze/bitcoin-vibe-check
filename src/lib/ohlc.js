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
