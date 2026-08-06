import { describe, it, expect } from 'vitest'
import { buildMetrics, vibeInputsFromMetrics, vibeSufficiency } from '../../scripts/lib/metrics.js'
import { computeVibeScore, computeVibeDimensions } from '../lib/calculations.js'

// Kraken candle: [time, open, high, low, close, vwap, volume, count].
function candle(close) {
  return [1_700_000_000, '100', '110', '90', String(close), String(close), '1.5', 42]
}

function krakenResponse(candles) {
  return { error: [], result: { XXBTZUSD: candles, last: 1_700_000_000 } }
}

// A series where the close 31 candles back is `prior` and the last is `last`,
// padded to `length` so calc200DMA has something to work with too.
function seriesWith(prior, last, length = 200) {
  const candles = Array.from({ length }, () => candle(prior))
  candles[candles.length - 1] = candle(last)
  return candles
}

// Every source answering, so the row is complete.
function fullSources(overrides = {}) {
  return {
    paprikaTickerRaw: {
      quotes: {
        USD: {
          price: 60_000, volume_24h: 1e10, market_cap: 1.2e12,
          percent_change_24h: 1.5, ath_price: 126_000,
        },
      },
    },
    paprikaGlobalRaw: { bitcoin_dominance_percentage: 56.32 },
    feesRaw: { fastestFee: 8, halfHourFee: 5, hourFee: 3, economyFee: 1 },
    blockHeightRaw: 961_279,
    diffRaw: { difficultyChange: 1.09, remainingBlocks: 353 },
    mempoolRaw: { count: 91_570, vsize: 44_060_000 },
    lightningRaw: { latest: { total_capacity: 4.8966e11, channel_count: 41_087, node_count: 17_437 } },
    fngRaw: { data: [{ value: '25', value_classification: 'Extreme Fear' }] },
    hashrate3dRaw: { currentHashrate: 9.407e20 },
    hashrate1mRaw: { hashrates: [{ avgHashrate: 100 }, { avgHashrate: 115 }] },
    krakenOhlcRaw: krakenResponse(seriesWith(50_000, 60_000)),
    mvrvRaw: [{ d: '2026-08-04', mvrv: 1.2 }, { d: '2026-08-05', mvrv: 1.2359 }],
    ...overrides,
  }
}

describe('price_change_30d_pct', () => {
  it('is the change from the close 31 candles back to the last', () => {
    // 50_000 → 60_000 is +20%.
    const metrics = buildMetrics(fullSources())
    expect(metrics.price_change_30d_pct).toBe(20)
  })

  it('reads the candle series, not the CoinPaprika spot price', () => {
    // Spot says 60_000; the series says the last close is 55_000. Momentum is a
    // property of the series, and taking the endpoint from a different source
    // would compare two prices captured seconds apart from different venues.
    const metrics = buildMetrics(fullSources({
      krakenOhlcRaw: krakenResponse(seriesWith(50_000, 55_000)),
    }))
    expect(metrics.price_change_30d_pct).toBe(10)
  })

  it('rounds to 2dp, matching the other percentage trend in the row', () => {
    const metrics = buildMetrics(fullSources({
      krakenOhlcRaw: krakenResponse(seriesWith(30_000, 41_234)),
    }))
    expect(metrics.price_change_30d_pct).toBe(37.45)
  })

  it('is null rather than wrong when the series is too short to hold 30 days', () => {
    const metrics = buildMetrics(fullSources({
      krakenOhlcRaw: krakenResponse(Array.from({ length: 30 }, () => candle(50_000))),
    }))
    expect(metrics.price_change_30d_pct).toBeNull()
  })

  it('is null, not a throw, when Kraken fails entirely', () => {
    expect(buildMetrics(fullSources({ krakenOhlcRaw: null })).price_change_30d_pct).toBeNull()
    expect(buildMetrics({}).price_change_30d_pct).toBeNull()
  })
})

describe('a stored row is sufficient to recompute the Vibe Score', () => {
  // This is the property the whole table exists for, and the one the row was
  // missing: a day can be replayed into the score the card showed that day.
  it('replays into a score built on every input, with nothing renormalised', () => {
    const vibe = computeVibeScore(vibeInputsFromMetrics(buildMetrics(fullSources())))

    expect(vibe).not.toBeNull()
    expect(vibe.inputsUsed).toBe(vibe.inputsTotal)
    expect(vibe.available).toBe(vibe.total)
    expect(vibe.coverage).toBe(1)
    expect(Object.values(vibe.dimensions).every(v => v != null)).toBe(true)
  })

  it('moves the score, so the field is not decoration', () => {
    // Vary ONLY price_change_30d_pct. Varying the candle series instead would
    // also shift the 200-day MA and so the Mayer Multiple, and the score would
    // move whether or not momentum was ever read.
    const row = buildMetrics(fullSources())
    const scoreAt = pct =>
      computeVibeScore(vibeInputsFromMetrics({ ...row, price_change_30d_pct: pct })).score

    expect(scoreAt(20)).toBeGreaterThan(scoreAt(-20))
  })

  it('degrades silently without it — which is why the field has to be stored', () => {
    // Pinning the failure mode, not endorsing it. Momentum missing leaves 4
    // dimensions and 0.75 coverage, both above the floors, so the score does
    // NOT go null: it comes back a plausible number computed on renormalised
    // weights that disagree with the live card. Nothing on screen would say so.
    const withMomentum    = buildMetrics(fullSources())
    const withoutMomentum = { ...withMomentum, price_change_30d_pct: null }

    const degraded = computeVibeScore(vibeInputsFromMetrics(withoutMomentum))
    expect(degraded).not.toBeNull()
    expect(degraded.coverage).toBeCloseTo(0.75)
    expect(degraded.score).not.toBe(computeVibeScore(vibeInputsFromMetrics(withMomentum)).score)
  })
})

describe('vibeSufficiency — what the job says about the row it just built', () => {
  it('reports a complete row as fully replayable', () => {
    expect(vibeSufficiency(buildMetrics(fullSources()))).toEqual({
      used: 7, total: 7, sufficient: true, degraded: [],
    })
  })

  it('names momentum when the 30-day change is the input that went missing', () => {
    const row = { ...buildMetrics(fullSources()), price_change_30d_pct: null }
    expect(vibeSufficiency(row)).toEqual({
      used: 6, total: 7, sufficient: false, degraded: ['momentum'],
    })
  })

  it('names valuation when MVRV is rate-limited — the everyday case', () => {
    // BGeometrics is 15 requests/day, so this is the shortfall the log will
    // actually show. It is expected, and distinguishable from a real fault.
    const row = buildMetrics(fullSources({ mvrvRaw: null }))
    expect(vibeSufficiency(row)).toEqual({
      used: 6, total: 7, sufficient: false, degraded: ['valuation'],
    })
  })

  it('counts a zero fastest-fee as absent, because the score does', () => {
    // A finite number that is still not a usable input: heat() takes log10 of
    // it. This is the case a locally reimplemented "is it null" check would get
    // wrong, which is why the count comes from computeVibeDimensions.
    const row = buildMetrics(fullSources({
      feesRaw: { fastestFee: 0, halfHourFee: 0, hourFee: 0, economyFee: 0 },
    }))
    expect(row.fee_fastest_sv).toBe(0)
    expect(vibeSufficiency(row)).toEqual({
      used: 6, total: 7, sufficient: false, degraded: ['congestion'],
    })
  })

  it('takes its total from the score rather than from a number written here', () => {
    // Compared against computeVibeDimensions live, not against the literal 7:
    // a literal would still pass on the day a dimension is added, which is the
    // one day this needs to move. It is `used === total` on a full row that
    // then goes red, above — this pins where `total` comes from.
    const expected = Object.values(computeVibeDimensions({}))
      .reduce((sum, d) => sum + d.inputs, 0)

    expect(vibeSufficiency(buildMetrics({})).total).toBe(expected)
    expect(vibeSufficiency(buildMetrics({})).used).toBe(0)
  })
})

describe('buildMetrics, the rest of the row', () => {
  it('keeps every field the table already had', () => {
    expect(Object.keys(buildMetrics(fullSources())).sort()).toEqual([
      'ath_distance_pct', 'ath_usd', 'block_height', 'btc_dominance_pct',
      'change_24h_pct', 'difficulty_change_pct', 'fear_greed_label',
      'fear_greed_value', 'fee_1h_sv', 'fee_30m_sv', 'fee_economy_sv',
      'fee_fastest_sv', 'hashrate_eh', 'hashrate_trend_30d',
      'lightning_capacity_btc', 'lightning_channels', 'lightning_nodes',
      'ma_200d_usd', 'market_cap_usd', 'mayer_multiple', 'mempool_tx_count',
      'mempool_vsize_mb', 'mvrv_value', 'mvrv_date', 'power_law_fair_value',
      'price_change_30d_pct', 'price_usd', 'remaining_blocks', 'volume_24h_usd',
    ].sort())
  })

  it('takes the most recent MVRV point and the date it carries', () => {
    const metrics = buildMetrics(fullSources())
    expect(metrics.mvrv_value).toBe(1.2359)
    expect(metrics.mvrv_date).toBe('2026-08-05')
  })

  it('emits every key as null rather than throwing when every source fails', () => {
    const metrics = buildMetrics({})
    // power_law_fair_value is derived from the clock alone, so it is the one
    // field that survives a total outage — the reason the job's guard checks
    // price rather than "is everything null".
    expect(metrics.power_law_fair_value).toBeGreaterThan(0)
    expect(metrics.price_usd).toBeNull()
    expect(metrics.mayer_multiple).toBeNull()
  })
})
