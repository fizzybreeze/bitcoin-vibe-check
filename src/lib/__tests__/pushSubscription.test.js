import { describe, it, expect } from 'vitest'
import { isSubscriptionStored, subscriptionRow } from '../pushSubscription.js'

// A stand-in for the browser's PushSubscription. Only `toJSON()` is modelled,
// because that is the only thing the module is allowed to read — see below.
function fakeSubscription(json) {
  return { endpoint: json?.endpoint, toJSON: () => json }
}

const REAL = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91bHun4MxP5egoK',
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
}

describe('subscriptionRow', () => {
  it('maps a real subscription to the three stored columns', () => {
    expect(subscriptionRow(fakeSubscription(REAL))).toEqual({
      endpoint: REAL.endpoint,
      p256dh: REAL.keys.p256dh,
      auth: REAL.keys.auth,
    })
  })

  it('reads the keys through toJSON, not off the instance', () => {
    // There is no `subscription.keys` in the Push API — only
    // `getKey('p256dh')` returning an ArrayBuffer. Reading the property would
    // give undefined against a real browser while passing any fixture that
    // happened to carry one, which is the worst combination available.
    const instanceOnly = {
      endpoint: REAL.endpoint,
      keys: REAL.keys,
      toJSON: () => ({ endpoint: REAL.endpoint }),
    }
    expect(subscriptionRow(instanceOnly)).toBeNull()
  })

  it('refuses a subscription with no keys', () => {
    expect(subscriptionRow(fakeSubscription({ endpoint: REAL.endpoint }))).toBeNull()
    expect(subscriptionRow(fakeSubscription({ ...REAL, keys: { p256dh: REAL.keys.p256dh } }))).toBeNull()
    expect(subscriptionRow(fakeSubscription({ ...REAL, keys: { auth: REAL.keys.auth } }))).toBeNull()
  })

  it('refuses an endpoint the table would reject anyway', () => {
    // Mirrors push_subscriptions_endpoint_https. Sending a row the CHECK
    // constraint will bounce is a round trip to learn something knowable here.
    expect(subscriptionRow(fakeSubscription({ ...REAL, endpoint: 'http://insecure.example/x' }))).toBeNull()
    expect(subscriptionRow(fakeSubscription({ ...REAL, endpoint: 'https://x' }))).toBeNull()
    expect(subscriptionRow(fakeSubscription({ ...REAL, endpoint: `https://${'x'.repeat(3000)}` }))).toBeNull()
  })

  it('refuses an oversized key', () => {
    expect(subscriptionRow(fakeSubscription({ ...REAL, keys: { ...REAL.keys, auth: 'a'.repeat(300) } }))).toBeNull()
  })

  it('returns null rather than throwing on nothing at all', () => {
    expect(subscriptionRow(null)).toBeNull()
    expect(subscriptionRow(undefined)).toBeNull()
    expect(subscriptionRow({})).toBeNull()
    expect(subscriptionRow({ toJSON: () => { throw new Error('boom') } })).toBeNull()
  })
})

describe('isSubscriptionStored', () => {
  it('treats a clean insert as stored', () => {
    expect(isSubscriptionStored(null)).toBe(true)
    expect(isSubscriptionStored(undefined)).toBe(true)
  })

  it('treats a duplicate endpoint as stored, not as a failure', () => {
    // Re-subscribing in the same browser yields the same endpoint, so the
    // second visit inserts a row that is already there. The end state the user
    // asked for — "this device is subscribed" — is true either way, and
    // reporting failure would make the toggle refuse to turn on for anyone who
    // had ever turned it on before. Measured against the real table: with
    // insert-only RLS a duplicate returns 23505, and upsert is not available
    // because ON CONFLICT DO NOTHING is refused (42501) with no SELECT policy.
    expect(isSubscriptionStored({ code: '23505' })).toBe(true)
    expect(isSubscriptionStored({ status: 409 })).toBe(true)
  })

  it('treats a real failure as not stored', () => {
    // 42501 is what a missing INSERT policy or a revoked grant looks like, and
    // 23514 is the CHECK constraint. Both mean nothing was written, so the
    // browser must not be left holding a subscription the server never saw.
    expect(isSubscriptionStored({ code: '42501' })).toBe(false)
    expect(isSubscriptionStored({ code: '23514' })).toBe(false)
    expect(isSubscriptionStored({ message: 'Failed to fetch' })).toBe(false)
  })
})
