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
 *
 * **The 24h change is per currency, and that is a fix rather than a
 * generalisation.** This function used to pick `change_pct` off `BTC/USD`
 * whatever the reader had selected, so a GBP visitor read the dollar pair's
 * day under a sterling price — the two differing by that day's GBP/USD move,
 * with nothing on screen to say so. It is the same defect v1.14.0 fixed one
 * card over, where the chart's heading followed the selector while its axis
 * stayed in dollars, and it costs nothing to close: every pair the header
 * offers is already subscribed on this socket and every frame already carries
 * its own `change_pct`.
 *
 * `symbolMap` therefore names both fields a symbol writes. One entry per
 * symbol rather than a price map beside a change map, because two maps that
 * have to list the same five symbols are two maps that can come to list
 * different ones.
 */
export function krakenTickerUpdates(msg, symbolMap) {
  if (msg?.channel !== 'ticker' || !Array.isArray(msg.data) || !msg.data.length) return null

  const updates = {}
  for (const ticker of msg.data) {
    const fields = symbolMap?.[ticker?.symbol]
    if (!fields) continue
    const last = positive(Math.round(Number(ticker?.last)))
    if (last != null) updates[fields.price] = last
    const change = finite(ticker?.change_pct)
    if (change != null) updates[fields.change] = change
  }

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
    // Per currency, and only the dollar one has a source here: CoinPaprika is
    // asked for `quotes.USD` and answers one market, so `percent_change_24h`
    // is the dollar figure and nothing in this burst knows what sterling did.
    //
    // The other four are therefore blank until the Kraken socket lands, about
    // a second later, and blank is the deliberate answer rather than the
    // absence of one. Spreading the dollar figure across all five is what this
    // change exists to stop — it reads as the selected currency's day and is
    // not — and the two candidates for a stand-in are no better: Kraken's REST
    // ticker carries `o`, which makes the figure "since UTC midnight", and its
    // daily candles make it "since yesterday's close". Both are a different
    // measurement wearing this one's label, which is the same call the volume
    // above makes for the same reason.
    //
    // The cost is real and worth stating: a visitor on a non-USD currency
    // whose socket never connects sees no 24h change at all, where they
    // previously saw the dollar one. That is a gap in place of a wrong number.
    priceChange24hUsd: paprika.percent_change_24h ?? null,
    priceChange24hGbp: null,
    priceChange24hEur: null,
    priceChange24hCad: null,
    priceChange24hChf: null,
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
