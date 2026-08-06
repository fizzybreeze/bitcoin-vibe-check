// Choosing yesterday's stored MVRV over a blank card — the decision half of the
// `/api/chain-data` fallback, with no network in it.
//
// Pure for the same reason `api/lib/ogView.js` and `scripts/lib/autoMerge.js`
// are: the only thing standing between "no MVRV" and "a wrong MVRV" is which
// stored row this picks and when it refuses to pick one at all, and that should
// not be exercisable only by exhausting a 15-request/day budget and watching.

// A snapshot row is one UTC day of dashboard metrics. `metrics.mvrv_value` and
// `metrics.mvrv_date` are written by scripts/lib/metrics.js; the date is
// BGeometrics' own, which is typically the day before the capture.
export const MAX_SNAPSHOT_AGE_DAYS = 7

const DAY_MS = 86_400_000

// `mvrv_date` is a plain YYYY-MM-DD, the same shape the live route returns.
// Parsed as UTC midnight so the age never shifts with the runner's timezone.
function parseUtcDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(ms) ? ms : null
}

function usableMvrv(row) {
  const metrics = row?.metrics
  if (!metrics || typeof metrics !== 'object') return null

  const value = metrics.mvrv_value
  // 0 is not a plausible MVRV, and a non-finite one would render as "NaN" on
  // the card and skew the Vibe Score's valuation dimension rather than drop it.
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null

  const dateMs = parseUtcDate(metrics.mvrv_date)
  if (dateMs == null) return null

  return { value, date: metrics.mvrv_date, dateMs }
}

/**
 * The freshest usable MVRV in a set of snapshot rows, or null.
 *
 * Two rules are load-bearing:
 *
 * - **Rows are searched, not indexed.** Today's row exists whether or not
 *   BGeometrics answered the snapshot job, so the newest row is regularly the
 *   one with a null `mvrv_value` — reading `rows[0]` would fall back to nothing
 *   on exactly the days the upstream is having trouble, which are the days this
 *   exists for. Ordering is re-derived from `mvrv_date` rather than trusted from
 *   the query, because a fallback that silently serves the older of two rows is
 *   indistinguishable from one that works.
 *
 * - **Stale is refused, not labelled.** MVRV is half of the Vibe Score's
 *   valuation dimension (15% of the composite), so an unbounded fallback would
 *   keep feeding a number into it long after the snapshot job stopped writing
 *   new ones — and the card would look healthy the whole time. Past
 *   `MAX_SNAPSHOT_AGE_DAYS` the honest answer is the one the card already knows
 *   how to render: no MVRV.
 */
export function pickSnapshotMvrv(rows, { now = Date.now(), maxAgeDays = MAX_SNAPSHOT_AGE_DAYS } = {}) {
  if (!Array.isArray(rows)) return null

  const candidates = rows.map(usableMvrv).filter(Boolean)
  if (candidates.length === 0) return null

  const newest = candidates.reduce((a, b) => (b.dateMs > a.dateMs ? b : a))
  // Whole UTC days apart, not elapsed milliseconds: `mvrv_date` has day
  // granularity, so a millisecond comparison would make the cap mean "6 days
  // and some hours" at 09:00 and something else at 23:00.
  const ageDays = Math.floor(now / DAY_MS) - newest.dateMs / DAY_MS
  if (ageDays > maxAgeDays) return null

  return { value: newest.value, date: newest.date, source: 'snapshot' }
}

/**
 * The PostgREST request for the last few snapshot rows.
 *
 * `metric_snapshots` grants `SELECT` to public, so the anon key — the same one
 * already compiled into the client bundle — is all this needs. Returns null when
 * the project vars are absent, which is how `src/lib/supabase.js` behaves and is
 * what keeps a missing var a missing fallback rather than a crashed route.
 *
 * `limit` is deliberately more than 1: see pickSnapshotMvrv above.
 */
export function snapshotQuery({ url, key, limit = 5 } = {}) {
  if (!url || !key) return null
  const base = String(url).replace(/\/+$/, '')
  return {
    url: `${base}/rest/v1/metric_snapshots?select=captured_on,metrics&order=captured_on.desc&limit=${limit}`,
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }
}
