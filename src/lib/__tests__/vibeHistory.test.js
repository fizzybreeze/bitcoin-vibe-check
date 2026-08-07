import { describe, it, expect } from 'vitest'
import {
  buildVibeHistory,
  hasEnoughVibeHistory,
  vibeHistoryLabel,
  MIN_HISTORY_POINTS,
  VIBE_HISTORY_DAYS,
  MAX_HISTORY_GAP_DAYS,
} from '../vibeHistory.js'

// A stored row that can reproduce all seven Vibe Score inputs. Only the fields
// vibeInputsFromMetrics reads matter here; the real row carries 29.
function metrics(overrides = {}) {
  return {
    fear_greed_value:     50,
    mayer_multiple:       1.2,
    mvrv_value:           2.0,
    price_change_30d_pct: 5,
    hashrate_trend_30d:   3,
    fee_fastest_sv:       8,
    mempool_tx_count:     90_000,
    ...overrides,
  }
}

function row(captured_on, overrides = {}) {
  return { captured_on, metrics: metrics(overrides) }
}

// `now` fixed so nothing here goes stale overnight — the same reason the visual
// baselines freeze the clock.
const NOW = Date.parse('2026-09-10T12:00:00Z')

const DAY_MS = 86_400_000
const isoDay = ms => new Date(ms).toISOString().slice(0, 10)

// N consecutive daily rows ending on `endIso`, newest first — the order the
// query (`captured_on.desc`) actually returns them in.
function daysEndingOn(endIso, count, overridesFor = () => ({})) {
  const end = Date.parse(`${endIso}T00:00:00Z`)
  return Array.from({ length: count }, (_, i) => row(isoDay(end - i * DAY_MS), overridesFor(i)))
}

describe('buildVibeHistory', () => {
  it('replays a stored row into the score the card showed', () => {
    // Every input at its neutral-ish fixture value; the assertion that matters
    // is that a score comes out at all and is carried through with its date.
    const points = buildVibeHistory([row('2026-09-10')], { now: NOW })
    expect(points).toHaveLength(1)
    expect(points[0].date).toBe('2026-09-10')
    expect(points[0].score).toBe(46)
  })

  it('moves with the stored inputs rather than reporting a constant', () => {
    const cold = buildVibeHistory([row('2026-09-10', { fear_greed_value: 5 })], { now: NOW })
    const hot  = buildVibeHistory([row('2026-09-10', { fear_greed_value: 95 })], { now: NOW })
    expect(hot[0].score).toBeGreaterThan(cold[0].score + 20)
  })

  it('orders oldest first regardless of the order the query returned', () => {
    const points = buildVibeHistory(daysEndingOn('2026-09-10', 5), { now: NOW })
    expect(points.map(p => p.date)).toEqual([
      '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
    ])
  })

  it('drops a row that cannot reproduce all seven inputs', () => {
    // The three rows captured before price_change_30d_pct existed are exactly
    // this shape: computeVibeScore still returns a plausible number for them,
    // on renormalised weights, which would be drawn as a movement.
    const points = buildVibeHistory([
      row('2026-09-09', { price_change_30d_pct: null }),
      row('2026-09-10'),
    ], { now: NOW })
    expect(points.map(p => p.date)).toEqual(['2026-09-10'])
  })

  it('drops a row missing MVRV, which the live card would still have scored', () => {
    const points = buildVibeHistory([
      row('2026-09-09', { mvrv_value: null }),
      row('2026-09-10'),
    ], { now: NOW })
    expect(points.map(p => p.date)).toEqual(['2026-09-10'])
  })

  it('drops a future-dated row rather than letting it end the line', () => {
    const points = buildVibeHistory([row('2026-09-11'), row('2026-09-10')], { now: NOW })
    expect(points.map(p => p.date)).toEqual(['2026-09-10'])
  })

  it('refuses the whole series when the newest point is stale', () => {
    // The job has stopped writing. A line whose last point is a week old, drawn
    // under a live score, claims today is on it.
    const stale = daysEndingOn('2026-09-03', 10)
    expect(buildVibeHistory(stale, { now: NOW })).toEqual([])
  })

  it('still serves a series when only today\'s row is missing', () => {
    // The snapshot job runs mid-morning, so before it fires the freshest row is
    // yesterday's. That must not read as an outage.
    const points = buildVibeHistory(daysEndingOn('2026-09-09', 8), { now: NOW })
    expect(points).toHaveLength(8)
    expect(points[points.length - 1].date).toBe('2026-09-09')
  })

  it('caps the series at the window even if the query returns more', () => {
    const points = buildVibeHistory(daysEndingOn('2026-09-10', VIBE_HISTORY_DAYS + 5), { now: NOW })
    expect(points).toHaveLength(VIBE_HISTORY_DAYS)
  })

  it('survives malformed rows and a malformed response', () => {
    expect(buildVibeHistory(null, { now: NOW })).toEqual([])
    expect(buildVibeHistory(undefined, { now: NOW })).toEqual([])
    expect(buildVibeHistory([
      { captured_on: 'not-a-date', metrics: metrics() },
      { captured_on: '2026-09-10', metrics: null },
      { captured_on: '2026-09-10' },
      null,
      row('2026-09-10'),
    ], { now: NOW })).toHaveLength(1)
  })

  it('respects an explicit gap allowance', () => {
    const rows = daysEndingOn('2026-09-07', 8)
    expect(buildVibeHistory(rows, { now: NOW, maxGapDays: MAX_HISTORY_GAP_DAYS })).toEqual([])
    expect(buildVibeHistory(rows, { now: NOW, maxGapDays: 5 })).toHaveLength(8)
  })
})

describe('hasEnoughVibeHistory', () => {
  it('hides the line below the minimum and shows it at exactly the minimum', () => {
    const short = buildVibeHistory(daysEndingOn('2026-09-10', MIN_HISTORY_POINTS - 1), { now: NOW })
    const exact = buildVibeHistory(daysEndingOn('2026-09-10', MIN_HISTORY_POINTS), { now: NOW })
    expect(hasEnoughVibeHistory(short)).toBe(false)
    expect(hasEnoughVibeHistory(exact)).toBe(true)
  })

  it('is false for the empty and the absent series', () => {
    expect(hasEnoughVibeHistory([])).toBe(false)
    expect(hasEnoughVibeHistory(undefined)).toBe(false)
  })
})

describe('vibeHistoryLabel', () => {
  it('names the first day on the line while the series is young', () => {
    const points = buildVibeHistory(daysEndingOn('2026-09-10', 7), { now: NOW })
    expect(vibeHistoryLabel(points)).toBe('since 4 Sep')
  })

  it('flattens to the window once it is full', () => {
    const points = buildVibeHistory(daysEndingOn('2026-09-10', VIBE_HISTORY_DAYS), { now: NOW })
    expect(vibeHistoryLabel(points)).toBe('30d')
  })

  it('keeps naming the first day when a gap leaves the window short', () => {
    // 30 days of rows with one unscoreable day in the middle: 29 points, so the
    // line is not a full 30 days and must not claim to be.
    const rows = daysEndingOn('2026-09-10', VIBE_HISTORY_DAYS, i => (i === 4 ? { mvrv_value: null } : {}))
    const points = buildVibeHistory(rows, { now: NOW })
    expect(points).toHaveLength(VIBE_HISTORY_DAYS - 1)
    expect(vibeHistoryLabel(points)).toBe('since 12 Aug')
  })

  it('has nothing to say about an empty series', () => {
    expect(vibeHistoryLabel([])).toBeNull()
    expect(vibeHistoryLabel(null)).toBeNull()
  })
})
