#!/usr/bin/env node
/**
 * Bitcoin Vibe Check — Daily Metrics Snapshot
 *
 * Fetches all dashboard data sources and upserts one row per day into the
 * Supabase `metric_snapshots` table. Runs on GitHub Actions
 * (.github/workflows/snapshot.yml), daily plus on-demand via workflow_dispatch.
 *
 * Required env vars:
 *   SUPABASE_URL              — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key. Writes bypass RLS; the table
 *                               has no anon insert policy by design. NEVER put
 *                               this in a VITE_ variable — it would ship to the
 *                               browser.
 *
 * Optional env var:
 *   BGEOMETRICS_API_KEY — BGeometrics API token (free tier: 15 req/day).
 *                         Without it the MVRV fields come back null.
 */

import { createClient } from '@supabase/supabase-js'
// Shared with the app so the Kraken response shape is parsed in exactly one place.
import { KRAKEN_INTERVAL, krakenOhlcUrl, extractKrakenOhlc } from '../src/lib/ohlc.js'

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const BGEOMETRICS_KEY = process.env.BGEOMETRICS_API_KEY ?? ''

// Fail loudly rather than silently collecting data and dropping it. A snapshot
// job that quietly no-ops is worse than one that goes red in the Actions tab.
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '[snapshot] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
    'Set both as GitHub Actions repository secrets.'
  )
  process.exit(1)
}

// ─── Calculations (mirrored from src/lib/calculations.js) ────────────────────

const GENESIS = new Date('2009-01-03T00:00:00.000Z')

function calc200DMA(klines) {
  if (!klines?.length) return null
  const closes = klines.map(k => parseFloat(k[4]))
  const last200 = closes.slice(-200)
  if (!last200.length) return null
  return last200.reduce((sum, v) => sum + v, 0) / last200.length
}

function calcMayerMultiple(price, ma200) {
  if (price == null || ma200 == null || ma200 === 0) return null
  return price / ma200
}

function calcPowerLawFairValue() {
  const days = Math.floor((Date.now() - GENESIS.getTime()) / 86_400_000)
  if (days <= 0) return null
  return Math.pow(10, -17.01593313 + 5.84509376 * Math.log10(days))
}

function calcAthDistance(price, ath) {
  if (price == null || ath == null) return null
  return ((price - ath) / ath) * 100
}

function calcHashRateTrend(hashrates) {
  if (!Array.isArray(hashrates) || hashrates.length < 2) return null
  const first = hashrates[0].avgHashrate
  const last  = hashrates[hashrates.length - 1].avgHashrate
  if (!first) return null
  return ((last - first) / first) * 100
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn(`[snapshot] fetch failed: ${url} — ${err.message}`)
    return null
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[snapshot] Starting — ${new Date().toISOString()}`)

  const [
    paprikaTickerRaw,
    paprikaGlobalRaw,
    feesRaw,
    blockHeightRaw,
    diffRaw,
    mempoolRaw,
    lightningRaw,
    fngRaw,
    hashrate3dRaw,
    hashrate1mRaw,
    ohlc200Raw,
    mvrvRaw,
  ] = await Promise.all([
    safeFetch('https://api.coinpaprika.com/v1/tickers/btc-bitcoin'),
    safeFetch('https://api.coinpaprika.com/v1/global'),
    safeFetch('https://mempool.space/api/v1/fees/recommended'),
    safeFetch('https://mempool.space/api/blocks/tip/height'),
    safeFetch('https://mempool.space/api/v1/difficulty-adjustment'),
    safeFetch('https://mempool.space/api/mempool'),
    safeFetch('https://mempool.space/api/v1/lightning/statistics/latest'),
    safeFetch('https://api.alternative.me/fng/?limit=1'),
    safeFetch('https://mempool.space/api/v1/mining/hashrate/3d'),
    safeFetch('https://mempool.space/api/v1/mining/hashrate/1m'),
    // Kraken, not Binance: this job runs on GitHub's US-based runners, and
    // Binance geo-blocks US IPs. Using Binance here would silently null out
    // ma_200d_usd and mayer_multiple on every single run.
    safeFetch(krakenOhlcUrl(KRAKEN_INTERVAL.DAY)),
    safeFetch('https://api.bgeometrics.com/v1/mvrv', BGEOMETRICS_KEY
      ? { headers: { Authorization: `Bearer ${BGEOMETRICS_KEY}` } }
      : {}),
  ])

  // Parse CoinPaprika
  const paprika       = paprikaTickerRaw?.quotes?.USD ?? {}
  const priceUsd      = parseFloat(paprika.price)           || null
  const volumeUsd     = paprika.volume_24h                  ?? null
  const marketCapUsd  = paprika.market_cap                  ?? null
  const change24h     = paprika.percent_change_24h           ?? null
  const athUsd        = parseFloat(paprika.ath_price)        || null
  const dominance     = paprikaGlobalRaw?.bitcoin_dominance_percentage ?? null

  // Parse Kraken daily candles for the 200-day series. calc200DMA reads index 4
  // (close), which is the same index in Kraken's shape as in Binance's.
  let ohlc200Candles = null
  try {
    ohlc200Candles = extractKrakenOhlc(ohlc200Raw)
  } catch (err) {
    console.warn(`[snapshot] Kraken OHLC error: ${err.message}`)
  }
  const ma200         = calc200DMA(ohlc200Candles?.slice(-200))
  const mayerMultiple = calcMayerMultiple(priceUsd, ma200)
  const powerLawFv    = calcPowerLawFairValue()

  // Parse MVRV
  let mvrvValue = null, mvrvDate = null
  if (Array.isArray(mvrvRaw) && mvrvRaw.length > 0) {
    const sorted = [...mvrvRaw].sort((a, b) => new Date(a.d) - new Date(b.d))
    const latest = sorted[sorted.length - 1]
    mvrvValue = latest.mvrv
    mvrvDate  = latest.d
  }

  // Parse mempool
  const fees = feesRaw ?? {}
  const diff = diffRaw ?? {}
  const fngEntry = fngRaw?.data?.[0] ?? {}
  const lightning = lightningRaw?.latest ?? {}
  const hashrateEhs = hashrate3dRaw?.currentHashrate != null
    ? hashrate3dRaw.currentHashrate / 1e18
    : null
  const hashrateTrend30d = calcHashRateTrend(hashrate1mRaw?.hashrates)

  const metrics = {
    // Price & market
    price_usd:             priceUsd,
    volume_24h_usd:        volumeUsd,
    market_cap_usd:        marketCapUsd,
    change_24h_pct:        change24h,
    ath_usd:               athUsd,
    ath_distance_pct:      calcAthDistance(priceUsd, athUsd),
    btc_dominance_pct:     dominance,

    // Cycle indicators
    ma_200d_usd:           ma200   != null ? parseFloat(ma200.toFixed(2))   : null,
    mayer_multiple:        mayerMultiple != null ? parseFloat(mayerMultiple.toFixed(4)) : null,
    power_law_fair_value:  powerLawFv != null ? parseFloat(powerLawFv.toFixed(2)) : null,
    mvrv_value:            mvrvValue,
    mvrv_date:             mvrvDate,

    // Fees (sats/vbyte)
    fee_fastest_sv:        fees.fastestFee   ?? null,
    fee_30m_sv:            fees.halfHourFee  ?? null,
    fee_1h_sv:             fees.hourFee      ?? null,
    fee_economy_sv:        fees.economyFee   ?? null,

    // Network
    block_height:          typeof blockHeightRaw === 'number' ? blockHeightRaw : null,
    difficulty_change_pct: diff.difficultyChange   ?? null,
    remaining_blocks:      diff.remainingBlocks    ?? null,
    hashrate_eh:           hashrateEhs != null ? parseFloat(hashrateEhs.toFixed(1)) : null,
    hashrate_trend_30d:    hashrateTrend30d != null ? parseFloat(hashrateTrend30d.toFixed(2)) : null,

    // Mempool
    mempool_tx_count:      mempoolRaw?.count  ?? null,
    mempool_vsize_mb:      mempoolRaw?.vsize  != null ? parseFloat((mempoolRaw.vsize / 1e6).toFixed(2)) : null,

    // Lightning
    lightning_capacity_btc: lightning?.total_capacity != null
      ? parseFloat((lightning.total_capacity / 1e8).toFixed(2))
      : null,
    lightning_channels:    lightning?.channel_count ?? null,
    lightning_nodes:       lightning?.node_count    ?? null,

    // Fear & Greed
    fear_greed_value:      fngEntry.value != null ? parseInt(fngEntry.value, 10) : null,
    fear_greed_label:      fngEntry.value_classification ?? null,
  }

  // Warn on any nulls — useful for debugging missing data
  const nullFields = Object.entries(metrics).filter(([, v]) => v === null).map(([k]) => k)
  if (nullFields.length > 0) {
    console.warn(`[snapshot] Null fields (API may have failed): ${nullFields.join(', ')}`)
  }

  // Refuse to store a worthless row. Price is the one field every other market
  // metric is anchored to, so if CoinPaprika failed there is nothing useful to
  // record — better to go red in the Actions tab than to pollute the series
  // with a row that looks like a real day of data.
  //
  // Note this cannot be "are all fields null?": power_law_fair_value is derived
  // from the clock alone and is always populated, so such a check never fires.
  if (metrics.price_usd == null) {
    console.error('[snapshot] No price could be fetched — refusing to write a placeholder row.')
    process.exit(1)
  }

  // Upsert on captured_on so re-running the job on the same day corrects that
  // day's row instead of adding a duplicate.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const capturedAt = new Date().toISOString()
  const { error } = await supabase
    .from('metric_snapshots')
    .upsert({ captured_at: capturedAt, metrics }, { onConflict: 'captured_on' })

  if (error) {
    console.error(`[snapshot] Supabase write failed: ${error.message}`)
    process.exit(1)
  }

  console.log(`[snapshot] Done — upserted snapshot for ${capturedAt.slice(0, 10)}`)
  if (priceUsd) console.log(`[snapshot] BTC/USD: $${priceUsd.toLocaleString()} | F&G: ${metrics.fear_greed_value} (${metrics.fear_greed_label}) | MVRV: ${metrics.mvrv_value}`)
}

main().catch(err => {
  console.error('[snapshot] Fatal error:', err)
  process.exit(1)
})
