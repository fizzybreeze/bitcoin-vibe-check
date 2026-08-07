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

  it('gives every metric the four things the predicate needs', () => {
    for (const id of ALERT_METRIC_IDS) {
      const meta = ALERT_METRICS[id]
      expect(meta.id).toBe(id)
      expect(typeof meta.name).toBe('string')
      expect(typeof meta.isValidThreshold).toBe('function')
      expect(typeof meta.format).toBe('function')
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

  it('never fires a rule with a non-numeric threshold', () => {
    expect(hasAlertCrossed({ ...above, threshold: 'sixty' }, { currency: 'usd', price: 90000 })).toBe(false)
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
})
