// The browser's half of syncing alert rules to its push subscription.
//
// Pure for the usual reason: everything here is only exercisable end-to-end by
// a real browser holding a real subscription against a real table, and the
// interesting cases — a secret that was never generated, a rule list too long
// for the column, rules that cannot fire anyway — all have to be decided
// somewhere a test can reach.

// Per-browser, not per-endpoint. Re-subscribing in the same browser yields the
// same endpoint, so one secret is enough; keying by endpoint would strand the
// secret the moment the endpoint changed and leave a row nobody could write.
const SECRET_KEY = 'btc-vibe-push-secret'

// Mirrors push_subscriptions_rules_bounded. Sending more than the column
// accepts is a round trip to learn something knowable here.
export const MAX_SYNCED_RULES = 50

/**
 * The rule fields the evaluator actually needs, and nothing else.
 *
 * `label` and `triggered` stay on the device. The label is display text the
 * sender composes for itself from the metric registry, and `triggered` is
 * per-browser state — a rule that already fired locally still has to fire on
 * the phone, because those are two different notifications.
 *
 * Sending less is the point: this row is the first thing about a visitor that
 * leaves their machine, so it carries the minimum that makes the feature work.
 */
export function syncableRules(alerts) {
  if (!Array.isArray(alerts)) return []
  return alerts
    // A rule that has already fired is not waiting for anything.
    .filter(a => a && !a.triggered)
    .slice(0, MAX_SYNCED_RULES)
    .map(a => ({
      id: a.id,
      metric: a.metric,
      threshold: a.threshold,
      direction: a.direction,
      // Only when the metric is scoped to one — `alertRules.js` refuses to
      // match a currency-scoped rule with no currency, so sending `null`
      // would store a rule that can never fire.
      ...(a.currency ? { currency: a.currency } : {}),
    }))
}

/**
 * A fresh 256-bit secret, hex.
 *
 * `crypto.getRandomValues`, not `Math.random`: this is the only thing standing
 * between one browser's subscription and anybody else who holds the anon key.
 */
export function generatePushSecret() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 of the secret, hex — the only form that reaches the database. */
export async function hashPushSecret(secret) {
  if (typeof secret !== 'string' || !secret) return ''
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The secret this browser already has, or a new one, persisted.
 *
 * Returns `''` when storage is unavailable rather than inventing a secret that
 * cannot be persisted: a secret the browser will forget is worse than none,
 * because the row it creates could then never be written to again.
 */
export function readOrCreatePushSecret() {
  try {
    const existing = localStorage.getItem(SECRET_KEY)
    if (typeof existing === 'string' && /^[0-9a-f]{64}$/.test(existing)) return existing
    const secret = generatePushSecret()
    localStorage.setItem(SECRET_KEY, secret)
    return secret
  } catch {
    return ''
  }
}

export function readPushSecret() {
  try {
    const existing = localStorage.getItem(SECRET_KEY)
    return typeof existing === 'string' && /^[0-9a-f]{64}$/.test(existing) ? existing : ''
  } catch {
    return ''
  }
}
