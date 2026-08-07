import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  pickSnapshotMvrv, snapshotQuery, MAX_SNAPSHOT_AGE_DAYS, SNAPSHOT_QUERY_LIMIT,
} from '../../api/lib/mvrvFallback.js'
import handler from '../../api/chain-data.js'

// Roadmap §3.2b: when the BGeometrics budget (15 req/day) is exhausted,
// `/api/chain-data` serves the MVRV the daily snapshot job stored rather than a
// blank card. These tests are the whole safety story for that — the fallback
// path is by definition the one nobody sees until the quota runs out.

const NOW = Date.parse('2026-08-06T09:00:00Z')

function row(captured_on, metrics) {
  return { captured_on, metrics }
}

const FULL_ROW = { mvrv_value: 2.15, mvrv_date: '2026-08-05', price_usd: 65000 }

describe('pickSnapshotMvrv', () => {
  it('returns the stored MVRV, marked as coming from a snapshot', () => {
    expect(pickSnapshotMvrv([row('2026-08-06', FULL_ROW)], { now: NOW }))
      .toEqual({ value: 2.15, date: '2026-08-05', source: 'snapshot' })
  })

  // Today's row exists whether or not BGeometrics answered the snapshot job, so
  // the newest row is regularly the one with no MVRV in it — and those are
  // exactly the days this fallback exists for.
  it('skips a newer row whose MVRV is null', () => {
    const rows = [
      row('2026-08-06', { mvrv_value: null, mvrv_date: null }),
      row('2026-08-05', { mvrv_value: 2.11, mvrv_date: '2026-08-04' }),
    ]
    expect(pickSnapshotMvrv(rows, { now: NOW })?.value).toBe(2.11)
  })

  it('picks the freshest MVRV date regardless of the order rows arrive in', () => {
    const rows = [
      row('2026-08-04', { mvrv_value: 2.01, mvrv_date: '2026-08-03' }),
      row('2026-08-06', { mvrv_value: 2.15, mvrv_date: '2026-08-05' }),
      row('2026-08-05', { mvrv_value: 2.08, mvrv_date: '2026-08-04' }),
    ]
    expect(pickSnapshotMvrv(rows, { now: NOW })?.date).toBe('2026-08-05')
  })

  // MVRV is half of the Vibe Score's valuation dimension. An unbounded fallback
  // would keep feeding a number into the composite long after the snapshot job
  // stopped writing new ones, and the card would look healthy throughout.
  it('refuses a row older than the staleness cap', () => {
    const stale = NOW - (MAX_SNAPSHOT_AGE_DAYS + 1) * 86_400_000
    const date  = new Date(stale).toISOString().slice(0, 10)
    expect(pickSnapshotMvrv([row(date, { mvrv_value: 2.15, mvrv_date: date })], { now: NOW }))
      .toBeNull()
  })

  // The cap counts whole UTC days, so a row dated exactly MAX days ago is in
  // regardless of the time of day the route happens to run.
  it('accepts a row right at the staleness cap, at either end of the day', () => {
    const edge = NOW - MAX_SNAPSHOT_AGE_DAYS * 86_400_000
    const date = new Date(edge).toISOString().slice(0, 10)
    for (const time of ['T00:00:00Z', 'T23:59:59Z']) {
      const now = Date.parse(new Date(NOW).toISOString().slice(0, 10) + time)
      expect(pickSnapshotMvrv([row(date, { mvrv_value: 2.15, mvrv_date: date })], { now })?.value)
        .toBe(2.15)
    }
  })

  it('rejects values that would render as a number but are not one', () => {
    for (const mvrv_value of [0, -1, NaN, '2.15', null, undefined]) {
      expect(pickSnapshotMvrv([row('2026-08-06', { mvrv_value, mvrv_date: '2026-08-05' })], { now: NOW }))
        .toBeNull()
    }
  })

  it('rejects a row with no usable date, since staleness could not be judged', () => {
    for (const mvrv_date of [null, '', 'yesterday', '2026-8-5', 20260805]) {
      expect(pickSnapshotMvrv([row('2026-08-06', { mvrv_value: 2.15, mvrv_date })], { now: NOW }))
        .toBeNull()
    }
  })

  // Ordering is by date and the cap only rejects on the old side, so a row
  // dated in the future would win every comparison and pin itself as the
  // fallback permanently.
  it('ignores a future-dated row and serves the newest real one instead', () => {
    const rows = [
      row('2026-08-06', { mvrv_value: 9.99, mvrv_date: '2027-01-01' }),
      row('2026-08-06', FULL_ROW),
    ]
    expect(pickSnapshotMvrv(rows, { now: NOW })).toEqual({
      value: 2.15, date: '2026-08-05', source: 'snapshot',
    })
  })

  it('returns nothing when the only row is future-dated', () => {
    expect(pickSnapshotMvrv([row('2026-08-06', { mvrv_value: 9.99, mvrv_date: '2027-01-01' })], { now: NOW }))
      .toBeNull()
  })

  it('survives an empty table, a malformed response and a missing metrics object', () => {
    expect(pickSnapshotMvrv([], { now: NOW })).toBeNull()
    expect(pickSnapshotMvrv(null, { now: NOW })).toBeNull()
    expect(pickSnapshotMvrv({ error: 'nope' }, { now: NOW })).toBeNull()
    expect(pickSnapshotMvrv([row('2026-08-06', null), {}], { now: NOW })).toBeNull()
  })
})

describe('snapshotQuery', () => {
  it('builds a PostgREST read authorised with the anon key', () => {
    const q = snapshotQuery({ url: 'https://proj.supabase.co', key: 'anon-key' })
    expect(q.url).toContain('/rest/v1/metric_snapshots')
    expect(q.url).toContain('order=captured_on.desc')
    expect(q.headers).toEqual({ apikey: 'anon-key', Authorization: 'Bearer anon-key' })
  })

  // A window narrower than the staleness cap would 503 while a usable row sat
  // just outside it — the effective cap would be the limit, not the documented
  // number. The job writes a row a day whether or not BGeometrics answered, so
  // an outage fills that window with null MVRVs.
  it('asks for enough rows to cover the whole staleness cap', () => {
    const limit = parseInt(
      new URL(snapshotQuery({ url: 'https://proj.supabase.co', key: 'k' }).url).searchParams.get('limit'),
      10,
    )
    expect(limit).toBe(SNAPSHOT_QUERY_LIMIT)
    expect(limit).toBeGreaterThan(MAX_SNAPSHOT_AGE_DAYS)
  })

  // The scenario that check exists for, end to end: BGeometrics has been down
  // for days, every recent row has a null MVRV, and a usable one is still
  // inside the cap.
  it('still finds a usable row after a multi-day gap of MVRV-less rows', () => {
    const rows = []
    for (let i = 0; i < SNAPSHOT_QUERY_LIMIT; i++) {
      const day = new Date(NOW - i * 86_400_000).toISOString().slice(0, 10)
      rows.push(row(day, i < 5
        ? { mvrv_value: null, mvrv_date: null }
        : { mvrv_value: 2.05, mvrv_date: new Date(NOW - (i + 1) * 86_400_000).toISOString().slice(0, 10) }))
    }
    expect(pickSnapshotMvrv(rows, { now: NOW })?.value).toBe(2.05)
  })

  it('tolerates a trailing slash on the project URL', () => {
    expect(snapshotQuery({ url: 'https://proj.supabase.co/', key: 'k' }).url)
      .toContain('https://proj.supabase.co/rest/v1/')
  })

  // src/lib/supabase.js fails soft when its vars are absent; so does this, so a
  // missing var is a missing fallback rather than a crashed route.
  it('returns null when either project var is absent', () => {
    expect(snapshotQuery({ url: 'https://proj.supabase.co' })).toBeNull()
    expect(snapshotQuery({ key: 'k' })).toBeNull()
    expect(snapshotQuery()).toBeNull()
  })
})

describe('/api/chain-data fallback', () => {
  const BGEOM = 'https://api.bgeometrics.com/v1/mvrv'
  let res, headers

  function makeRes() {
    headers = {}
    return {
      setHeader: (k, v) => { headers[k] = v },
      status(code) { this.statusCode = code; return this },
      json(body) { this.body = body; return this },
    }
  }

  // Routes each URL to a canned response; anything unrouted throws, so a test
  // cannot pass by accidentally reaching a real host.
  function routeFetch(routes) {
    return vi.fn(async (url) => {
      for (const [match, reply] of Object.entries(routes)) {
        if (String(url).startsWith(match)) return reply()
      }
      throw new Error(`unrouted fetch: ${url}`)
    })
  }

  const ok   = (json) => () => ({ ok: true,  status: 200, json: async () => json })
  const fail = (status) => () => ({ ok: false, status, json: async () => ({}) })

  const liveMvrv = [{ d: '2026-08-05', mvrv: 2.42 }, { d: '2026-08-04', mvrv: 2.40 }]

  beforeEach(() => {
    res = makeRes()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.stubEnv('SUPABASE_URL', 'https://proj.supabase.co')
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('serves BGeometrics and never touches Supabase when the budget is intact', async () => {
    const fetchMock = routeFetch({ [BGEOM]: ok(liveMvrv) })
    vi.stubGlobal('fetch', fetchMock)

    await handler({ headers: {} }, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.mvrv).toEqual({ value: 2.42, date: '2026-08-05', source: 'live' })
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toEqual([BGEOM])
    expect(headers['Cache-Control']).toBe('s-maxage=86400, stale-while-revalidate=3600')
  })

  it('serves the stored MVRV when BGeometrics reports the quota exhausted', async () => {
    vi.stubGlobal('fetch', routeFetch({
      [BGEOM]: fail(429),
      'https://proj.supabase.co': ok([row('2026-08-06', FULL_ROW)]),
    }))

    await handler({ headers: {} }, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.mvrv).toEqual({ value: 2.15, date: '2026-08-05', source: 'snapshot' })
  })

  // BGeometrics answering 200 with an unusable number is not a working MVRV.
  // Treating it as one would cache a blank card for 24 hours and never consult
  // the fallback at all — the failure this whole route exists to remove.
  it('falls back when BGeometrics answers 200 with an unusable value', async () => {
    for (const mvrv of [null, undefined, 0, -1, '2.42', NaN]) {
      res = makeRes()
      vi.stubGlobal('fetch', routeFetch({
        [BGEOM]: ok([{ d: '2026-08-05', mvrv }]),
        'https://proj.supabase.co': ok([row('2026-08-06', FULL_ROW)]),
      }))

      await handler({ headers: {} }, res)

      expect(res.statusCode).toBe(200)
      expect(res.body.mvrv).toEqual({ value: 2.15, date: '2026-08-05', source: 'snapshot' })
    }
  })

  // A live number is fresh by definition, so a date it cannot print is worth a
  // missing caption, not a discarded value.
  it('keeps a live value whose date is unusable, without a date', async () => {
    vi.stubGlobal('fetch', routeFetch({ [BGEOM]: ok([{ d: 'not-a-date', mvrv: 2.42 }]) }))

    await handler({ headers: {} }, res)
    expect(res.body.mvrv).toEqual({ value: 2.42, date: null, source: 'live' })
  })

  // An env var declared and left empty is the shape .env.example ships and what
  // Vercel stores for a cleared field — it is not nullish, so `??` would accept
  // it and the documented VITE_ fallback would never fire.
  it('treats an empty project var as absent and uses the VITE_ pair', async () => {
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_ANON_KEY', '')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')

    vi.stubGlobal('fetch', routeFetch({
      [BGEOM]: fail(429),
      'https://proj.supabase.co': ok([row('2026-08-06', FULL_ROW)]),
    }))

    await handler({ headers: {} }, res)
    expect(res.body.mvrv.source).toBe('snapshot')
  })

  it('falls back when the BGeometrics call throws outright', async () => {
    vi.stubGlobal('fetch', routeFetch({
      [BGEOM]: () => { throw new Error('ECONNRESET') },
      'https://proj.supabase.co': ok([row('2026-08-06', FULL_ROW)]),
    }))

    await handler({ headers: {} }, res)
    expect(res.body.mvrv.source).toBe('snapshot')
  })

  // A fallback answer cached for a day would outlive the outage that caused it,
  // leaving a stale number on the card long after BGeometrics recovered.
  it('caches a fallback answer for an hour, not a day', async () => {
    vi.stubGlobal('fetch', routeFetch({
      [BGEOM]: fail(429),
      'https://proj.supabase.co': ok([row('2026-08-06', FULL_ROW)]),
    }))

    await handler({ headers: {} }, res)
    expect(headers['Cache-Control']).toBe('s-maxage=3600, stale-while-revalidate=3600')
  })

  it('still 503s when both sources are unavailable', async () => {
    vi.stubGlobal('fetch', routeFetch({
      [BGEOM]: fail(429),
      'https://proj.supabase.co': fail(500),
    }))

    await handler({ headers: {} }, res)
    expect(res.statusCode).toBe(503)
    expect(headers['Cache-Control']).toBe('s-maxage=3600, stale-while-revalidate=3600')
  })

  it('503s rather than serving a stale row past the cap', async () => {
    const old = '2026-07-01'
    vi.stubGlobal('fetch', routeFetch({
      [BGEOM]: fail(429),
      'https://proj.supabase.co': ok([row(old, { mvrv_value: 2.15, mvrv_date: old })]),
    }))

    await handler({ headers: {} }, res)
    expect(res.statusCode).toBe(503)
  })

  it('skips the Supabase read entirely when the project vars are absent', async () => {
    // Both name pairs, since the route reads the VITE_ ones as a fallback and a
    // local .env may well have them set.
    for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
      vi.stubEnv(name, undefined)
    }

    const fetchMock = routeFetch({ [BGEOM]: fail(429) })
    vi.stubGlobal('fetch', fetchMock)

    await handler({ headers: {} }, res)

    expect(res.statusCode).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // The allowlist this route already carries has to keep applying to the
  // fallback answer — it is the same quota-protecting response.
  it('keeps the CORS allowlist on a fallback answer', async () => {
    vi.stubGlobal('fetch', routeFetch({
      [BGEOM]: fail(429),
      'https://proj.supabase.co': ok([row('2026-08-06', FULL_ROW)]),
    }))

    await handler({ headers: { origin: 'https://bitcoinvibecheck.com' } }, res)

    expect(headers['Access-Control-Allow-Origin']).toBe('https://bitcoinvibecheck.com')
    expect(headers['Vary']).toBe('Origin')
  })
})
