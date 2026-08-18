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
 * Candles for a range, in a currency, as `{ points, currency, requested }`.
 *
 * `currency` is what the points are actually denominated in; `requested` is what
 * was asked for. They differ only on a fallback, and **both travel with the
 * points** rather than one of them being read off the live selector at render
 * time — otherwise the moment between the selector changing and the new series
 * landing is a frame in which the old chart is compared against the new currency
 * and reported as a fallback that never happened.
 *
 * Throws on transport failure, on a Kraken-reported error other than an unknown
 * pair, and on the request timing out. The caller's retry path wants the throw.
 */
export async function fetchChartSeries(days, currency) {
  const { interval, count } = krakenParamsForDays(days)
  const wanted = String(currency ?? '').toLowerCase()

  const draw = async (served) => ({
    points: parseKrakenOhlc(await fetchKrakenCandles(interval, krakenPairForCurrency(served)), days, count),
    currency: served,
    requested: wanted,
  })

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

/**
 * The drawn series, with its final point's close kept live from the socket.
 *
 * **Why this is free.** Kraken's last candle is the bucket currently being
 * written, so its close is not a historical figure at all — it is the last
 * trade, and the socket is already streaming that. Replacing it costs no
 * request and no fetch; the chart simply stops being frozen at whatever
 * instant it happened to be fetched.
 *
 * **Why it is bounded, which is the part worth reading before extending it.**
 * The overwrite is legal only while that bucket is still open. A tab left
 * sitting past the hour has a series whose last point is a *closed* candle, and
 * writing the current price into it would draw a later price against an earlier
 * label — a fabricated point wearing the shape of a true one, which is the one
 * failure a price chart cannot take back and the reason v1.14.0 refused to
 * convert a dollar series by spot FX. So past `until` this returns the series
 * untouched and the chart goes back to being honestly stale. Fixing *that* half
 * means refetching the candles, which is a different mechanism with its own
 * cost, and it is deliberately not done here.
 *
 * **It never mutates.** The array it is given is the one held in `chartCache`
 * and re-served on every range toggle, so writing through would compound a
 * patch into stored data and hand back a series that is no longer what Kraken
 * said. A new array with a new final object is the whole of the safety.
 *
 * `price` must be denominated in the series' own currency — `series.currency`,
 * never the header's selection, which differ whenever a fallback happened.
 */
export function patchSeriesTail(points, price, nowMs) {
  if (!Array.isArray(points) || points.length === 0) return points
  // Same screen as the socket applies before a price reaches state: zero is a
  // broken frame rather than a reading, and a non-finite one renders as NaN.
  if (!Number.isFinite(price) || price <= 0) return points

  const last = points[points.length - 1]
  // No `until` means a point this module did not shape — refuse rather than
  // guess, since the guess is the fabrication above.
  if (!Number.isFinite(last?.until) || nowMs >= last.until) return points

  // Rounded to match every other point, which `parseKrakenOhlc` rounds too. It
  // also means an unchanged rounded price yields an equal value, which is what
  // lets the caller skip re-rendering the chart on a tick that would not move
  // a pixel.
  const rounded = Math.round(price)
  if (rounded === last.price) return points

  return [...points.slice(0, -1), { ...last, price: rounded }]
}
