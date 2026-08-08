// What an alert *is*, and when it fires — with no React, no storage and no
// notification API in it.
//
// Pure for a reason the roadmap states explicitly (§3.4a → §4.1b): the same
// crossing test has to run in two places that share no runtime. The browser
// evaluates it on a price tick; the scheduled evaluator behind real push
// notifications will evaluate it server-side, against metrics it fetched
// itself. If those two disagree about when an alert fires, the bug is invisible
// on both sides — the tab shows one thing and the phone another, and neither
// is obviously wrong. One function, imported twice, is the whole defence.
//
// It is also why the rule shape names a *metric*. A rule that hard-codes price
// forces the evaluator to grow a second shape for fees, and a second predicate
// with it.

import { CURRENCY_META } from '../utils.js'

export const DEFAULT_ALERT_METRIC = 'price'

function formatCurrency(value, currency) {
  const cur = typeof currency === 'string' ? currency : 'usd'
  try {
    return new Intl.NumberFormat(CURRENCY_META[cur]?.locale ?? 'en-US', {
      style: 'currency',
      currency: cur.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    const sym = CURRENCY_META[cur]?.sym ?? '$'
    return `${sym}${Math.round(value).toLocaleString('en-US')}`
  }
}

function trimNumber(value, maxDecimals) {
  return Number(value.toFixed(maxDecimals)).toLocaleString('en-US')
}

/**
 * The metrics a rule may be written against.
 *
 * Adding one is a row here plus the field it reads on the metrics object —
 * nothing below this changes, and neither does the hook. Three things each
 * entry has to answer, because each is a place where metrics genuinely differ
 * rather than a place where uniformity was available:
 *
 * - `currencyScoped` — a price of 60,000 means nothing without saying in what.
 *   A fee tier in sat/vB has no such qualifier, and giving it one would invent
 *   a way for a rule to stop matching.
 * - `isValidValue` — "a positive number" is the right bound for a price and the
 *   wrong one for Fear & Greed, where 0 is a real reading and 140 is not. It
 *   screens the live reading as well as the threshold, deliberately: what a
 *   metric can plausibly be is one fact, and two predicates for it would be two
 *   places to disagree. Screening the reading is not theoretical — the Kraken
 *   WebSocket writes `Math.round(ticker.last)` behind a `!= null` check, so a
 *   zero frame reaches here as a number, and without this every pending `below`
 *   rule would fire at once quoting "Now $0".
 * - `format` — the label is written once, at creation, and is what the
 *   notification quotes back. Money, an index and a ratio do not format alike.
 *
 * The remaining fields are the panel's, and they live here rather than in
 * `PriceAlertsPanel.jsx` for one reason: a metric whose copy is somewhere else
 * is a metric someone can add and forget to describe, which shows up as a blank
 * placeholder and a validation message about prices on a fee alert.
 *
 * - `shortName` — the pill, and the prefix on each row. `name` is a sentence
 *   fragment ("BTC price has crossed…") and is too long for both.
 * - `unit` — the suffix beside the input. Null for currency-scoped metrics,
 *   which show the currency code there instead, and for Fear & Greed, which is
 *   an index of nothing.
 * - `colorDirection` — whether the row's arrow is tinted green for above and
 *   red for below. True for price only: up-is-green is a market convention that
 *   holds for a price and inverts for a fee, where a red down-arrow on "tell me
 *   when fees drop to 5" is bad-news styling on the good news the visitor
 *   actually asked to be told about.
 */
export const ALERT_METRICS = {
  price: {
    id: 'price',
    name: 'BTC price',
    shortName: 'Price',
    currencyScoped: true,
    isValidValue: v => Number.isFinite(v) && v > 0,
    format: (value, rule) => formatCurrency(value, rule?.currency),
    unit: null,
    colorDirection: true,
    placeholder: 'Target price',
    exampleValue: 80000,
    invalidMessage: 'Enter a price above zero.',
  },
  fee: {
    id: 'fee',
    name: 'Network fee',
    shortName: 'Fees',
    currencyScoped: false,
    isValidValue: v => Number.isFinite(v) && v > 0,
    format: value => `${trimNumber(value, 1)} sat/vB`,
    unit: 'sat/vB',
    colorDirection: false,
    placeholder: 'Fee level',
    exampleValue: 5,
    invalidMessage: 'Enter a fee above zero, in sat/vB.',
  },
  fng: {
    id: 'fng',
    name: 'Fear & Greed',
    shortName: 'Fear & Greed',
    currencyScoped: false,
    // 0 is a real reading and so is 100; 140 is not. This is the entry the
    // shared `v > 0` predicate would have been wrong for.
    isValidValue: v => Number.isFinite(v) && v >= 0 && v <= 100,
    format: value => trimNumber(value, 0),
    unit: null,
    colorDirection: false,
    placeholder: 'Index level',
    exampleValue: 20,
    invalidMessage: 'Enter an index level between 0 and 100.',
  },
  mayer: {
    id: 'mayer',
    name: 'Mayer Multiple',
    shortName: 'Mayer',
    currencyScoped: false,
    isValidValue: v => Number.isFinite(v) && v > 0,
    format: value => value.toFixed(2),
    unit: '×',
    colorDirection: false,
    placeholder: 'Multiple',
    exampleValue: 2.4,
    invalidMessage: 'Enter a multiple above zero.',
  },
}

export const ALERT_METRIC_IDS = Object.keys(ALERT_METRICS)

function normaliseCurrency(value) {
  return typeof value === 'string' ? value.toLowerCase() : null
}

/**
 * The current reading a rule is measured against, or null when there is none.
 *
 * Null covers three different situations on purpose — the metric is unknown,
 * it has not loaded, or the rule is scoped to a currency the dashboard is not
 * currently showing — because every one of them has the same right answer: do
 * not fire. A GBP alert must not be tested against a USD price, which is the
 * failure this check has always existed to prevent; it is merely no longer
 * specific to price.
 */
export function readAlertMetric(rule, metrics) {
  const meta = ALERT_METRICS[rule?.metric]
  if (!meta || !metrics || typeof metrics !== 'object') return null

  if (meta.currencyScoped) {
    const ruleCurrency = normaliseCurrency(rule.currency)
    const metricsCurrency = normaliseCurrency(metrics.currency)
    // Both absent must not read as "in scope". `migrateStoredRules` guarantees
    // a currency on every rule it returns, so this is unreachable from the
    // browser today — but this function is §4.1b's shared arbiter, and that
    // evaluator will read rules out of a table rather than through the
    // migration. A null-equals-null match there is a GBP rule fired on a USD
    // price, which is the one mistake this check has always existed to prevent.
    if (!ruleCurrency || !metricsCurrency || ruleCurrency !== metricsCurrency) return null
  }

  const value = metrics[meta.id]
  return meta.isValidValue(value) ? value : null
}

/**
 * Has this rule's threshold been crossed by the metrics given?
 *
 * The direction test is written as two explicit branches rather than as
 * `direction === 'below' ? … : …`, so an unrecognised direction fires nothing.
 * The ternary form silently treats every unknown value as "above", which for a
 * rule read back out of localStorage — where anything can be — means a
 * corrupted rule notifies rather than sits still.
 */
export function hasAlertCrossed(rule, metrics) {
  if (!rule || rule.triggered) return false

  const value = readAlertMetric(rule, metrics)
  if (value == null) return false

  // Held to the same predicate as the reading, and for the same reason the
  // currency check above is: `migrateStoredRules` has already screened every
  // rule the browser passes in, but §4.1b's evaluator reads rules from a table.
  // An `above` rule with a threshold of 0 fires on the first tick it sees.
  if (!ALERT_METRICS[rule.metric].isValidValue(rule.threshold)) return false

  if (rule.direction === 'above') return value >= rule.threshold
  if (rule.direction === 'below') return value <= rule.threshold
  return false
}

/**
 * A new rule, or null if the metric or the threshold will not do.
 *
 * Direction is inferred from where the threshold sits relative to the current
 * reading, which is what makes the panel a single input rather than an input
 * and a toggle. With no current reading it defaults to `above`, as it always
 * has: a rule that can never fire would be worse than one that fires early.
 */
export function createAlertRule(threshold, {
  metric = DEFAULT_ALERT_METRIC,
  metrics = null,
  id = crypto.randomUUID(),
  now = Date.now(),
} = {}) {
  const meta = ALERT_METRICS[metric]
  if (!meta) return null

  const parsed = Number(threshold)
  if (!meta.isValidValue(parsed)) return null

  const currency = meta.currencyScoped ? normaliseCurrency(metrics?.currency) : null
  if (meta.currencyScoped && !currency) return null

  const rule = {
    id,
    metric: meta.id,
    threshold: parsed,
    direction: 'above',
    triggered: false,
    createdAt: new Date(now).toISOString(),
  }
  if (currency) rule.currency = currency

  const current = readAlertMetric(rule, metrics)
  if (current != null && parsed < current) rule.direction = 'below'

  rule.label = meta.format(parsed, rule)
  return rule
}

// `threshold` under the current shape, `targetPrice` under the one that shipped
// before it. Written as a search for the first *finite* value rather than as
// `raw.threshold ?? raw.targetPrice`, because `??` passes an empty string
// through — the same trap recorded twice in CLAUDE.md's history (v1.6.5,
// v1.6.6), and here it would hand `Number('')` → 0 to the validator and drop a
// rule that migrates perfectly well.
function firstFinite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * Stored rules → rules this version can evaluate. Anything unusable is dropped.
 *
 * The migration exists because alerts already saved under
 * `btc-vibe-price-alerts` have no `metric` field and carry `targetPrice`. Read
 * strictly, every one of them is an unrecognised rule — and dropping them
 * silently deletes something a visitor set deliberately and expects to fire.
 * So a rule with no metric is a price rule, which is what it was.
 *
 * What is dropped is what cannot fire: an unknown metric (nothing here can read
 * it), an invalid threshold, an unrecognised direction, and a currency-scoped
 * rule with no currency. Keeping any of those means a row in the panel that
 * looks armed and never is, which is the worse of the two failures — a rule
 * that has quietly vanished is at least noticeable.
 */
export function migrateStoredRules(stored) {
  if (!Array.isArray(stored)) return []

  return stored.map(raw => {
    if (!raw || typeof raw !== 'object') return null

    const metric = typeof raw.metric === 'string' ? raw.metric : DEFAULT_ALERT_METRIC
    const meta = ALERT_METRICS[metric]
    if (!meta) return null

    const threshold = firstFinite(raw.threshold, raw.targetPrice)
    if (threshold == null || !meta.isValidValue(threshold)) return null

    if (raw.direction !== 'above' && raw.direction !== 'below') return null

    const currency = meta.currencyScoped ? normaliseCurrency(raw.currency) : null
    if (meta.currencyScoped && !currency) return null

    const rule = {
      id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
      metric: meta.id,
      threshold,
      direction: raw.direction,
      triggered: raw.triggered === true,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    }
    if (currency) rule.currency = currency

    // Regenerated when absent rather than left blank: the label is what the
    // panel row and the notification both say, so an empty one is a rule the
    // visitor cannot identify.
    rule.label = typeof raw.label === 'string' && raw.label ? raw.label : meta.format(threshold, rule)

    return rule
  }).filter(Boolean)
}

/** What the notification says when a rule fires. */
export function alertNotificationBody(rule, value) {
  const meta = ALERT_METRICS[rule?.metric]
  if (!meta) return null

  const edge = rule.direction === 'below' ? 'lower' : 'upper'
  const current = Number.isFinite(value) ? meta.format(value, rule) : null

  return `${meta.name} has crossed your ${edge} alert at ${rule.label}.${current ? ` Now ${current}.` : ''}`
}
