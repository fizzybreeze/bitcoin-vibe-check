// A Vibe Score series out of `metric_snapshots` — the decision half of the
// sparkline, with no network and no React in it.
//
// Pure for the reason `api/lib/mvrvFallback.js` is: what separates "a short
// history" from "a misleading history" is entirely which stored rows get
// plotted and when the whole line is refused, and neither should only be
// exercisable by waiting for the table to fill up and looking at the card.

import { computeVibeScore } from './calculations.js'
// Imported rather than reimplemented, on the roadmap's instruction (§3.2c). The
// direction is unusual — src/ reaching into scripts/ — but the alternative is a
// second copy of the row→inputs mapping, and the entire value of this series is
// that a stored day replays into the score the card actually showed that day.
// `buildMetrics` is not imported here, so the bundler drops it.
import { vibeInputsFromMetrics } from '../../scripts/lib/metrics.js'

// One point per UTC day, so this is both the query limit and the widest window
// the sparkline ever draws.
export const VIBE_HISTORY_DAYS = 30

// Below this, no sparkline at all. A two- or three-point line reads as a broken
// chart rather than as a young one, and the fix people reach for — padding or
// backfilling — puts a fabricated history under a credibility-sensitive number.
// Decided in the roadmap before any of this was written, which is why the
// "not enough history yet" branch is the deliberate one rather than the
// leftover: it is the branch that renders on the day this merges.
export const MIN_HISTORY_POINTS = 7

// How far behind the newest point may be before the whole series is refused.
// The snapshot job writes one row per UTC day but runs mid-morning, so before
// it fires the freshest row is yesterday's — hence 2 rather than 1. Past that
// the job has stopped, and a line whose last point is a week old, drawn beneath
// a live score, implies today is on it. Same call as the MVRV fallback's
// staleness cap: refuse, do not label.
export const MAX_HISTORY_GAP_DAYS = 2

const DAY_MS = 86_400_000

// Spelled out rather than taken from toLocaleDateString('en-GB'), which renders
// September as "Sept" on current ICU and "Sep" on older builds — a label that
// changes with the Node version is a label a unit test cannot pin, and the one
// thing this string has to be is stable.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// `captured_on` is a generated UTC date, so it arrives as a plain YYYY-MM-DD.
// Parsed at UTC midnight so a point never shifts a day with the viewer's
// timezone — a sparkline that gains a point when you fly east is a bug report.
function parseUtcDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(ms) ? ms : null
}

/**
 * One stored row, replayed into the score the card showed that day — or null.
 *
 * The strict part is `inputsUsed === inputsTotal`. `computeVibeScore` degrades
 * rather than vanishing: a row missing MVRV, or one of the three captured
 * before `price_change_30d_pct` existed, still returns a plausible number, on
 * renormalised weights. That is the right behaviour for the live card, where
 * the alternative is a blank, and the wrong behaviour for a *series*, where the
 * whole claim being made is that the points are comparable to each other. A
 * point computed under different weights is a methodology change drawn as a
 * movement, which is precisely the discontinuity CLAUDE.md warns about for
 * storing the score instead of its inputs.
 *
 * Dropping is safe in a way that including is not: a missing day leaves a gap
 * the line spans, which is invisible and true, while an incomparable day leaves
 * a shape that is visible and false.
 */
function replayRow(row) {
  const dateMs = parseUtcDate(row?.captured_on)
  if (dateMs == null) return null

  const metrics = row?.metrics
  if (!metrics || typeof metrics !== 'object') return null

  const vibe = computeVibeScore(vibeInputsFromMetrics(metrics))
  if (!vibe || vibe.inputsUsed < vibe.inputsTotal) return null

  return { date: row.captured_on, dateMs, score: vibe.score }
}

/**
 * Snapshot rows → the points the sparkline draws, oldest first.
 *
 * Three rules beyond the per-row replay above:
 *
 * - **Ordering is re-derived, not trusted.** The query asks for
 *   `captured_on.desc` and the chart needs ascending; sorting here rather than
 *   reversing means a change to the query cannot silently draw the series
 *   backwards, which is a mirror image that still looks like a plausible chart.
 *
 * - **A future-dated row is wrong, not fresh.** It would sit at the right-hand
 *   end of the line as the current reading and satisfy the staleness check
 *   below forever after.
 *
 * - **A stale series is refused whole.** See MAX_HISTORY_GAP_DAYS.
 */
export function buildVibeHistory(rows, { now = Date.now(), maxGapDays = MAX_HISTORY_GAP_DAYS } = {}) {
  if (!Array.isArray(rows)) return []

  // Whole UTC days apart, not elapsed milliseconds: `captured_on` has day
  // granularity, so a millisecond comparison would make the gap mean one thing
  // at 09:00 and another at 23:00.
  const today = Math.floor(now / DAY_MS)

  const points = rows
    .map(replayRow)
    .filter(Boolean)
    .filter(p => today - p.dateMs / DAY_MS >= 0)
    .sort((a, b) => a.dateMs - b.dateMs)
    .slice(-VIBE_HISTORY_DAYS)

  if (points.length === 0) return []

  const newest = points[points.length - 1]
  if (today - newest.dateMs / DAY_MS > maxGapDays) return []

  return points
}

export function hasEnoughVibeHistory(points) {
  return Array.isArray(points) && points.length >= MIN_HISTORY_POINTS
}

/**
 * What the series is honestly a picture of.
 *
 * Counted rather than measured in days: with 30 daily rows the count reaches
 * `VIBE_HISTORY_DAYS` and the label becomes the flat "30d". Any gap keeps the
 * count below it, and the label keeps naming the first day on the line — which
 * is the more honest of the two readings when the series is incomplete.
 */
export function vibeHistoryLabel(points) {
  if (!Array.isArray(points) || points.length === 0) return null
  if (points.length >= VIBE_HISTORY_DAYS) return `${VIBE_HISTORY_DAYS}d`

  const first = new Date(points[0].dateMs)
  return `since ${first.getUTCDate()} ${MONTHS[first.getUTCMonth()]}`
}
