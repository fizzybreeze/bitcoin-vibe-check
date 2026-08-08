import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// Stubbed rather than mocked away: this hook's whole job is to read browser
// state correctly, so replacing it with a fake that always answers would test
// nothing. `supabase` is the one real module stubbed, because there is no
// project to insert into here.
const insert = vi.fn(async () => ({ error: null }))
const update = vi.fn(async () => ({ error: null }))
const pushClientFor = vi.fn(secret => (secret ? {
  from: () => ({ update: (...args) => update(...args) }),
} : null))
vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: () => ({ insert: (...args) => insert(...args) }) },
  pushRulesClientFor: (...args) => pushClientFor(...args),
}))

const {
  usePushSubscription, PUSH_LOADING, PUSH_UNSUPPORTED, PUSH_UNCONFIGURED,
  PUSH_BLOCKED, PUSH_OFF, PUSH_ON,
} = await import('../usePushSubscription.js')

// A real key: 65 bytes, 0x04 prefix, base64url.
const VALID_KEY = (() => {
  const bytes = Uint8Array.from({ length: 65 }, (_, i) => (i === 0 ? 0x04 : i))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
})()

const SUBSCRIPTION = {
  toJSON: () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91bHun4MxP5egoK',
    keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' },
  }),
  unsubscribe: vi.fn(async () => true),
}

function stubBrowser({ ready, permission = 'granted', existing = null, key = VALID_KEY } = {}) {
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', key)

  const pushManager = {
    getSubscription: vi.fn(async () => existing),
    subscribe: vi.fn(async () => SUBSCRIPTION),
  }
  // `ready` defaults to a promise that never settles — the real behaviour when
  // no worker is registered, measured in Chromium.
  vi.stubGlobal('navigator', {
    serviceWorker: { ready: ready ?? new Promise(() => {}) },
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  const N = vi.fn()
  N.permission = permission
  vi.stubGlobal('Notification', N)
  return { pushManager }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.clear()
  insert.mockClear(); update.mockClear(); pushClientFor.mockClear()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('usePushSubscription', () => {
  it('opens on loading rather than claiming the browser cannot do push', () => {
    stubBrowser()
    const { result } = renderHook(() => usePushSubscription())
    // The very first render, before anything has been read.
    expect(result.current.pushStatus).toBe(PUSH_LOADING)
  })

  it('gives up on a service worker that never becomes ready', async () => {
    // `navigator.serviceWorker.ready` never settles when no worker is
    // registered — it does not reject, so there is nothing to catch. Without a
    // deadline this hook would sit on PUSH_LOADING for the life of the page.
    stubBrowser({ ready: new Promise(() => {}) })
    const { result } = renderHook(() => usePushSubscription())

    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_UNSUPPORTED))
  })

  it('never leaves the toggle disabled after a worker that never becomes ready', async () => {
    // The other half of the same defect: `busy` is set before the await and
    // cleared in `finally`, so an unsettled promise would disable the toggle
    // permanently with no error to explain it.
    stubBrowser({ ready: new Promise(() => {}) })
    const { result } = renderHook(() => usePushSubscription())

    let done
    await act(async () => { done = result.current.subscribePush() })
    expect(result.current.pushBusy).toBe(true)

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); await done })
    expect(result.current.pushBusy).toBe(false)
  })

  it('reports off when a ready worker has no subscription', async () => {
    const { pushManager } = stubBrowser()
    stubBrowser({ ready: Promise.resolve({ pushManager }) })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_OFF))
  })

  it('reports on when the browser already holds a subscription', async () => {
    const { pushManager } = stubBrowser({ existing: SUBSCRIPTION })
    stubBrowser({ ready: Promise.resolve({ pushManager }) })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_ON))
  })

  it('reports unconfigured when no VAPID key is set', async () => {
    stubBrowser({ key: '' })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_UNCONFIGURED))
  })

  it('reports blocked when notifications are denied', async () => {
    stubBrowser({ permission: 'denied' })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_BLOCKED))
  })

  it('stores the row without asking PostgREST to return it', async () => {
    // `.select()` after this insert would 403 against the real table, which
    // has no SELECT policy. The assertion is that nothing is chained.
    const { pushManager } = stubBrowser()
    stubBrowser({ ready: Promise.resolve({ pushManager }) })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_OFF))

    await act(async () => { await result.current.subscribePush() })

    expect(insert).toHaveBeenCalledTimes(1)
    // Still asserted exactly rather than with objectContaining: the point is
    // that nothing extra is sent to a table whose whole design is to hold the
    // minimum. `secret_hash` is checked in its own test below.
    expect(insert.mock.calls[0][0]).toEqual({
      endpoint: SUBSCRIPTION.toJSON().endpoint,
      p256dh: SUBSCRIPTION.toJSON().keys.p256dh,
      auth: SUBSCRIPTION.toJSON().keys.auth,
      secret_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(result.current.pushStatus).toBe(PUSH_ON)
  })

  it('keeps nothing it could not store', async () => {
    // A subscription the sender could never encrypt for is not a subscription.
    // Reporting success here would leave the toggle on forever against an
    // endpoint that receives nothing, which is the one outcome worse than
    // failing to subscribe at all.
    const malformed = { toJSON: () => ({ endpoint: 'https://push.example/x' }), unsubscribe: vi.fn(async () => true) }
    const { pushManager } = stubBrowser()
    pushManager.subscribe = vi.fn(async () => malformed)
    stubBrowser({ ready: Promise.resolve({ pushManager }) })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_OFF))

    let ok
    await act(async () => { ok = await result.current.subscribePush() })

    expect(ok).toBe(false)
    expect(insert).not.toHaveBeenCalled()
    expect(malformed.unsubscribe).toHaveBeenCalled()
    expect(result.current.pushStatus).toBe(PUSH_OFF)
  })

  it('stores the hash of a secret, never the secret', async () => {
    // The hash is what the RLS policy matches. Without it the subscription is
    // stored but no browser can ever write rules to it.
    const { pushManager } = stubBrowser()
    stubBrowser({ ready: Promise.resolve({ pushManager }) })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_OFF))
    await act(async () => { await result.current.subscribePush() })

    const row = insert.mock.calls[0][0]
    expect(row.secret_hash).toMatch(/^[0-9a-f]{64}$/)
    const secret = localStorage.getItem('btc-vibe-push-secret')
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
    // The secret itself must not be in the row under any key.
    expect(Object.values(row)).not.toContain(secret)
  })

  it('syncs rules with an unfiltered update, scoped by the secret header', async () => {
    // Deliberately unfiltered: `.eq('endpoint', …)` would need SELECT on that
    // column, which anon does not have and must not get — a readable endpoint
    // column is an enumeration oracle. RLS scopes the statement instead.
    const { pushManager } = stubBrowser({ existing: SUBSCRIPTION })
    stubBrowser({ ready: Promise.resolve({ pushManager }) })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_ON))

    localStorage.setItem('btc-vibe-push-secret', 'a'.repeat(64))
    let ok
    await act(async () => { ok = await result.current.syncPushRules([
      { id: 'r1', metric: 'price', threshold: 80000, direction: 'above', currency: 'usd', label: '$80,000' },
    ]) })

    expect(ok).toBe(true)
    expect(pushClientFor).toHaveBeenCalledWith('a'.repeat(64))
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0]).toEqual({
      rules: [{ id: 'r1', metric: 'price', threshold: 80000, direction: 'above', currency: 'usd' }],
    })
  })

  it('does not sync rules when push is off', async () => {
    // Writing rules for a subscription that does not exist would be a silent
    // no-op at best; the guard makes it an explicit one.
    const { pushManager } = stubBrowser()
    stubBrowser({ ready: Promise.resolve({ pushManager }) })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_OFF))

    // A usable secret is present on purpose, so the status guard is the only
    // thing that can stop this. Without it the test passed for the wrong
    // reason: no secret in storage meant no client, and the sync was refused
    // one layer further down than the assertion claimed.
    localStorage.setItem('btc-vibe-push-secret', 'b'.repeat(64))

    let ok
    await act(async () => { ok = await result.current.syncPushRules([]) })
    expect(ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('does not request notification permission itself', async () => {
    // `useMetricAlerts` owns the one deduped request. A second path here
    // would reintroduce Chromium's never-settling concurrent-request hang.
    const { pushManager } = stubBrowser()
    stubBrowser({ ready: Promise.resolve({ pushManager }) })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_OFF))
    await act(async () => { await result.current.subscribePush() })
    expect(Notification.requestPermission).toBeUndefined()
  })
})
