// Shape the raw API responses into the row that goes into `metric_snapshots`.
//
// Pure: no fetching, no clock beyond the Power Law's own, no Supabase. Split
// out of scripts/snapshot.js for the same reason scripts/lib/autoMerge.js is
// split out of its workflow — the assembly of a permanent historical record is
// the last thing that should only be exercisable by waiting for tomorrow's
// cron and looking at the table afterwards.
//
// Every calculation here is IMPORTED rather than reimplemented. The row exists
// so a stored day can be recomputed into the same Vibe Score the live card
// showed that day; a local copy of a formula is a copy that can quietly stop
// agreeing with the one on screen, and the disagreement would surface as a
// history that contradicts the number above it.

import {
  computeAthDistance,
  computeHashRateTrend,
  computePriceChange30d,
} from '../../src/lib/calculations.js'
import { calcPowerLawFairValue } from '../../src/utils/cycleCalculations.js'
import { extractKrakenOhlc, calc200DMA, calcMayerMultiple } from './ohlc.js'

const round = (v, dp) => (v != null && Number.isFinite(v) ? parseFloat(v.toFixed(dp)) : null)

export function buildMetrics({
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
} = {}) {
  // CoinPaprika
  const paprika      = paprikaTickerRaw?.quotes?.USD ?? {}
  const priceUsd     = parseFloat(paprika.price)    || null
  const athUsd       = parseFloat(paprika.ath_price) || null

  // Kraken daily candles — the 200-day MA, the Mayer Multiple, and the 30-day
  // price change all come off this one series.
  const candles      = extractKrakenOhlc(krakenOhlcRaw)
  const ma200        = calc200DMA(candles)

  // MVRV arrives as a series; the job wants its most recent point, and the
  // date it carries, because BGeometrics is typically a day behind.
  let mvrvValue = null, mvrvDate = null
  if (Array.isArray(mvrvRaw) && mvrvRaw.length > 0) {
    const sorted = [...mvrvRaw].sort((a, b) => new Date(a.d) - new Date(b.d))
    const latest = sorted[sorted.length - 1]
    mvrvValue = latest.mvrv
    mvrvDate  = latest.d
  }

  const fees      = feesRaw ?? {}
  const diff      = diffRaw ?? {}
  const fngEntry  = fngRaw?.data?.[0] ?? {}
  const lightning = lightningRaw?.latest ?? {}
  const hashrateEhs = hashrate3dRaw?.currentHashrate != null
    ? hashrate3dRaw.currentHashrate / 1e18
    : null

  return {
    // Price & market
    price_usd:             priceUsd,
    volume_24h_usd:        paprika.volume_24h ?? null,
    market_cap_usd:        paprika.market_cap ?? null,
    change_24h_pct:        paprika.percent_change_24h ?? null,
    // The Vibe Score's momentum dimension. Derived here rather than left to be
    // recovered later from the price_usd column: a row is only useful if it can
    // be recomputed on its own, and the first month of rows would otherwise have
    // no 30-day window behind them to compute from. Its absence does not fail
    // loudly — momentum missing still clears MIN_DIMENSIONS and MIN_COVERAGE, so
    // computeVibeScore returns a plausible number on renormalised weights that
    // disagree with the live card.
    price_change_30d_pct:  round(computePriceChange30d(candles), 2),
    ath_usd:               athUsd,
    ath_distance_pct:      computeAthDistance(priceUsd, athUsd),
    btc_dominance_pct:     paprikaGlobalRaw?.bitcoin_dominance_percentage ?? null,

    // Cycle indicators
    ma_200d_usd:           round(ma200, 2),
    mayer_multiple:        round(calcMayerMultiple(priceUsd, ma200), 4),
    power_law_fair_value:  round(calcPowerLawFairValue(), 2),
    mvrv_value:            mvrvValue,
    mvrv_date:             mvrvDate,

    // Fees (sats/vbyte)
    fee_fastest_sv:        fees.fastestFee   ?? null,
    fee_30m_sv:            fees.halfHourFee  ?? null,
    fee_1h_sv:             fees.hourFee      ?? null,
    fee_economy_sv:        fees.economyFee   ?? null,

    // Network
    block_height:          typeof blockHeightRaw === 'number' ? blockHeightRaw : null,
    difficulty_change_pct: diff.difficultyChange ?? null,
    remaining_blocks:      diff.remainingBlocks  ?? null,
    hashrate_eh:           round(hashrateEhs, 1),
    hashrate_trend_30d:    round(computeHashRateTrend(hashrate1mRaw?.hashrates), 2),

    // Mempool
    mempool_tx_count:      mempoolRaw?.count ?? null,
    mempool_vsize_mb:      mempoolRaw?.vsize != null ? round(mempoolRaw.vsize / 1e6, 2) : null,

    // Lightning
    lightning_capacity_btc: lightning?.total_capacity != null
      ? round(lightning.total_capacity / 1e8, 2)
      : null,
    lightning_channels:    lightning?.channel_count ?? null,
    lightning_nodes:       lightning?.node_count    ?? null,

    // Fear & Greed
    fear_greed_value:      fngEntry.value != null ? parseInt(fngEntry.value, 10) : null,
    fear_greed_label:      fngEntry.value_classification ?? null,
  }
}

/**
 * The stored row, back in the shape computeVibeScore takes.
 *
 * This is the whole point of the table: a day can be replayed into the score
 * the card showed. Keeping the mapping here means the sufficiency of a row is
 * one assertion away (see snapshotMetrics.test.js) rather than a claim.
 */
export function vibeInputsFromMetrics(metrics = {}) {
  return {
    fngScore:            metrics.fear_greed_value,
    mayerMultiple:       metrics.mayer_multiple,
    mvrv:                metrics.mvrv_value,
    priceChange30dPct:   metrics.price_change_30d_pct,
    hashRateTrendPct:    metrics.hashrate_trend_30d,
    fastestFeeSatsPerVb: metrics.fee_fastest_sv,
    mempoolTxCount:      metrics.mempool_tx_count,
  }
}
