// Raw upstream responses → the shape `App` puts in state.
//
// Extracted from `loadData` so that "what happens when a source has a bad
// morning" is a unit test rather than a thing you find out on the day.
// `Promise.allSettled` already means the page survives an outage; it does not
// mean the *cards* do, and the difference between those two is this module.
//
// Every source here is a single point of failure by construction — they are
// all keyless and free, which is the trade §1 makes deliberately. What can be
// done is to notice when one source's answer is already sitting in another
// source's response, which is the case for the one value the whole dashboard
// hangs on.

import { computeIssuedSupply } from './calculations.js'

/**
 * A BTC price from a Kraken ticker payload, by currency suffix.
 *
 * Matched with `endsWith` because Kraken's own asset codes are not the pair
 * names you asked for: `XBTUSD` comes back as `XXBTZUSD`, and the X/Z prefixes
 * differ per asset. The suffix is the stable part.
 */
export function krakenPrice(krakenResult, suffix) {
  if (!krakenResult || typeof krakenResult !== 'object') return null
  const key = Object.keys(krakenResult).find(k => k.endsWith(suffix))
  if (!key) return null
  const value = parseFloat(krakenResult[key]?.c?.[0])
  return Number.isFinite(value) && value > 0 ? value : null
}

function positive(value) {
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * A finite number, or `null` for anything that is not one.
 *
 * A second numeric predicate beside `positive`, which is normally a smell — two
 * predicates for one fact are two places to disagree. These are two different
 * facts: a price must be above zero, while a percentage change is legitimately
 * zero or negative and only has to be a number. Blank counts as absent, because
 * `Number('')` is `0` and a missing change would otherwise be published as "0%".
 */
function finite(value) {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * A Kraken WebSocket ticker frame → the fields it may overwrite in state, or
 * `null` when it has nothing usable to say.
 *
 * The socket is an upstream like any other, and it was the *only* one whose
 * values reached state unscreened: `if (ticker.last != null) updates[key] =
 * Math.round(ticker.last)` publishes a `last` of `0` as a price of 0 and a
 * non-numeric `last` as `NaN`. Both are worse than a dropped frame, because a
 * price already on screen is replaced by a broken one:
 *
 *   - `0` crashed the dashboard outright. `computeSatsPerFiat(0)` is `null`,
 *     `VolumeCard` dereferenced it, and there is no error boundary in this app,
 *     so the whole page went blank.
 *   - `0` would also fire every pending `below` alert at once, quoting
 *     "Now $0" — the exact hazard v1.7.1 recorded when it made `isValidValue`
 *     screen live readings as well as thresholds.
 *   - A non-numeric `change_pct` reaches `change.toFixed(2)` in `BtcPriceCard`,
 *     which throws on a string.
 *
 * The screen is applied to the value that is actually stored — after the
 * rounding, not before — so nothing can be admitted and then spoiled on its way
 * into state.
 */
export function krakenTickerUpdates(msg, symbolMap) {
  if (msg?.channel !== 'ticker' || !Array.isArray(msg.data) || !msg.data.length) return null

  const updates = {}
  for (const ticker of msg.data) {
    const key = symbolMap?.[ticker?.symbol]
    if (!key) continue
    const last = positive(Math.round(Number(ticker?.last)))
    if (last != null) updates[key] = last
  }

  const change = finite(msg.data.find(t => t?.symbol === 'BTC/USD')?.change_pct)
  if (change != null) updates.priceChange24h = change

  return Object.keys(updates).length ? updates : null
}

/**
 * Market cap from a price and a block height, or `null` if either is missing.
 *
 * v1.7.9 wrote this off — "price × issued supply is close but not the same as
 * circulating supply, and this is a headline figure people compare against
 * other sites" — and that was two objections wearing one coat. The accuracy
 * half does not survive checking: what every aggregator publishes as Bitcoin's
 * circulating supply *is* the mined supply, which is what `computeIssuedSupply`
 * sums. The two disagree only over coins that were never claimed — the handful
 * of underpaid coinbases, some 28 BTC in total — which is a rounding error
 * seven orders of magnitude below the figure and vanishes long before the one
 * decimal place `fmtVolume` prints.
 *
 * The comparability half was the real objection, and the answer to it is the
 * label rather than the blank: the card says `· est. from issued supply` when
 * this is what it is showing, on the v1.6.5 precedent, so a reader who does
 * compare it against another site can see why it might differ by a hair. A
 * derived figure that announces itself is strictly better than an empty slot,
 * which is the trade that decides this the other way round.
 */
export function estimateMarketCapUsd(priceUsd, blockHeight) {
  if (!positive(priceUsd)) return null
  // `Number.isFinite` rather than a null check: mempool.space answers this
  // endpoint with a bare integer, so a failed parse or an HTML error page
  // arrives as a string or an object rather than as null — and
  // `computeIssuedSupply` would happily do arithmetic on either.
  if (!Number.isFinite(blockHeight) || blockHeight < 0) return null
  const supply = computeIssuedSupply(blockHeight)
  // `positive` is unreachable today and stays anyway: the guard above already
  // excludes the only input `computeIssuedSupply` returns null for, and the
  // genesis block alone is 50 BTC, so the sum is never zero. No test can pin
  // it — which is worth saying outright rather than leaving a reader to work
  // out why a mutation to it survives. What it buys is that a future change to
  // the epoch table degrades to a blank rather than to a headline "$0".
  return positive(supply) ? priceUsd * supply : null
}

/**
 * Merge every upstream answer into the dashboard's state shape.
 *
 * Each input is that source's parsed body, or `null` if the call failed. No
 * fetching happens here on purpose: the awkward cases are all about a body
 * that is missing, empty or half-formed, and those are cheap to write down and
 * expensive to reproduce against a live API.
 */
export function mergeMarketData({
  paprikaTicker = null,
  paprikaGlobal = null,
  krakenTicker = null,
  fng = null,
  fees = null,
  blockHeight = null,
  difficulty = null,
  mempool = null,
  blocks = null,
  lightning = null,
} = {}) {
  const paprika = paprikaTicker?.quotes?.USD ?? {}
  const krakenResult = krakenTicker?.result ?? {}

  // **The one fallback that matters.** `priceUsd` was read from CoinPaprika
  // alone, while the very same request burst fetched Kraken's XBTUSD ticker
  // and threw the USD price away — `krakenPrice` was called for GBP, EUR, CAD
  // and CHF and never for USD.
  //
  // That made CoinPaprika a single point of failure for far more than its own
  // card: the Mayer Multiple and so the Vibe Score's valuation dimension, the
  // ATH distance, sats per fiat, and all four fiat volume conversions below,
  // which divide by it. The fallback costs no request, because the response is
  // already in hand.
  //
  // `||` rather than `??`: a missing price parses to NaN and a zero price is
  // not a price, and both mean "ask Kraken" — the same reasoning recorded in
  // v1.6.5 and v1.6.6, pointing the other way for once.
  //
  // **Deliberately not labelled on the card**, which is the opposite of what
  // v1.6.5 decided for the MVRV fallback, so the difference is worth stating.
  // That one served a *stored* value from a previous day, and a stale number
  // presenting itself as live was the one way it could be worse than a blank.
  // This one is neither stale nor foreign: `App` streams `BTC/USD` from
  // Kraken's WebSocket into this very field seconds after load, so Kraken is
  // already the live source of the USD price on a healthy visit — CoinPaprika
  // only seeds it. Announcing the seed's provenance would be noise about a
  // number that was going to come from Kraken anyway.
  const priceUsd = positive(paprika.price) || krakenPrice(krakenResult, 'USD')

  const priceGbp = krakenPrice(krakenResult, 'GBP')
  const priceEur = krakenPrice(krakenResult, 'EUR')
  const priceCad = krakenPrice(krakenResult, 'CAD')
  const priceChf = krakenPrice(krakenResult, 'CHF')

  // Deliberately *not* falling back to Kraken's `v[1]`. That is the volume of
  // one pair on one exchange, and this figure is advertised as global — the
  // VolumeCard already carries a tooltip explaining that exact distinction for
  // the chart. Silently swapping in a number several times smaller would be a
  // wrong answer where a blank is an honest one.
  const volumeUsd = paprika.volume_24h ?? null

  const convertVolume = (price) =>
    (volumeUsd != null && priceUsd && price) ? volumeUsd * price / priceUsd : null

  const fngSeries = Array.isArray(fng?.data) ? fng.data : null

  // The second fallback, and the last one this burst can honestly support.
  // CoinPaprika's market cap is preferred whenever it answers; when it does
  // not, the two numbers this is made of come from sources that are already
  // here and are not each other — the price (CoinPaprika *or* Kraken, per the
  // fallback above) and mempool.space's chain tip. Two independent outages have
  // to coincide before the figure goes blank, which is a materially different
  // proposition from one.
  //
  // `positive()` rather than `??`, for the same reason as the price above: a
  // market cap of 0 is a broken body, not an answer.
  const paprikaMarketCap = positive(paprika.market_cap)
  const derivedMarketCap = paprikaMarketCap ? null : estimateMarketCapUsd(priceUsd, blockHeight)

  return {
    priceUsd,
    priceGbp,
    priceEur,
    priceCad,
    priceChf,
    volumeUsd,
    volumeGbp: convertVolume(priceGbp),
    volumeEur: convertVolume(priceEur),
    volumeCad: convertVolume(priceCad),
    volumeChf: convertVolume(priceChf),
    // No fallback. A 24h change derived from Kraken's daily candles would be
    // "since yesterday's close", not a rolling 24 hours — a different number
    // that would quietly disagree with the price beside it.
    priceChange24h: paprika.percent_change_24h ?? null,
    marketCapUsd: paprikaMarketCap ?? derivedMarketCap,
    // Travels with the value rather than being re-derived by whoever renders
    // it: the card has to say which of the two it is showing, and a consumer
    // that has to work that out for itself is a consumer that can get it wrong.
    marketCapEstimated: paprikaMarketCap == null && derivedMarketCap != null,
    fees,
    blockHeight,
    fng: fngSeries?.[0] ?? null,
    fngHistory: fngSeries?.length
      ? [...fngSeries].reverse().map(d => ({ v: parseInt(d.value, 10) }))
      : null,
    difficulty,
    // No fallback: nothing else this app fetches knows about altcoins at all.
    btcDominance: paprikaGlobal?.bitcoin_dominance_percentage ?? null,
    mempool,
    lastBlockTs: Array.isArray(blocks) && blocks.length ? (blocks[0].timestamp ?? null) : null,
    lightning,
    // No live fallback, but the least fragile of the lot in practice: the
    // localStorage cache in `App` merges non-null fields only, so a previously
    // seen all-time high survives an outage on any repeat visit.
    athUsd: positive(paprika.ath_price),
  }
}
