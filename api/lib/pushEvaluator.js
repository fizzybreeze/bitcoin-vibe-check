// Which stored rules have crossed, what each one says, and what a push
// service's answer means for the row that produced it (roadmap §4.1b).
//
// Pure, and this is the module the whole item rests on. The browser evaluates
// an alert on a price tick; this evaluates the same alert five minutes later
// against metrics it fetched itself. §3.4a extracted `hasAlertCrossed` so that
// those two can never disagree — so nothing here re-decides when a rule fires.
// What it decides is everything *around* that: which sources have to be fetched
// at all, which currency a rule is measured in, what the payload says, and
// which rules survive into the next tick.
//
// It also treats the stored rules as untrusted, because they are. They arrive
// through a public `UPDATE` on a table whose key ships in the client bundle, so
// "the browser wrote them" is a description of the happy path, not a guarantee.
// `migrateStoredRules` is the screen, reused rather than reimplemented.

import {
  alertNotificationBody,
  hasAlertCrossed,
  migrateStoredRules,
  readAlertMetric,
} from '../../src/lib/alertRules.js'

/** Title on every notification this sender produces. */
export const PUSH_TITLE = 'Bitcoin Vibe Check'

/**
 * Which upstreams a set of rules actually needs.
 *
 * The evaluator runs every five minutes forever, against four keyless public
 * APIs that owe this project nothing. Fetching all of them on every tick to
 * serve rules that ask for none of them is how a free source stops being
 * available — so a tick with no Mayer rule does not pull 200 daily candles, and
 * a tick with no rules at all makes no upstream request whatsoever.
 *
 * `mayer` needs two: the multiple is a live price over a 200-day mean, and
 * neither half is derivable from the other.
 *
 * Currencies are deliberately *not* narrowed the same way. Kraken prices every
 * pair this app knows about in one request, so asking for the one a rule needs
 * saves nothing and invents a coupling — `mayer` is not currency-scoped and
 * still needs the USD price, which is exactly the sort of implicit dependency a
 * per-currency filter would drop on the first refactor.
 */
const SOURCES_FOR_METRIC = {
  price: ['ticker'],
  fee:   ['fees'],
  fng:   ['fng'],
  mayer: ['ticker', 'ohlc'],
}

export function requiredSources(rules) {
  const needed = new Set()
  if (!Array.isArray(rules)) return needed
  for (const rule of rules) {
    for (const source of SOURCES_FOR_METRIC[rule?.metric] ?? []) needed.add(source)
  }
  return needed
}

/**
 * One live reading → the metrics object `readAlertMetric` expects, in the
 * currency a given rule is scoped to.
 *
 * The browser holds one price, in whichever currency the header is showing.
 * This holds all five at once and has no "currently showing" — so the scoping
 * that is ambient in the tab has to be done per rule here, and getting it wrong
 * is a GBP alert fired on a dollar price. `readAlertMetric` refuses to match a
 * currency-scoped rule against a metrics object whose currency differs, which
 * is the check that makes this safe rather than merely careful.
 *
 * An absent price for that currency arrives as `null` and fires nothing, which
 * is the only correct behaviour: an upstream outage must not be able to look
 * like a crossing.
 */
export function metricsForCurrency(reading, currency) {
  const cur = typeof currency === 'string' ? currency.toLowerCase() : null
  return {
    currency: cur,
    price: cur ? (reading?.prices?.[cur] ?? null) : null,
    fee:   reading?.fee   ?? null,
    fng:   reading?.fng   ?? null,
    mayer: reading?.mayer ?? null,
  }
}

/**
 * What the browser's service worker is sent when a rule fires.
 *
 * The fields are exactly the ones `pushMessage.js` reads — it was written
 * against a sender that did not exist yet, and this is that sender. `tag` is
 * the rule's own id, so a rule that somehow fires twice replaces its own
 * notification rather than stacking a second copy on a lock screen; the two
 * modules agree that a *shared* tag would be wrong, because two different
 * alerts crossing in the same minute must not collapse into one.
 *
 * No `url`: `notificationTargetUrl` already collapses anything off-origin to
 * the dashboard, and the dashboard is where every one of these leads anyway.
 * Sending a field only to have the receiver normalise it away is a field that
 * can go wrong for nothing.
 */
export function pushPayload(rule, value) {
  const body = alertNotificationBody(rule, value)
  if (!body) return null
  return { title: PUSH_TITLE, body, tag: rule.id }
}

/**
 * A subscription's stored rules against one reading.
 *
 * Returns an entry per stored rule, in the order they were stored, each
 * carrying the raw entry it came from. That pairing is what lets the caller
 * write back a rules array that still contains the *stored* shape — the row
 * holds what the browser sent, not what this module reconstructed for its own
 * use, so an evaluation cannot quietly rewrite somebody's alerts into a
 * different form.
 *
 * `rule` is null for a stored entry that cannot fire at all: an unknown metric,
 * a threshold outside what the metric can be, a direction that is neither
 * above nor below, a price rule with no currency. Those are dropped rather than
 * kept, because they are not alerts that have not fired yet — they are alerts
 * that never can, and leaving them means carrying junk that a public write
 * endpoint put there for as long as the subscription lives.
 */
export function evaluateSubscription(rules, reading) {
  const stored = Array.isArray(rules) ? rules : []

  return stored.map(raw => {
    // Screened one at a time rather than as a batch, so an entry the migration
    // drops still lines up with the raw entry it came from. Reused rather than
    // rewritten: this evaluator and the panel have to agree about what a
    // well-formed rule is, and two copies of that is one too many.
    const rule = migrateStoredRules([raw])[0] ?? null
    if (!rule) return { raw, rule: null, crossed: false, value: null, payload: null }

    const metrics = metricsForCurrency(reading, rule.currency)
    const crossed = hasAlertCrossed(rule, metrics)
    if (!crossed) return { raw, rule, crossed: false, value: null, payload: null }

    const value = readAlertMetric(rule, metrics)
    return { raw, rule, crossed: true, value, payload: pushPayload(rule, value) }
  })
}

/** The rules that crossed and have something to send. */
export function firedEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter(e => e?.crossed && e.payload)
}

/**
 * The rules array to store back, given which of the fired ones were delivered.
 *
 * A rule leaves the row when its notification actually arrived, and not before.
 * That ordering is the whole reason this takes the delivered ids rather than
 * dropping everything that crossed: a push service having a bad minute would
 * otherwise consume the alert without ever showing it, and an alert that was
 * silently spent is indistinguishable to the visitor from one that never
 * worked. Leaving it armed costs at most a repeat five minutes later.
 *
 * The device's copy stays authoritative. The browser syncs the rules it still
 * considers pending, so an alert this sender consumed can legitimately come
 * back on the next visit — that is the visitor's own state re-asserting itself,
 * not a bug to defend against here.
 */
export function rulesAfterDelivery(entries, deliveredIds) {
  const delivered = deliveredIds instanceof Set ? deliveredIds : new Set(deliveredIds ?? [])
  return (Array.isArray(entries) ? entries : [])
    .filter(e => e?.rule)
    .filter(e => !(e.crossed && delivered.has(e.rule.id)))
    .map(e => e.raw)
}

/**
 * What a push service's HTTP status means for the subscription behind it.
 *
 * `gone` is the only answer that destroys anything, and it is deliberately the
 * narrowest: 404 and 410 are the two statuses that mean this endpoint will
 * never accept another push. Everything else keeps the row. A 429 or a 5xx is
 * the push service having a moment; a 400 or a 413 is *this* sender's bug and
 * deleting a subscriber's row over it would turn one bad payload into a silent
 * unsubscribe for everybody. 403 is the trap worth naming: it means the VAPID
 * signature was rejected, which happens when the key pair is rotated or
 * misconfigured — reaping on that would empty the table the first time somebody
 * pasted the wrong key.
 */
export function pushDelivery(status) {
  if (!Number.isFinite(status)) return 'failed'
  if (status >= 200 && status < 300) return 'delivered'
  if (status === 404 || status === 410) return 'gone'
  return 'failed'
}
