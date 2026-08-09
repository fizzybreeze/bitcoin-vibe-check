import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { hashPushSecret } from '../../lib/pushRules.js'

// Stubbed rather than mocked away: this hook's whole job is to read browser
// state correctly, so replacing it with a fake that always answers would test
// nothing. `supabase` is the one real module stubbed, because there is no
// project to insert into here.
const insert = vi.fn(async () => ({ error: null }))
const eq = vi.fn()
let syncError = null

// Faithful to PostgREST rather than permissive, which is the whole reason the
// v1.7.8 sync could ship broken and green: the old mock had no `.eq` in the
// chain and resolved to success unconditionally, so a filter the real API
// *requires* was neither sent nor missed. Awaiting the update with no filter
// now answers the way the server does — 21000, "UPDATE requires a WHERE
// clause" — so dropping `.eq` turns this suite red instead of silently
// reproducing the outage.
const update = vi.fn(() => ({
  then: resolve => resolve({
    error: { code: '21000', message: 'UPDATE requires a WHERE clause' },
  }),
  eq: (column, value) => {
    eq(column, value)
    return Promise.resolve({ error: syncError })
  },
}))

const pushClientFor = vi.fn(secret => (secret ? {
  from: () => ({ update: (...args) => update(...args) }),
} : null))
vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: () => ({ insert: (...args) => insert(...args) }) },
  pushRulesClientFor: (...args) => pushClientFor(...args),
}))

const {
  usePushSubscription, PUSH_LOADING, PUSH_UNSUPPORTED, PUSH_UNCONFIGURED,
  PUSH_BLOCKED, PUSH_OFF, PUSH_ON, PUSH_FAILED, PUSH_FAIL_SERVICE, PUSH_FAIL_STORAGE,
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
  insert.mockClear(); update.mockClear(); pushClientFor.mockClear(); eq.mockClear()
  syncError = null
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
    // Was PUSH_OFF until v1.7.15, and that was the reported bug in miniature:
    // dropping the subscription is right, but reporting the attempt as though
    // it never happened leaves the visitor pressing a toggle that keeps
    // springing back. It failed, so it says so.
    expect(result.current.pushStatus).toBe(PUSH_FAILED)
    expect(result.current.pushFailReason).toBe(PUSH_FAIL_STORAGE)
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

  it('syncs rules filtered on the secret hash, scoped by the secret header', async () => {
    // Filtered on `secret_hash`, not on `endpoint`: an endpoint is a capability
    // and a durable browser identifier, and a readable endpoint column is an
    // enumeration oracle. The hash is something this browser can recompute from
    // the secret it already holds.
    //
    // It is filtered *at all* because PostgREST refuses an unfiltered UPDATE
    // with 21000 before Postgres sees it — which is what v1.7.8 shipped, and
    // why every sync silently failed until v1.7.16.
    const SECRET = 'a'.repeat(64)
    const { pushManager } = stubBrowser({ existing: SUBSCRIPTION })
    stubBrowser({ ready: Promise.resolve({ pushManager }) })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_ON))

    localStorage.setItem('btc-vibe-push-secret', SECRET)
    let ok
    await act(async () => { ok = await result.current.syncPushRules([
      { id: 'r1', metric: 'price', threshold: 80000, direction: 'above', currency: 'usd', label: '$80,000' },
    ]) })

    expect(ok).toBe(true)
    expect(pushClientFor).toHaveBeenCalledWith(SECRET)
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0]).toEqual({
      rules: [{ id: 'r1', metric: 'price', threshold: 80000, direction: 'above', currency: 'usd' }],
    })
    // The filter is the hash of the secret, never the secret itself — the
    // secret only ever travels in the header.
    expect(eq).toHaveBeenCalledWith('secret_hash', await hashPushSecret(SECRET))
    expect(eq.mock.calls[0][1]).not.toBe(SECRET)
  })

  it('says so when the sync is refused, instead of failing into a void', async () => {
    // Nothing awaits `syncPushRules`, so a silent `return false` is invisible:
    // the subscription simply keeps `rules: []` and the sender has nothing to
    // send. That is exactly how the v1.7.8 breakage survived undetected.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    syncError = { code: '42501', message: 'permission denied' }

    const { pushManager } = stubBrowser({ existing: SUBSCRIPTION })
    stubBrowser({ ready: Promise.resolve({ pushManager }) })
    const { result } = renderHook(() => usePushSubscription())
    await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_ON))

    localStorage.setItem('btc-vibe-push-secret', 'b'.repeat(64))
    let ok
    await act(async () => { ok = await result.current.syncPushRules([]) })

    expect(ok).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('permission denied'))
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

  // The v1.7.15 report: permission granted in Brave, toggle pressed, switch
  // springs back to off with nothing on screen and nothing in the console.
  // `subscribe()` ended in a bare `catch {}`, so a browser *refusing* to
  // register was indistinguishable from never having pressed the toggle.
  describe('when the browser refuses to register', () => {
    // Exactly what Brave does with "Use Google services for push messaging"
    // off: permission is granted, and the registration is refused afterwards.
    const refuse = () => Object.assign(
      new Error('Registration failed - push service not available'), { name: 'AbortError' }
    )

    async function refusedSubscribe() {
      const { pushManager } = stubBrowser()
      pushManager.subscribe = vi.fn(async () => { throw refuse() })
      stubBrowser({ ready: Promise.resolve({ pushManager }) })
      const view = renderHook(() => usePushSubscription())
      await waitFor(() => expect(view.result.current.pushStatus).toBe(PUSH_OFF))
      view.pushManager = pushManager
      return view
    }

    it('reports the failure instead of falling back to off', async () => {
      const { result } = await refusedSubscribe()
      await act(async () => { await result.current.subscribePush() })

      expect(result.current.pushStatus).toBe(PUSH_FAILED)
      expect(result.current.pushFailReason).toBe(PUSH_FAIL_SERVICE)
    })

    it('leaves a trail in the console, which it previously did not', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { result } = await refusedSubscribe()
      await act(async () => { await result.current.subscribePush() })

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('AbortError'))
    })

    it('does not leave the toggle disabled afterwards', async () => {
      const { result } = await refusedSubscribe()
      await act(async () => { await result.current.subscribePush() })

      expect(result.current.pushBusy).toBe(false)
    })

    it('clears the failure once a retry works', async () => {
      const view = await refusedSubscribe()
      await act(async () => { await view.result.current.subscribePush() })
      expect(view.result.current.pushStatus).toBe(PUSH_FAILED)

      view.pushManager.subscribe = vi.fn(async () => SUBSCRIPTION)
      await act(async () => { await view.result.current.subscribePush() })

      expect(view.result.current.pushStatus).toBe(PUSH_ON)
      expect(view.result.current.pushFailReason).toBeNull()
    })

    // A refused registration and a refused insert need different advice — one
    // is a browser setting the visitor can change, the other is ours.
    it('separates a refused registration from a refused insert', async () => {
      insert.mockResolvedValueOnce({ error: { code: '42501', message: 'permission denied' } })
      const { pushManager } = stubBrowser()
      stubBrowser({ ready: Promise.resolve({ pushManager }) })
      const { result } = renderHook(() => usePushSubscription())
      await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_OFF))

      await act(async () => { await result.current.subscribePush() })

      expect(result.current.pushStatus).toBe(PUSH_FAILED)
      expect(result.current.pushFailReason).toBe(PUSH_FAIL_STORAGE)
    })

    // v1.7.6's rule, which the new failure states must not have broken:
    // re-subscribing in the same browser yields the same endpoint, so a
    // duplicate insert means "already stored", not "failed".
    it('still counts a duplicate endpoint as on', async () => {
      insert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } })
      const { pushManager } = stubBrowser()
      stubBrowser({ ready: Promise.resolve({ pushManager }) })
      const { result } = renderHook(() => usePushSubscription())
      await waitFor(() => expect(result.current.pushStatus).toBe(PUSH_OFF))

      await act(async () => { await result.current.subscribePush() })

      expect(result.current.pushStatus).toBe(PUSH_ON)
      expect(result.current.pushFailReason).toBeNull()
    })
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
