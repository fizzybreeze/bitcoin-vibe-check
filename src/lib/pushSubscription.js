// A browser `PushSubscription` as a `push_subscriptions` row, and what the
// insert's outcome means.
//
// Pure for the usual reason: the only way to produce a real PushSubscription
// is a real browser with a real push service behind it, so the shaping and the
// error classification would otherwise only be exercisable by subscribing by
// hand and watching.

// Mirrors the CHECK constraints in
// supabase/migrations/20260808100000_create_push_subscriptions.sql. Duplicated
// deliberately: the client check turns a doomed request into a clear local
// failure, and the server check is the one that actually enforces anything,
// because the endpoint in front of it is a public write.
const MIN_ENDPOINT_LENGTH = 20
const MAX_ENDPOINT_LENGTH = 2048
const MAX_KEY_LENGTH = 255

// Postgres unique_violation. PostgREST surfaces it as HTTP 409 with this code
// on the supabase-js error object.
const UNIQUE_VIOLATION = '23505'

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * `PushSubscription` → the row to insert, or `null` if it is not storable.
 *
 * Reads through `toJSON()` rather than the instance properties: `endpoint` is
 * an own property but `keys` is not — there is no `subscription.keys`, only
 * `getKey('p256dh')` returning an ArrayBuffer. `toJSON()` is the one call that
 * hands over both already base64url-encoded, which is the form the sender
 * needs and the form the column stores.
 */
export function subscriptionRow(subscription) {
  let json
  try {
    json = subscription?.toJSON?.()
  } catch {
    return null
  }
  if (!json) return null

  const endpoint = text(json.endpoint)
  const p256dh = text(json.keys?.p256dh)
  const auth = text(json.keys?.auth)

  if (!endpoint.startsWith('https://')) return null
  if (endpoint.length < MIN_ENDPOINT_LENGTH || endpoint.length > MAX_ENDPOINT_LENGTH) return null
  if (!p256dh || p256dh.length > MAX_KEY_LENGTH) return null
  if (!auth || auth.length > MAX_KEY_LENGTH) return null

  return { endpoint, p256dh, auth }
}

/**
 * Did this insert leave the browser subscribed?
 *
 * A duplicate endpoint is **success**, not failure. Re-subscribing in the same
 * browser yields the same endpoint, so the second visit inserts a row that is
 * already there — and the desired end state, "this endpoint is stored", is
 * already true. Measured against the real table rather than assumed: with
 * insert-only RLS a plain duplicate insert returns 23505, and an upsert is not
 * an escape hatch, because `ON CONFLICT DO NOTHING` is refused outright
 * (42501) without a SELECT policy to see the conflicting row with.
 */
export function isSubscriptionStored(error) {
  if (!error) return true
  return error.code === UNIQUE_VIOLATION || error.status === 409
}
