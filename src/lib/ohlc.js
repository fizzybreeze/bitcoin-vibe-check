// Kraken OHLC — chart and 200-day-MA candle data.
//
// This replaced Binance, which geo-blocks US IP addresses. US visitors got no
// price chart, no 200-day moving average and no Mayer Multiple, because every
// Binance request failed with HTTP 451. Kraken serves the US, and the app
// already depends on Kraken for the live price ticker.
//
// Kraken candle shape (differs from Binance in three ways that matter):
//   [ time_seconds, open, high, low, close, vwap, volume_base, count ]
//     index 0 is SECONDS, not milliseconds
//     index 4 is close — the same index Binance used, so calc200DMA is unchanged
//     index 6 is volume in BTC, not USD; multiply by vwap (index 5) for USD

// Kraken accepts only this fixed set of interval values, in minutes.
export const KRAKEN_INTERVAL = { HOUR: 60, FOUR_HOUR: 240, DAY: 1440 }

// Kraken returns at most 720 candles per request, which covers every range the
// dashboard asks for — the largest is 1Y at 365 daily candles.
export const KRAKEN_MAX_CANDLES = 720

/**
 * Interval and candle count for a chart range, mirroring the previous Binance
 * behaviour exactly so the chart looks identical.
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
 * Kraken replies { error: [...], result: { XXBTZUSD: [[...]], last: 123 } }.
 * The result key is the canonical pair name, which is not the name you asked
 * for (XBTUSD becomes XXBTZUSD), so find the first array-valued key rather than
 * hardcoding it. A non-empty `error` array means the request failed even though
 * the HTTP status was 200.
 */
export function extractKrakenOhlc(json) {
  if (!json || typeof json !== 'object') return null
  if (Array.isArray(json.error) && json.error.length > 0) {
    throw new Error(`Kraken: ${json.error.join(', ')}`)
  }
  const result = json.result
  if (!result || typeof result !== 'object') return null
  for (const [key, value] of Object.entries(result)) {
    if (key !== 'last' && Array.isArray(value)) return value
  }
  return null
}

/** USD volume for a candle: base volume × vwap, falling back to close. */
function quoteVolume(candle) {
  const base = parseFloat(candle[6])
  if (!Number.isFinite(base)) return 0
  const vwap = parseFloat(candle[5])
  const price = Number.isFinite(vwap) && vwap > 0 ? vwap : parseFloat(candle[4])
  return Number.isFinite(price) ? base * price : 0
}

/**
 * Shape Kraken candles into the chart's { date, price, volume } points.
 * Takes the most recent `count` candles, since Kraken has no limit parameter.
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

  // 7D fetches 4-hourly candles but renders one bar per day, so bucket by date:
  // sum the volumes and keep the last close of each day.
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
