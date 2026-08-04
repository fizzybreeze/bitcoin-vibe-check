// Daily OHLC helpers for the snapshot job.
//
// The job used to read Binance klines, the same source the browser app uses.
// That works in a browser but not from GitHub Actions: Binance answers US
// jurisdictions with HTTP 451, and Actions runners are US-hosted, so the 200-day
// MA and Mayer Multiple were null on every single run. Kraken is already a
// trusted source in this project, needs no key, and does not geo-block
// datacentres.
//
// Kraken OHLC response shape:
//   { error: [], result: { XXBTZUSD: [[time, o, h, l, c, vwap, vol, count], …],
//                          last: 1688669400 } }
// Close sits at index 4, the same position as in a Binance kline, so the mean
// below is unchanged from the original.

export const KRAKEN_OHLC_URL =
  'https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440'

const MA_WINDOW = 200

/**
 * Pull the candle array out of a Kraken OHLC response.
 *
 * The pair key in `result` is not the one requested — asking for `XBTUSD`
 * returns `XXBTZUSD` — so the series is found by shape rather than by name.
 * Returns null on an error response or an unrecognised body.
 */
export function extractKrakenOhlc(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (Array.isArray(raw.error) && raw.error.length > 0) return null

  const result = raw.result
  if (!result || typeof result !== 'object') return null

  // `last` is a cursor, not a series; everything else is the candle array.
  const series = Object.entries(result)
    .find(([key, value]) => key !== 'last' && Array.isArray(value))

  return series ? series[1] : null
}

/**
 * Mean close over the trailing 200 candles.
 *
 * Unlike the browser-side copy, this refuses to compute from a short series.
 * These values are persisted as a historical record, and averaging 40 candles
 * into a column called "200-day MA" would put a plausible-looking wrong number
 * into the series permanently.
 */
export function calc200DMA(candles) {
  if (!Array.isArray(candles) || candles.length < MA_WINDOW) return null

  const closes = candles
    .slice(-MA_WINDOW)
    .map(c => parseFloat(c?.[4]))

  if (closes.some(v => !Number.isFinite(v))) return null

  return closes.reduce((sum, v) => sum + v, 0) / closes.length
}

export function calcMayerMultiple(price, ma200) {
  if (price == null || ma200 == null || ma200 === 0) return null
  return price / ma200
}
