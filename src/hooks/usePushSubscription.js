import { useCallback, useEffect, useState } from 'react'
import { supabase, pushRulesClientFor } from '../lib/supabase.js'
import { readVapidPublicKey, urlBase64ToUint8Array } from '../lib/vapid.js'
import { isSubscriptionStored, subscriptionRow } from '../lib/pushSubscription.js'
import {
  hashPushSecret, readOrCreatePushSecret, readPushSecret, syncableRules,
} from '../lib/pushRules.js'

// Push status, as one value rather than a pile of booleans — the panel has to
// render exactly one of these and a boolean soup makes "supported but
// unconfigured" and "configured but blocked" indistinguishable at the call
// site.
export const PUSH_LOADING = 'loading'            // still reading the real state
export const PUSH_UNSUPPORTED = 'unsupported'   // no service worker / Push API
export const PUSH_UNCONFIGURED = 'unconfigured' // no VAPID key or no Supabase
export const PUSH_BLOCKED = 'blocked'           // notifications denied
export const PUSH_OFF = 'off'
export const PUSH_ON = 'on'
// Turning it on was attempted and did not work. A seventh state rather than a
// return to `off`, because those two look identical on a toggle and mean
// opposite things to the person looking at it: `off` says "you have not tried",
// and this says "you tried and the browser refused".
export const PUSH_FAILED = 'failed'

// Why it failed, for the panel's copy. Two reasons rather than one string,
// because the remedies have nothing in common — one is a browser setting the
// visitor can change, the other is this site's problem and retrying is all they
// can usefully do.
export const PUSH_FAIL_SERVICE = 'push-service' // the browser refused to subscribe
export const PUSH_FAIL_STORAGE = 'storage'     // subscribed, but the row would not store

// `navigator.serviceWorker.ready` never settles when no worker is registered.
// Measured in Chromium rather than assumed: on a page with no registration it
// was still pending after two seconds, and it never rejects — there is no
// failure path to catch, only a wait that does not end. Awaiting it unguarded
// would pin `busy` on for the life of the page and leave the toggle disabled
// with no error, which is the v1.6.10 trap in a different API.
//
// Five seconds: the worker is registered on `window.load`, so a healthy page
// resolves this in milliseconds. Anything approaching the deadline means the
// registration failed, which is a state to render, not to keep waiting on.
const SW_READY_TIMEOUT_MS = 5000

function activeRegistration() {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise(resolve => { setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS) }),
  ])
}

function browserSupportsPush() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  )
}

/**
 * The browser's half of Web Push: is this device subscribed, and the two calls
 * that change that.
 *
 * Deliberately does **not** request notification permission. `useMetricAlerts`
 * already owns a `requestPermission` that shares a request already in flight,
 * and Chromium leaves a *concurrent* `Notification.requestPermission()`
 * unsettled for good — the defect v1.7.4 exists to fix. A second permission
 * path here would reintroduce exactly that race from a different direction, so
 * `App` funnels both through the one deduped request and only then calls
 * `subscribe`, by which point permission is granted and `pushManager.subscribe`
 * has nothing left to prompt for.
 */
export function usePushSubscription() {
  // Starts at LOADING, not UNSUPPORTED. The real state cannot be known until
  // the registration resolves, and opening on "this browser does not support
  // push" would flash a claim that is usually false.
  const [status, setStatus] = useState(PUSH_LOADING)
  const [busy, setBusy] = useState(false)
  const [failReason, setFailReason] = useState(null)

  const vapidKey = readVapidPublicKey(import.meta.env)
  // A push nobody can store is not a subscription, it is a notification
  // permission with extra steps — so a missing Supabase client is
  // "unconfigured" rather than a subscribe that silently keeps nothing.
  const configured = Boolean(vapidKey) && Boolean(supabase)

  // Read the real state once on mount. `pushManager.getSubscription()` is the
  // only truth here: the table cannot be read back (no SELECT policy, by
  // design), and localStorage would go stale the moment a visitor revoked the
  // permission from browser settings.
  useEffect(() => {
    let cancelled = false

    async function read() {
      if (!browserSupportsPush()) return setStatus(PUSH_UNSUPPORTED)
      if (!configured) return setStatus(PUSH_UNCONFIGURED)
      if (Notification.permission === 'denied') return setStatus(PUSH_BLOCKED)
      try {
        const registration = await activeRegistration()
        // No worker means no push, whatever the browser is capable of.
        if (!registration) {
          if (!cancelled) setStatus(PUSH_UNSUPPORTED)
          return
        }
        const existing = await registration.pushManager.getSubscription()
        if (!cancelled) setStatus(existing ? PUSH_ON : PUSH_OFF)
      } catch {
        if (!cancelled) setStatus(PUSH_OFF)
      }
    }

    read()
    return () => { cancelled = true }
  }, [configured])

  const subscribe = useCallback(async () => {
    if (!browserSupportsPush() || !configured) return false
    if (Notification.permission !== 'granted') {
      setStatus(Notification.permission === 'denied' ? PUSH_BLOCKED : PUSH_OFF)
      return false
    }

    setBusy(true)
    // Clear any previous failure, so a retry that works does not leave the
    // panel explaining a problem that is over.
    setFailReason(null)
    try {
      const registration = await activeRegistration()
      if (!registration) {
        // Was `return false` with the status untouched, which left the toggle
        // sitting at `off` as though nothing had been asked of it.
        setStatus(PUSH_UNSUPPORTED)
        return false
      }
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          // Required by Chrome, and honest: every push this app sends shows a
          // notification. `src/sw.js` has no silent path.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        }))

      // The secret is generated before the row exists, because its hash is
      // part of the row: without it the subscription is stored but no browser
      // can ever write rules to it, and the RLS policy has nothing to match.
      const secret = readOrCreatePushSecret()
      const secretHash = secret ? await hashPushSecret(secret) : ''

      const row = subscriptionRow(subscription)
      if (!row || !secretHash) {
        // A subscription we cannot describe is one the sender could never
        // encrypt for, so it is not a subscription worth keeping — drop it
        // rather than leave the browser holding something that will never
        // deliver. Same reasoning as the insert-failed path below.
        await subscription.unsubscribe().catch(() => {})
        console.warn('[push] subscription could not be shaped into a row — not storing')
        setStatus(PUSH_FAILED)
        setFailReason(PUSH_FAIL_STORAGE)
        return false
      }

      const { error } = await supabase
        .from('push_subscriptions')
        .insert({ ...row, secret_hash: secretHash })
      // No `.select()`. There is no SELECT policy on this table, so asking
      // PostgREST to return the inserted row would turn every successful
      // subscribe into a 403.
      if (!isSubscriptionStored(error)) {
        // Leave no subscription the server does not know about: it would
        // report "on" forever and never receive anything.
        await subscription.unsubscribe().catch(() => {})
        console.warn(`[push] could not store subscription: ${error?.message ?? 'unknown error'}`)
        setStatus(PUSH_FAILED)
        setFailReason(PUSH_FAIL_STORAGE)
        return false
      }

      setStatus(PUSH_ON)
      return true
    } catch (err) {
      // The bare `catch {}` this replaces is the whole defect behind "I granted
      // permission and the toggle just stayed off". `pushManager.subscribe()`
      // rejecting is not exotic — it is the ordinary outcome in any browser
      // whose push service is unavailable, which includes Brave with its
      // default "Use Google services for push messaging" setting off. Swallowed
      // silently, that is indistinguishable from never having pressed the
      // toggle, and there was nothing in the console either.
      console.warn(`[push] subscribe failed: ${err?.name ?? 'Error'} — ${err?.message ?? ''}`)
      setStatus(PUSH_FAILED)
      setFailReason(PUSH_FAIL_SERVICE)
      return false
    } finally {
      setBusy(false)
    }
  }, [configured, vapidKey])

  const unsubscribe = useCallback(async () => {
    if (!browserSupportsPush()) return false
    setBusy(true)
    setFailReason(null)
    try {
      const registration = await activeRegistration()
      const existing = registration ? await registration.pushManager.getSubscription() : null
      // Browser-side only, and that is the design rather than a shortcut. The
      // table has no DELETE policy — PostgREST honours an unfiltered DELETE,
      // so a policy permissive enough to erase your own row is permissive
      // enough to erase everybody's. `unsubscribe()` invalidates the endpoint
      // at the push service, so nothing can be delivered to it whatever the
      // row says, and §4.1b's sender reaps it on the first 410 Gone.
      if (existing) await existing.unsubscribe()
      setStatus(PUSH_OFF)
      return true
    } catch {
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  /**
   * Replace this subscription's stored rules.
   *
   * The update is deliberately **unfiltered**, which looks alarming and is the
   * point of the design: `.eq('endpoint', …)` would need SELECT on that column,
   * which anon does not have and must not get — a readable endpoint column is
   * an enumeration oracle. Instead RLS scopes the statement, matching only the
   * row whose `secret_hash` equals the hash of the header this client carries.
   * Measured against the real table: an unfiltered update presenting one
   * browser's secret affected 1 row, not 2.
   *
   * No `.select()`, for the same reason as the insert — there is no SELECT
   * policy, so asking for the changed row back would 403 a successful write.
   */
  const syncRules = useCallback(async (alerts) => {
    if (status !== PUSH_ON) return false
    const client = pushRulesClientFor(readPushSecret())
    if (!client) return false
    try {
      const { error } = await client
        .from('push_subscriptions')
        .update({ rules: syncableRules(alerts) })
      return !error
    } catch {
      return false
    }
  }, [status])

  return {
    pushStatus: status,
    pushBusy: busy,
    pushFailReason: failReason,
    subscribePush: subscribe,
    unsubscribePush: unsubscribe,
    syncPushRules: syncRules,
  }
}
