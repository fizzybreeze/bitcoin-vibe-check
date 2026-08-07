import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { buildVibeHistory, VIBE_HISTORY_DAYS } from '../lib/vibeHistory.js'

// The Vibe Score's own history, read straight from `metric_snapshots` with the
// anon key already in the bundle. No serverless route: the table grants SELECT
// to public and one row carries every metric as jsonb, so a single query is the
// whole feature.
//
// Fetched once on mount rather than on the 60-second refresh interval. The
// series gains at most one point a day, and re-reading it every minute would
// spend Supabase requests to redraw an identical line.
//
// Degrades to an empty series in every failure mode — no client (env vars
// absent, the soft-fail in src/lib/supabase.js), a PostgREST error, a network
// error. The card then simply does not draw a sparkline, which is the same
// thing it does before seven days exist, and is why nothing here throws.
export default function useVibeHistory() {
  const [points, setPoints] = useState([])

  useEffect(() => {
    if (!supabase) return
    let cancelled = false

    // Built outside the rejection handler on purpose. Wrapping the whole thing
    // in a try/catch would also swallow a TypeError from calling `.from` on a
    // null client — which makes the guard above untestable, since removing it
    // would then produce the same empty series as leaving it in. The handler is
    // for a failed *request*; a null client is a different thing and must stay
    // visibly different.
    const query = supabase
      .from('metric_snapshots')
      .select('captured_on,metrics')
      .order('captured_on', { ascending: false })
      .limit(VIBE_HISTORY_DAYS)

    // The builder is a thenable rather than a Promise, so it is assimilated
    // before a rejection handler is attached.
    Promise.resolve(query).then(
      ({ data, error }) => {
        if (cancelled || error || !data) return
        setPoints(buildVibeHistory(data))
      },
      () => {}, // Offline, DNS, a dead project — the empty series stands.
    )

    return () => { cancelled = true }
  }, [])

  return points
}
