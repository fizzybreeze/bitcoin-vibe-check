import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// The picking rules are covered in vibeHistory.test.js. These cover the wiring,
// which those cannot: a query nobody issues, or a query issued against the
// wrong table, passes every one of them. Same reason supabase.test.js exists
// alongside supabaseEnv.test.js.

let client = null
vi.mock('../../lib/supabase.js', () => ({ get supabase() { return client } }))

const DAY_MS = 86_400_000
const NOW = Date.parse('2026-09-10T12:00:00Z')

function metrics() {
  return {
    fear_greed_value: 50, mayer_multiple: 1.2, mvrv_value: 2.0,
    price_change_30d_pct: 5, hashrate_trend_30d: 3,
    fee_fastest_sv: 8, mempool_tx_count: 90_000,
  }
}

function rowsEndingNow(count) {
  return Array.from({ length: count }, (_, i) => ({
    captured_on: new Date(NOW - i * DAY_MS).toISOString().slice(0, 10),
    metrics: metrics(),
  }))
}

// A stand-in for the supabase-js query builder: chainable, awaitable, and it
// records what it was asked for.
function stubClient(result) {
  const calls = {}
  const builder = {
    select: (cols) => { calls.select = cols; return builder },
    order:  (col, opts) => { calls.order = [col, opts]; return builder },
    limit:  (n) => { calls.limit = n; return Promise.resolve(result) },
  }
  return {
    calls,
    from: (table) => { calls.table = table; return builder },
  }
}

beforeEach(() => {
  client = null
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function importHook() {
  return (await import('../useVibeHistory.js')).default
}

describe('useVibeHistory', () => {
  it('reads the snapshot table and returns the series oldest first', async () => {
    const stub = stubClient({ data: rowsEndingNow(9), error: null })
    client = stub

    const useVibeHistory = await importHook()
    const { result } = renderHook(() => useVibeHistory())

    await waitFor(() => expect(result.current).toHaveLength(9))
    expect(stub.calls.table).toBe('metric_snapshots')
    expect(stub.calls.select).toBe('captured_on,metrics')
    expect(stub.calls.order).toEqual(['captured_on', { ascending: false }])
    expect(stub.calls.limit).toBe(30)
    // Ascending, which is the order the chart draws in.
    expect(result.current[0].dateMs).toBeLessThan(result.current[8].dateMs)
  })

  it('returns an empty series and issues no query when Supabase is unconfigured', async () => {
    // The soft-fail in src/lib/supabase.js. History must go quiet, not throw.
    client = null
    const useVibeHistory = await importHook()
    const { result } = renderHook(() => useVibeHistory())

    await waitFor(() => expect(result.current).toEqual([]))
  })

  it('returns an empty series when PostgREST answers with an error', async () => {
    // An error body carries data: null. Asserting the query was issued is what
    // separates "handled the error" from "never got that far", which is the
    // only way an empty-array assertion says anything at all here.
    const stub = stubClient({ data: null, error: { message: 'permission denied' } })
    client = stub
    const useVibeHistory = await importHook()
    const { result } = renderHook(() => useVibeHistory())

    await waitFor(() => expect(stub.calls.limit).toBe(30))
    expect(result.current).toEqual([])
  })

  it('returns an empty series when the request rejects outright', async () => {
    let issued = false
    client = { from: () => ({
      select: () => ({ order: () => ({ limit: () => {
        issued = true
        return Promise.reject(new Error('offline'))
      } }) }),
    }) }
    const useVibeHistory = await importHook()
    const { result } = renderHook(() => useVibeHistory())

    await waitFor(() => expect(issued).toBe(true))
    expect(result.current).toEqual([])
  })
})
