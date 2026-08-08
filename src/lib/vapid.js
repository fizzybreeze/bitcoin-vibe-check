// The VAPID application server key, as the Push API needs it.
//
// Pure, because every failure here is silent in a way that is expensive to
// diagnose: `pushManager.subscribe()` answers a malformed key with a bare
// `InvalidAccessError` or `InvalidStateError` and no indication that the
// *environment variable* is the problem. A key that lost its last character
// to a copy-paste, or gained a trailing newline from a shell, looks exactly
// like a key that is fine.

// An uncompressed P-256 public point: one 0x04 prefix byte, then a 32-byte x
// and a 32-byte y. Every VAPID public key is exactly this — which makes it a
// real invariant to check rather than a length guess.
export const VAPID_KEY_BYTES = 65
const UNCOMPRESSED_POINT_PREFIX = 0x04

/**
 * base64url → Uint8Array.
 *
 * The two character substitutions are load-bearing: `atob` speaks standard
 * base64, and a key containing `-` or `_` decodes to the wrong bytes without
 * them — which produces a subscription the push service will reject, not an
 * error here.
 *
 * The padding is **not** load-bearing, and saying so is the point: `atob`
 * implements WHATWG forgiving-base64, which treats `=` as optional, and a real
 * 65-byte key (length % 4 === 3) decodes correctly unpadded. It stays as input
 * normalisation rather than as a fix for a failure that does not happen — no
 * test can distinguish it, and an earlier version of this comment claimed the
 * opposite, which is how it came to be checked.
 */
export function urlBase64ToUint8Array(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return null

  const padding = '='.repeat((4 - (trimmed.length % 4)) % 4)
  const base64 = (trimmed + padding).replace(/-/g, '+').replace(/_/g, '/')

  let raw
  try {
    raw = atob(base64)
  } catch {
    return null
  }

  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/**
 * Is this a key the Push API will accept?
 *
 * Checked here rather than left to the browser so a misconfigured deployment
 * reports itself as misconfigured — the subscribe button says "unavailable"
 * instead of throwing when someone taps it.
 */
export function isValidVapidPublicKey(value) {
  const bytes = urlBase64ToUint8Array(value)
  return Boolean(
    bytes && bytes.length === VAPID_KEY_BYTES && bytes[0] === UNCOMPRESSED_POINT_PREFIX
  )
}

/**
 * The configured key, or `''` when there is not a usable one.
 *
 * Blank counts as missing, the same rule `supabaseEnv.js` settled on in
 * v1.6.7: `.env.example` ships the variable declared and empty, and that is
 * also what a Vercel variable saved empty looks like. `??` would treat `''`
 * as configured and hand it to `subscribe()`.
 */
export function readVapidPublicKey(env) {
  const raw = env?.VITE_VAPID_PUBLIC_KEY
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  return isValidVapidPublicKey(trimmed) ? trimmed : ''
}
