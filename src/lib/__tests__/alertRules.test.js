import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ALERT_METRICS,
  ALERT_METRIC_IDS,
  DEFAULT_ALERT_METRIC,
  alertNotificationBody,
  createAlertRule,
  hasAlertCrossed,
  migrateStoredRules,
  readAlertMetric,
} from '../alertRules.js'

let uuidCounter = 0

beforeEach(() => {
  uuidCounter = 0
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `test-uuid-${++uuidCounter}`)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const usd = { currency: 'usd', price: 50000 }

// ─── the registry ────────────────────────────────────────────────────────────

describe('ALERT_METRICS', () => {
  it('exposes price as the default metric', () => {
    expect(DEFAULT_ALERT_METRIC).toBe('price')
    expect(ALERT_METRIC_IDS).toContain('price')
  })

  // `currencyScoped` is the one that has to be asserted rather than assumed: a
  // §3.4b row that simply forgets it is globally scoped, which means a rule
  // fired against whatever currency happens to be on screen — and nothing else
  // in this suite would go red. Declaring it explicitly, either way, is cheap.
  it('gives every metric the things the predicate needs, currency scoping included', () => {
    for (const id of ALERT_METRIC_IDS) {
      const meta = ALERT_METRICS[id]
      expect(meta.id).toBe(id)
      expect(typeof meta.name).toBe('string')
      expect(typeof meta.currencyScoped).toBe('boolean')
      expect(typeof meta.isValidValue).toBe('function')
      expect(typeof meta.format).toBe('function')
    }
  })

  // The panel drives its placeholder, unit slot, example line and validation
  // message off these. A row that omits one renders a blank placeholder or an
  // empty error, and nothing else in the suite would notice.
  it('gives every metric the copy the panel renders', () => {
    for (const id of ALERT_METRIC_IDS) {
      const meta = ALERT_METRICS[id]
      expect(meta.shortName).toBeTruthy()
      expect(meta.placeholder).toBeTruthy()
      expect(meta.invalidMessage).toBeTruthy()
      expect(typeof meta.colorDirection).toBe('boolean')
      expect(meta.isValidValue(meta.exampleValue)).toBe(true)
    }
  })

  it('carries the three §3.4b metrics, none of them currency-scoped', () => {
    for (const id of ['fee', 'fng', 'mayer']) {
      expect(ALERT_METRIC_IDS).toContain(id)
      expect(ALERT_METRICS[id].currencyScoped).toBe(false)
    }
  })

  // The reason `isValidValue` is per-metric rather than one shared `v > 0`.
  it('accepts 0 and 100 for Fear & Greed and nothing outside them', () => {
    const { isValidValue } = ALERT_METRICS.fng
    expect(isValidValue(0)).toBe(true)
    expect(isValidValue(100)).toBe(true)
    expect(isValidValue(-1)).toBe(false)
    expect(isValidValue(101)).toBe(false)
  })

  it('rejects a non-positive fee or Mayer Multiple', () => {
    expect(ALERT_METRICS.fee.isValidValue(0)).toBe(false)
    expect(ALERT_METRICS.mayer.isValidValue(0)).toBe(false)
  })

  it('formats each metric in its own units', () => {
    expect(ALERT_METRICS.fee.format(5)).toBe('5 sat/vB')
    expect(ALERT_METRICS.fee.format(12.5)).toBe('12.5 sat/vB')
    expect(ALERT_METRICS.fng.format(20)).toBe('20')
    expect(ALERT_METRICS.mayer.format(2.4)).toBe('2.40')
  })

  // Price is the one metric where up-is-green is a market convention. A fee
  // alert tinted the same way styles the good news the visitor asked for as bad.
  it('tints the direction arrow for price only', () => {
    expect(ALERT_METRICS.price.colorDirection).toBe(true)
    for (const id of ['fee', 'fng', 'mayer']) {
      expect(ALERT_METRICS[id].colorDirection).toBe(false)
    }
  })
})

// ─── readAlertMetric ─────────────────────────────────────────────────────────

describe('readAlertMetric', () => {
  it('reads the value named by the rule', () => {
    expect(readAlertMetric({ metric: 'price', currency: 'usd' }, usd)).toBe(50000)
  })

  it('returns null for an unknown metric', () => {
    expect(readAlertMetric({ metric: 'hashrate', currency: 'usd' }, usd)).toBeNull()
  })

  it('returns null when the reading has not loaded', () => {
    expect(readAlertMetric({ metric: 'price', currency: 'usd' }, { currency: 'usd', price: null })).toBeNull()
  })

  it('refuses to read a GBP rule against a USD reading', () => {
    expect(readAlertMetric({ metric: 'price', currency: 'gbp' }, usd)).toBeNull()
  })

  it('matches currency case-insensitively', () => {
    expect(readAlertMetric({ metric: 'price', currency: 'USD' }, usd)).toBe(50000)
  })

  // Two missing currencies must not read as a match. Unreachable through the
  // migration, reachable by §4.1b reading rules out of a table.
  it('refuses a currency-scoped rule when either side has no currency', () => {
    expect(readAlertMetric({ metric: 'price' }, { price: 50000 })).toBeNull()
    expect(readAlertMetric({ metric: 'price' }, usd)).toBeNull()
    expect(readAlertMetric({ metric: 'price', currency: 'usd' }, { price: 50000 })).toBeNull()
  })

  // The Kraken WebSocket guards `ticker.last != null` and then rounds, so a
  // zero frame arrives here as a number rather than as a null. Treated as a
  // reading it would fire every pending `below` rule at once.
  it('refuses a reading the metric calls impossible', () => {
    expect(readAlertMetric({ metric: 'price', currency: 'usd' }, { currency: 'usd', price: 0 })).toBeNull()
    expect(readAlertMetric({ metric: 'price', currency: 'usd' }, { currency: 'usd', price: -1 })).toBeNull()
  })
})

// ─── hasAlertCrossed ─────────────────────────────────────────────────────────

describe('hasAlertCrossed', () => {
  const above = { metric: 'price', currency: 'usd', threshold: 60000, direction: 'above' }
  const below = { metric: 'price', currency: 'usd', threshold: 40000, direction: 'below' }

  it('fires an "above" rule at or past its threshold', () => {
    expect(hasAlertCrossed(above, { currency: 'usd', price: 59999 })).toBe(false)
    expect(hasAlertCrossed(above, { currency: 'usd', price: 60000 })).toBe(true)
    expect(hasAlertCrossed(above, { currency: 'usd', price: 61000 })).toBe(true)
  })

  it('fires a "below" rule at or past its threshold', () => {
    expect(hasAlertCrossed(below, { currency: 'usd', price: 40001 })).toBe(false)
    expect(hasAlertCrossed(below, { currency: 'usd', price: 40000 })).toBe(true)
    expect(hasAlertCrossed(below, { currency: 'usd', price: 39000 })).toBe(true)
  })

  it('never fires a rule that has already triggered', () => {
    expect(hasAlertCrossed({ ...above, triggered: true }, { currency: 'usd', price: 90000 })).toBe(false)
  })

  it('never fires a rule whose direction it does not recognise', () => {
    expect(hasAlertCrossed({ ...above, direction: 'sideways' }, { currency: 'usd', price: 90000 })).toBe(false)
  })

  it('never fires a rule whose threshold the metric calls impossible', () => {
    expect(hasAlertCrossed({ ...above, threshold: 'sixty' }, { currency: 'usd', price: 90000 })).toBe(false)
    expect(hasAlertCrossed({ ...above, threshold: 0 }, { currency: 'usd', price: 90000 })).toBe(false)
  })

  it('never fires on a reading the metric calls impossible', () => {
    expect(hasAlertCrossed(below, { currency: 'usd', price: 0 })).toBe(false)
  })

  it('never fires a rule scoped to a currency that is not being shown', () => {
    expect(hasAlertCrossed({ ...above, currency: 'gbp' }, { currency: 'usd', price: 90000 })).toBe(false)
  })
})

// ─── createAlertRule ─────────────────────────────────────────────────────────

describe('createAlertRule', () => {
  it('infers "above" when the threshold is over the current reading', () => {
    expect(createAlertRule(60000, { metrics: usd }).direction).toBe('above')
  })

  it('infers "below" when the threshold is under the current reading', () => {
    expect(createAlertRule(40000, { metrics: usd }).direction).toBe('below')
  })

  it('defaults to "above" when there is no current reading', () => {
    expect(createAlertRule(60000, { metrics: { currency: 'usd', price: null } }).direction).toBe('above')
  })

  it('stores the metric, threshold and currency on the rule', () => {
    const rule = createAlertRule(80000, { metrics: { currency: 'gbp', price: 50000 } })
    expect(rule.metric).toBe('price')
    expect(rule.threshold).toBe(80000)
    expect(rule.currency).toBe('gbp')
    expect(rule.triggered).toBe(false)
    expect(rule.label).toContain('80,000')
  })

  it('refuses a threshold the metric calls invalid', () => {
    expect(createAlertRule(0, { metrics: usd })).toBeNull()
    expect(createAlertRule(-100, { metrics: usd })).toBeNull()
    expect(createAlertRule('abc', { metrics: usd })).toBeNull()
  })

  it('refuses an unknown metric', () => {
    expect(createAlertRule(5, { metric: 'hashrate', metrics: usd })).toBeNull()
  })

  it('refuses a currency-scoped rule with no currency to scope it to', () => {
    expect(createAlertRule(60000, { metrics: { price: 50000 } })).toBeNull()
  })
})

// ─── migrateStoredRules ──────────────────────────────────────────────────────

describe('migrateStoredRules', () => {
  const legacy = {
    id: 'legacy-1',
    targetPrice: 70000,
    currency: 'usd',
    direction: 'above',
    label: '$70,000',
    triggered: false,
    createdAt: '2026-08-01T00:00:00.000Z',
  }

  it('reads a stored price alert from before the rule had a metric', () => {
    const [rule] = migrateStoredRules([legacy])
    expect(rule.metric).toBe('price')
    expect(rule.threshold).toBe(70000)
    expect(rule.id).toBe('legacy-1')
    expect(rule.label).toBe('$70,000')
    expect(rule.createdAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('keeps a rule that already names its metric', () => {
    const [rule] = migrateStoredRules([
      { ...legacy, metric: 'price', threshold: 70000, targetPrice: undefined },
    ])
    expect(rule.threshold).toBe(70000)
  })

  it('preserves the triggered flag', () => {
    expect(migrateStoredRules([{ ...legacy, triggered: true }])[0].triggered).toBe(true)
  })

  // Hard-coding `direction: 'above'` in the migration would turn every saved
  // below-alert into an above-alert that fires on the next tick — the loudest
  // way this change could go wrong, and silent without this assertion.
  it('preserves the direction rather than defaulting it', () => {
    expect(migrateStoredRules([{ ...legacy, direction: 'above' }])[0].direction).toBe('above')
    expect(migrateStoredRules([{ ...legacy, direction: 'below' }])[0].direction).toBe('below')
  })

  it('regenerates a missing label rather than showing a blank row', () => {
    const [rule] = migrateStoredRules([{ ...legacy, label: '' }])
    expect(rule.label).toContain('70,000')
  })

  it('gives an id to a rule stored without one, so it can still be removed', () => {
    const [rule] = migrateStoredRules([{ ...legacy, id: undefined }])
    expect(rule.id).toBe('test-uuid-1')
  })

  it('drops rules that could never fire', () => {
    expect(migrateStoredRules([
      { ...legacy, metric: 'hashrate' },        // nothing here can read it
      { ...legacy, targetPrice: 0 },            // invalid threshold
      { ...legacy, direction: 'sideways' },     // unrecognised direction
      { ...legacy, currency: undefined },       // no currency to scope it to
      null,
      'not a rule',
    ])).toEqual([])
  })

  it('is not fooled by an empty-string threshold', () => {
    // `raw.threshold ?? raw.targetPrice` would stop at '' and hand Number('')
    // → 0 to the validator, dropping a rule that migrates fine.
    const [rule] = migrateStoredRules([{ ...legacy, threshold: '' }])
    expect(rule.threshold).toBe(70000)
  })

  it('returns an empty list for anything that is not an array', () => {
    expect(migrateStoredRules(null)).toEqual([])
    expect(migrateStoredRules({ id: 'x' })).toEqual([])
    expect(migrateStoredRules(undefined)).toEqual([])
  })
})

// ─── alertNotificationBody ───────────────────────────────────────────────────

describe('alertNotificationBody', () => {
  const rule = { metric: 'price', currency: 'usd', threshold: 60000, direction: 'above', label: '$60,000' }

  it('names the metric, the edge crossed and the current reading', () => {
    const body = alertNotificationBody(rule, 61000)
    expect(body).toContain('BTC price')
    expect(body).toContain('upper')
    expect(body).toContain('$60,000')
    expect(body).toContain('$61,000')
  })

  it('says "lower" for a below rule', () => {
    expect(alertNotificationBody({ ...rule, direction: 'below' }, 59000)).toContain('lower')
  })

  it('omits the current reading rather than printing a blank one', () => {
    expect(alertNotificationBody(rule, null)).toBe('BTC price has crossed your upper alert at $60,000.')
  })

  it('returns null for an unknown metric', () => {
    expect(alertNotificationBody({ ...rule, metric: 'hashrate' }, 1)).toBeNull()
  })

  it('names the metric it is actually about', () => {
    const fee = { metric: 'fee', threshold: 5, direction: 'below', label: '5 sat/vB' }
    expect(alertNotificationBody(fee, 4)).toBe(
      'Network fee has crossed your lower alert at 5 sat/vB. Now 4 sat/vB.'
    )
  })
})

// ─── the §3.4b metrics end to end ────────────────────────────────────────────
//
// The registry rows above are the whole change, so these assert that nothing
// below them needed one: reading, crossing, creating, storing and re-reading a
// fee, index or ratio rule all go through the same code price does.

describe('the §3.4b metrics', () => {
  const live = { currency: 'usd', price: 50000, fee: 12, fng: 45, mayer: 1.8 }

  it('reads each new metric off the metrics object', () => {
    expect(readAlertMetric({ metric: 'fee' }, live)).toBe(12)
    expect(readAlertMetric({ metric: 'fng' }, live)).toBe(45)
    expect(readAlertMetric({ metric: 'mayer' }, live)).toBe(1.8)
  })

  // The point of `currencyScoped: false`. A fee is a fee whatever the header
  // happens to be showing, and scoping it would invent a way to stop matching.
  it('reads an un-scoped metric whatever currency is on screen', () => {
    expect(readAlertMetric({ metric: 'fee' }, { ...live, currency: 'gbp' })).toBe(12)
    expect(readAlertMetric({ metric: 'fee' }, { fee: 12 })).toBe(12)
  })

  it('fires a fee rule when fees drop to the level asked for', () => {
    const rule = { metric: 'fee', threshold: 5, direction: 'below' }
    expect(hasAlertCrossed(rule, { ...live, fee: 6 })).toBe(false)
    expect(hasAlertCrossed(rule, { ...live, fee: 5 })).toBe(true)
  })

  // Extreme fear is exactly the reading someone sets this alert for, and a
  // shared `v > 0` predicate would have refused to read it.
  it('fires a Fear & Greed rule at a reading of 0', () => {
    expect(hasAlertCrossed({ metric: 'fng', threshold: 10, direction: 'below' }, { ...live, fng: 0 })).toBe(true)
  })

  it('never fires a Fear & Greed rule on an impossible reading', () => {
    expect(hasAlertCrossed({ metric: 'fng', threshold: 90, direction: 'above' }, { ...live, fng: 140 })).toBe(false)
  })

  it('creates an un-scoped rule with no currency on it at all', () => {
    const rule = createAlertRule(5, { metric: 'fee', metrics: live })
    expect(rule.metric).toBe('fee')
    expect(rule.threshold).toBe(5)
    expect(rule.currency).toBeUndefined()
    expect(rule.direction).toBe('below')   // current fee is 12
    expect(rule.label).toBe('5 sat/vB')
  })

  it('creates an un-scoped rule even when no currency is known', () => {
    expect(createAlertRule(2.4, { metric: 'mayer', metrics: { mayer: 1.8 } })).not.toBeNull()
  })

  it('refuses a threshold the new metric calls impossible', () => {
    expect(createAlertRule(101, { metric: 'fng', metrics: live })).toBeNull()
    expect(createAlertRule(0, { metric: 'fee', metrics: live })).toBeNull()
    expect(createAlertRule(0, { metric: 'fng', metrics: live })).not.toBeNull()
  })

  it('survives a round trip through storage', () => {
    const rule = createAlertRule(20, { metric: 'fng', metrics: live })
    const [back] = migrateStoredRules(JSON.parse(JSON.stringify([rule])))
    expect(back).toEqual(rule)
  })
})
