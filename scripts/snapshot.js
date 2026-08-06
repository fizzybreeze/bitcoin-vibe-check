#!/usr/bin/env node
/**
 * Bitcoin Vibe Check — Daily Metrics Snapshot
 *
 * Fetches all dashboard data sources and upserts one row per day into the
 * Supabase `metric_snapshots` table. Runs on GitHub Actions
 * (.github/workflows/snapshot.yml), daily plus on-demand via workflow_dispatch.
 *
 * This file is the I/O half only — fetching, reporting and writing. The row
 * itself is assembled by `lib/metrics.js`, which is pure and unit-tested, so
 * the shape of a permanent historical record does not depend on waiting for
 * tomorrow's cron to find out.
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
import { KRAKEN_OHLC_URL } from './lib/ohlc.js'
import { buildMetrics, vibeSufficiency } from './lib/metrics.js'

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
    krakenOhlcRaw,
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
    // Kraken, not Binance: Binance answers US jurisdictions with HTTP 451 and
    // Actions runners are US-hosted, so this was null on every run.
    safeFetch(KRAKEN_OHLC_URL),
    safeFetch('https://api.bgeometrics.com/v1/mvrv', BGEOMETRICS_KEY
      ? { headers: { Authorization: `Bearer ${BGEOMETRICS_KEY}` } }
      : {}),
  ])

  const metrics = buildMetrics({
    paprikaTickerRaw, paprikaGlobalRaw, feesRaw, blockHeightRaw, diffRaw,
    mempoolRaw, lightningRaw, fngRaw, hashrate3dRaw, hashrate1mRaw,
    krakenOhlcRaw, mvrvRaw,
  })

  // Warn on any nulls — useful for debugging missing data
  const nullFields = Object.entries(metrics).filter(([, v]) => v === null).map(([k]) => k)
  if (nullFields.length > 0) {
    console.warn(`[snapshot] Null fields (API may have failed): ${nullFields.join(', ')}`)
  }

  // Whether this row can still be replayed into the score the card showed. It
  // is written even when it cannot — losing 28 good fields because one input is
  // missing would be the wrong trade — but it is said out loud, because nothing
  // about the stored row reveals it later: every column is present, and the
  // score it replays into is simply computed on renormalised weights.
  const vibe = vibeSufficiency(metrics)
  const coverage = `${vibe.used}/${vibe.total} Vibe Score inputs`
  if (vibe.sufficient) {
    console.log(`[snapshot] Row is fully replayable — ${coverage}`)
  } else {
    console.warn(
      `[snapshot] Row is NOT fully replayable — ${coverage}. ` +
      `Degraded: ${vibe.degraded.join(', ')}. This day will score differently ` +
      `from how the dashboard read it.`
    )
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
  console.log(
    `[snapshot] BTC/USD: $${metrics.price_usd.toLocaleString()} | ` +
    `30d: ${metrics.price_change_30d_pct}% | ` +
    `F&G: ${metrics.fear_greed_value} (${metrics.fear_greed_label}) | ` +
    `MVRV: ${metrics.mvrv_value}`
  )
}

main().catch(err => {
  console.error('[snapshot] Fatal error:', err)
  process.exit(1)
})
