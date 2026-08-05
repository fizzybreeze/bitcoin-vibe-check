// Daily OHLC helpers for the snapshot job.
//
// The Kraken primitives moved to src/lib/ohlc.js when the browser app hit the
// same Binance geo-block (#10) and needed them too. This module stays as the
// snapshot job's entry point so scripts/snapshot.js is unchanged, and keeps the
// two behaviours that are specific to persisting a historical record.

import {
  KRAKEN_INTERVAL,
  krakenOhlcUrl,
  extractKrakenOhlc as extractOrThrow,
} from '../../src/lib/ohlc.js'

export const KRAKEN_OHLC_URL = krakenOhlcUrl(KRAKEN_INTERVAL.DAY)

const MA_WINDOW = 200

/**
 * Pull the candle array out of a Kraken OHLC response, or null.
 *
 * The shared helper throws when Kraken reports an error, because the browser
 * chart wants that to reach its retry-and-error path. This job is different: it
 * already treats every source as best-effort via safeFetch, and a null here
 * simply leaves the MA fields empty for the day. So the throw is absorbed.
 */
export function extractKrakenOhlc(raw) {
  try {
    return extractOrThrow(raw)
  } catch {
    return null
  }
}

/**
 * Mean close over the trailing 200 candles.
 *
 * Unlike the browser-side chart, this refuses to compute from a short series.
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
