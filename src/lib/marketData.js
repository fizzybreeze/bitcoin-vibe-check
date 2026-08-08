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
    // No fallback. Price × issued supply is close but not the same as
    // circulating supply, and this is a headline figure people compare against
    // other sites.
    marketCapUsd: paprika.market_cap ?? null,
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
