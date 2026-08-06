// Vercel serverless function — the live link preview.
//
// Every paste of the URL into a Signal group, a Slack channel or a post asks
// somebody else's server for this image. It used to be `/og-image.png`, a static
// file that said the same thing whether BTC was at 40k or at an all-time high.
// This renders the current price, the Vibe Score and Fear & Greed instead.
//
// Three constraints shape the code below:
//
//   1. **It must never return nothing.** Link unfurlers do not retry, and a
//      failed image is a preview with a blank rectangle in it. Every failure
//      path — including the renderer itself failing to load — redirects to the
//      static `/og-image.png` that was here before.
//   2. **It is an unauthenticated compute endpoint** and anyone can hammer it.
//      The edge cache is the whole defence: `s-maxage` means a burst of unfurls
//      costs one render, and `stale-while-revalidate` means the slow path is
//      almost never on the critical path.
//   3. **No MVRV.** `/api/chain-data` rides a 15-request/day free tier that the
//      dashboard itself depends on. Spending that quota on link previews would
//      blank the live card to decorate a chat message. Valuation is computed
//      from the Mayer Multiple alone, which `computeVibeScore` already handles —
//      the dimension keeps its weight and reports one input instead of two.

import { KRAKEN_INTERVAL, krakenOhlcUrl, extractKrakenOhlc } from '../src/lib/ohlc.js'
import { calc200DMA, calcMayerMultiple } from '../src/utils/cycleCalculations.js'
import { computeVibeScore, computePriceChange30d, computeHashRateTrend } from '../src/lib/calculations.js'
import { buildOgModel, ogElement, ogModelIsRenderable, OG_WIDTH, OG_HEIGHT } from './lib/ogView.js'

const STATIC_FALLBACK = '/og-image.png'

// Unfurlers are impatient and the function has to finish inside the platform's
// limit, so a slow source is dropped rather than waited on. Losing one input
// degrades the score; losing the request loses the preview.
const SOURCE_TIMEOUT_MS = 4_000

// One render per five minutes per edge location, served stale for a day while
// the next one warms. The number does not need to be second-accurate to make
// the point that it is live.
const CACHE_CONTROL = 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400'

// A transient upstream failure must not pin the generic image in front of every
// share for the next five minutes.
const FALLBACK_CACHE_CONTROL = 'public, max-age=0, s-maxage=60'

async function safeFetch(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn(`[og] fetch failed: ${url} — ${err.message}`)
    return null
  }
}

// Kraken reports its errors inside a 200 response, so the shared helper throws.
// Here that is just one more missing input.
function krakenCandles(raw) {
  try {
    return extractKrakenOhlc(raw)
  } catch (err) {
    console.warn(`[og] kraken: ${err.message}`)
    return null
  }
}

/**
 * Collect the same numbers the dashboard shows, from the same keyless sources.
 * Exported for tests: the fetching is what needs stubbing, the shaping is what
 * needs asserting.
 */
export async function collectOgData(now = new Date()) {
  const [paprika, fngRaw, ohlcRaw, feesRaw, mempoolRaw, hashrateRaw] = await Promise.all([
    safeFetch('https://api.coinpaprika.com/v1/tickers/btc-bitcoin'),
    safeFetch('https://api.alternative.me/fng/?limit=1'),
    safeFetch(krakenOhlcUrl(KRAKEN_INTERVAL.DAY)),
    safeFetch('https://mempool.space/api/v1/fees/recommended'),
    safeFetch('https://mempool.space/api/mempool'),
    safeFetch('https://mempool.space/api/v1/mining/hashrate/1m'),
  ])

  const quote    = paprika?.quotes?.USD ?? {}
  const priceUsd = parseFloat(quote.price) || null
  const fngEntry = fngRaw?.data?.[0] ?? {}
  const fngScore = fngEntry.value != null ? parseInt(fngEntry.value, 10) : null

  const candles = krakenCandles(ohlcRaw)
  const ma200   = calc200DMA(candles)

  const vibe = computeVibeScore({
    fngScore,
    mayerMultiple:       calcMayerMultiple(priceUsd, ma200),
    mvrv:                null, // see the header — the quota belongs to the live card
    priceChange30dPct:   computePriceChange30d(candles),
    hashRateTrendPct:    computeHashRateTrend(hashrateRaw?.hashrates),
    fastestFeeSatsPerVb: feesRaw?.fastestFee ?? null,
    mempoolTxCount:      mempoolRaw?.count ?? null,
  })

  return buildOgModel({
    priceUsd,
    priceChange24h: quote.percent_change_24h ?? null,
    athUsd:         parseFloat(quote.ath_price) || null,
    fngScore,
    fngLabel:       fngEntry.value_classification ?? null,
    vibe,
    now,
  })
}

function sendFallback(res) {
  res.setHeader('Cache-Control', FALLBACK_CACHE_CONTROL)
  res.setHeader('Location', STATIC_FALLBACK)
  return res.status(302).end()
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).end()
  }

  try {
    // Imported here, not at module scope, so a renderer that fails to load
    // still lands in the catch below and redirects. A throw during module
    // evaluation would be a 500, and a 500 is a blank preview.
    const { ImageResponse } = await import('@vercel/og')

    const model = await collectOgData()
    if (!ogModelIsRenderable(model)) {
      console.warn('[og] no price and no score — falling back to the static image')
      return sendFallback(res)
    }

    const image = new ImageResponse(ogElement(model), { width: OG_WIDTH, height: OG_HEIGHT })
    const body  = Buffer.from(await image.arrayBuffer())

    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Content-Length', String(body.length))
    res.setHeader('Cache-Control', CACHE_CONTROL)
    // HEAD gets the headers a GET would produce, without the megabyte.
    if (req.method === 'HEAD') return res.status(200).end()
    return res.status(200).end(body)
  } catch (err) {
    console.error('[og] render failed:', err)
    return sendFallback(res)
  }
}
