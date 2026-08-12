// Which candles the price chart draws, in which currency, and what happens when
// the currency the reader picked has no market behind it.
//
// The chart was USD-only, and the defect that ended that was a labelling one:
// the card's heading read `Price · {currency}` off the header's selector while
// the y-axis, the high/low reference lines and the tooltip stayed hard-coded to
// dollars — with a `Chart in USD` caption sitting directly underneath
// contradicting the heading. Picking GBP relabelled a dollar chart rather than
// redrawing it, which is the one failure a price chart cannot take back: every
// number on it was wrong by an FX rate and nothing on screen said so.
//
// Kraken quotes XBT against all five currencies the header offers, so the fix is
// to fetch the pair the reader asked for. Converting the USD series by a spot
// rate was the cheaper option and is not an option: it would redraw a year of
// history at today's rate, which is a fabricated series in exactly the shape of
// a true one.
//
// **The answer carries the currency it is actually in, not the one that was
// requested.** Everything the card renders reads that field — heading, axis
// symbol, reference-line labels, tooltip — so a fallback cannot present itself
// as the thing it stood in for. Same rule `api/chain-data.js` follows when it
// serves a snapshot MVRV in place of a live one.
//
// **The fallback is deliberately narrow.** Only a missing market falls back;
// everything else throws, into the chart's existing error-and-retry path. A
// blanket `catch` here would answer a dropped packet by silently moving the
// reader to dollars for the rest of the session, since the result is cached —
// and a reader who never saw the failure has no reason to press Refresh.

import {
  krakenParamsForDays, krakenPairForCurrency, isUnsupportedPairError,
  fetchKrakenCandles, parseKrakenOhlc,
} from './ohlc.js'

/** The currency every other one falls back to, and the only one guaranteed a market. */
export const FALLBACK_CURRENCY = 'usd'

/**
 * Candles for a range, in a currency, as `{ points, currency }`.
 *
 * `currency` on the way out is what the points are actually denominated in,
 * which is the requested currency unless Kraken has no market for it.
 *
 * Throws on transport failure, on a Kraken-reported error other than an unknown
 * pair, and on the request timing out. The caller's retry path wants the throw.
 */
export async function fetchChartSeries(days, currency) {
  const { interval, count } = krakenParamsForDays(days)

  const draw = async (served) => ({
    points: parseKrakenOhlc(await fetchKrakenCandles(interval, krakenPairForCurrency(served)), days, count),
    currency: served,
  })

  const wanted = String(currency ?? '').toLowerCase()
  // An unknown currency is a caller bug rather than a missing market, but it
  // arrives here the same way a missing one would and gets the same honest
  // answer: dollar candles, labelled as dollars.
  if (!krakenPairForCurrency(wanted) || wanted === FALLBACK_CURRENCY) return draw(FALLBACK_CURRENCY)

  try {
    return await draw(wanted)
  } catch (err) {
    if (!isUnsupportedPairError(err)) throw err
    return draw(FALLBACK_CURRENCY)
  }
}
