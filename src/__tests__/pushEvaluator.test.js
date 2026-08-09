import { describe, it, expect } from 'vitest'
import {
  evaluateSubscription,
  firedEntries,
  metricsForCurrency,
  pushDelivery,
  pushPayload,
  requiredSources,
  rulesAfterDelivery,
} from '../../api/lib/pushEvaluator.js'

// A stored rule is what `syncableRules` sends: no label, no `triggered`, and
// nothing else. Building the fixtures in that shape rather than in the panel's
// is the point — the evaluator reads a table, and the table holds the reduced
// form deliberately (v1.7.8).
const stored = (over = {}) => ({
  id: 'rule-1', metric: 'price', threshold: 80000, direction: 'above', currency: 'usd', ...over,
})

const reading = (over = {}) => ({
  prices: { usd: 81000, gbp: 64000, eur: 75000, cad: 110000, chf: 72000 },
  fee: 4,
  fng: 55,
  mayer: 1.2,
  ...over,
})

describe('requiredSources', () => {
  it('asks for nothing when there are no rules', () => {
    expect([...requiredSources([])]).toEqual([])
  })

  it('asks for nothing for an unknown metric', () => {
    expect([...requiredSources([stored({ metric: 'nonsense' })])]).toEqual([])
  })

  it('maps each metric to the upstream it needs', () => {
    expect([...requiredSources([stored()])]).toEqual(['ticker'])
    expect([...requiredSources([stored({ metric: 'fee' })])]).toEqual(['fees'])
    expect([...requiredSources([stored({ metric: 'fng' })])]).toEqual(['fng'])
  })

  // The Mayer Multiple is a live price over a 200-day mean. Fetching only the
  // candles would leave it uncomputable and every Mayer alert silently dead.
  it('asks for both the ticker and the candles for a Mayer rule', () => {
    expect([...requiredSources([stored({ metric: 'mayer' })]).values()].sort())
      .toEqual(['ohlc', 'ticker'])
  })

  it('deduplicates across rules', () => {
    const sources = requiredSources([
      stored(), stored({ id: 'b' }), stored({ id: 'c', metric: 'mayer' }),
    ])
    expect([...sources].sort()).toEqual(['ohlc', 'ticker'])
  })

  it('survives junk in the array', () => {
    expect([...requiredSources([null, undefined, 'x', {}])]).toEqual([])
    expect([...requiredSources(null)]).toEqual([])
  })
})

describe('metricsForCurrency', () => {
  it('picks the price for the currency asked for', () => {
    expect(metricsForCurrency(reading(), 'gbp')).toMatchObject({ currency: 'gbp', price: 64000 })
  })

  it('lowercases the currency, because the rule model does', () => {
    expect(metricsForCurrency(reading(), 'GBP')).toMatchObject({ currency: 'gbp', price: 64000 })
  })

  it('has no price for a currency the reading does not carry', () => {
    expect(metricsForCurrency(reading(), 'jpy').price).toBeNull()
  })

  it('has no price at all when the rule is not currency-scoped', () => {
    expect(metricsForCurrency(reading(), null)).toMatchObject({ currency: null, price: null })
  })

  it('passes the unscoped metrics through whatever the currency', () => {
    expect(metricsForCurrency(reading(), null)).toMatchObject({ fee: 4, fng: 55, mayer: 1.2 })
  })

  it('answers null for every field when the reading is missing', () => {
    expect(metricsForCurrency(null, 'usd'))
      .toEqual({ currency: 'usd', price: null, fee: null, fng: null, mayer: null })
  })
})

describe('evaluateSubscription', () => {
  it('fires a price rule its own currency has crossed', () => {
    const [entry] = evaluateSubscription([stored()], reading())
    expect(entry.crossed).toBe(true)
    expect(entry.value).toBe(81000)
  })

  // The headline safety property of the whole module. The browser has one
  // price and an ambient currency; this has five prices and no ambient
  // anything, so the scoping has to be done per rule or a GBP alert fires on a
  // dollar figure.
  it('does not fire a GBP rule against the USD price', () => {
    const rule = stored({ currency: 'gbp', threshold: 80000 })
    const [entry] = evaluateSubscription([rule], reading())
    expect(entry.crossed).toBe(false)
  })

  it('fires the same rule once the GBP price actually crosses', () => {
    const rule = stored({ currency: 'gbp', threshold: 60000 })
    const [entry] = evaluateSubscription([rule], reading())
    expect(entry.crossed).toBe(true)
    expect(entry.value).toBe(64000)
  })

  // An upstream outage must not be able to look like a crossing. `below` rules
  // are the dangerous direction: a missing price read as 0 fires every one of
  // them at once, which is the v1.7.11 hazard arriving from the server side.
  it('fires nothing when the price source is down', () => {
    const rule = stored({ direction: 'below', threshold: 50000 })
    const entries = evaluateSubscription([rule], reading({ prices: {} }))
    expect(entries[0].crossed).toBe(false)
  })

  it('fires nothing when the whole reading failed', () => {
    const rules = [
      stored({ direction: 'below', threshold: 1 }),
      stored({ id: 'b', metric: 'fee', direction: 'below', threshold: 1, currency: undefined }),
      stored({ id: 'c', metric: 'fng', direction: 'below', threshold: 1, currency: undefined }),
    ]
    expect(firedEntries(evaluateSubscription(rules, null))).toHaveLength(0)
  })

  it('fires a fee rule with no currency on it', () => {
    const rule = stored({ metric: 'fee', threshold: 10, direction: 'below', currency: undefined })
    const [entry] = evaluateSubscription([rule], reading())
    expect(entry.crossed).toBe(true)
    expect(entry.value).toBe(4)
  })

  // 0 is a real Fear & Greed reading, and it is precisely the reading somebody
  // sets an extreme-fear alert for. A shared "must be positive" screen would
  // drop it.
  it('fires a Fear & Greed rule on a reading of zero', () => {
    const rule = stored({ metric: 'fng', threshold: 10, direction: 'below', currency: undefined })
    const [entry] = evaluateSubscription([rule], reading({ fng: 0 }))
    expect(entry.crossed).toBe(true)
    expect(entry.value).toBe(0)
  })

  it('fires a Mayer rule', () => {
    const rule = stored({ metric: 'mayer', threshold: 1.1, currency: undefined })
    const [entry] = evaluateSubscription([rule], reading())
    expect(entry.crossed).toBe(true)
  })

  it('keeps an armed rule that has not crossed, with nothing to send', () => {
    const [entry] = evaluateSubscription([stored({ threshold: 200000 })], reading())
    expect(entry.crossed).toBe(false)
    expect(entry.payload).toBeNull()
    expect(entry.rule).not.toBeNull()
  })

  // The rules arrive through a public UPDATE on a table whose key ships in the
  // client bundle. "The browser wrote them" is the happy path, not a guarantee.
  it('marks a rule it cannot evaluate as unusable rather than firing it', () => {
    const junk = [
      stored({ metric: 'nonsense' }),
      stored({ direction: 'sideways' }),
      stored({ threshold: -1 }),
      stored({ currency: undefined }),
      null,
    ]
    const entries = evaluateSubscription(junk, reading())
    expect(entries.every(e => e.rule === null)).toBe(true)
    expect(firedEntries(entries)).toHaveLength(0)
  })

  it('keeps entries in the order they were stored', () => {
    const rules = [stored({ id: 'a' }), stored({ id: 'b' }), stored({ id: 'c' })]
    expect(evaluateSubscription(rules, reading()).map(e => e.raw.id)).toEqual(['a', 'b', 'c'])
  })

  it('survives a rules column that is not an array', () => {
    expect(evaluateSubscription('nonsense', reading())).toEqual([])
    expect(evaluateSubscription(null, reading())).toEqual([])
  })
})

describe('pushPayload', () => {
  it('carries the rule id as the tag, so a repeat replaces rather than stacks', () => {
    const [entry] = evaluateSubscription([stored()], reading())
    expect(entry.payload.tag).toBe('rule-1')
  })

  // The label stays on the device by design (v1.7.8), so the sender composes
  // its own from the metric registry. If it did not, every notification would
  // quote a blank threshold.
  it('quotes the threshold even though the stored rule carries no label', () => {
    const [entry] = evaluateSubscription([stored()], reading())
    expect(entry.payload.body).toContain('$80,000')
    expect(entry.payload.body).toContain('$81,000')
  })

  it('names the metric rather than assuming price', () => {
    const rule = stored({ metric: 'fee', threshold: 10, direction: 'below', currency: undefined })
    const [entry] = evaluateSubscription([rule], reading())
    expect(entry.payload.body).toContain('Network fee')
  })

  it('sends no url, because the receiver collapses everything to the dashboard', () => {
    expect(pushPayload({ metric: 'fee', direction: 'above', label: '5 sat/vB', id: 'x' }, 6))
      .not.toHaveProperty('url')
  })

  it('is null for a rule whose metric has no registry entry', () => {
    expect(pushPayload({ metric: 'nonsense', id: 'x' }, 1)).toBeNull()
  })
})

describe('rulesAfterDelivery', () => {
  const entries = () => evaluateSubscription(
    [stored({ id: 'fired' }), stored({ id: 'armed', threshold: 200000 })],
    reading(),
  )

  it('drops a fired rule once its notification was delivered', () => {
    const next = rulesAfterDelivery(entries(), new Set(['fired']))
    expect(next.map(r => r.id)).toEqual(['armed'])
  })

  // The ordering that matters: consuming an alert whose push never arrived
  // would be indistinguishable, to the visitor, from an alert that never
  // worked. A repeat five minutes later is the cheaper failure.
  it('keeps a fired rule whose notification was not delivered', () => {
    const next = rulesAfterDelivery(entries(), new Set())
    expect(next.map(r => r.id)).toEqual(['fired', 'armed'])
  })

  it('stores back the raw rule, not the reconstructed one', () => {
    const [kept] = rulesAfterDelivery(entries(), new Set(['fired']))
    expect(kept).toEqual(stored({ id: 'armed', threshold: 200000 }))
    expect(kept).not.toHaveProperty('label')
    expect(kept).not.toHaveProperty('triggered')
  })

  it('drops rules that can never fire, delivered or not', () => {
    const junk = evaluateSubscription([stored({ metric: 'nonsense' }), stored({ id: 'ok' })], reading())
    expect(rulesAfterDelivery(junk, new Set()).map(r => r.id)).toEqual(['ok'])
  })

  it('accepts a plain array of ids as readily as a Set', () => {
    expect(rulesAfterDelivery(entries(), ['fired']).map(r => r.id)).toEqual(['armed'])
  })

  it('leaves an untouched list untouched', () => {
    const armed = evaluateSubscription([stored({ threshold: 200000 })], reading())
    expect(rulesAfterDelivery(armed, new Set())).toEqual([stored({ threshold: 200000 })])
  })
})

describe('pushDelivery', () => {
  it('counts any 2xx as delivered', () => {
    expect(pushDelivery(201)).toBe('delivered')
    expect(pushDelivery(200)).toBe('delivered')
    expect(pushDelivery(202)).toBe('delivered')
  })

  it('reaps only the two statuses that mean the endpoint is dead', () => {
    expect(pushDelivery(404)).toBe('gone')
    expect(pushDelivery(410)).toBe('gone')
  })

  // Reaping on anything wider empties the table on the sender's own bad day.
  // 403 is the one to name: it means the VAPID signature was rejected, which is
  // what a mistyped key looks like — and it would delete every subscriber.
  it('keeps the subscription for a rejected VAPID signature', () => {
    expect(pushDelivery(403)).toBe('failed')
  })

  it('keeps the subscription when the push service is struggling', () => {
    expect(pushDelivery(429)).toBe('failed')
    expect(pushDelivery(500)).toBe('failed')
    expect(pushDelivery(503)).toBe('failed')
  })

  it('keeps the subscription when the sender sent something malformed', () => {
    expect(pushDelivery(400)).toBe('failed')
    expect(pushDelivery(413)).toBe('failed')
  })

  it('keeps the subscription when there is no status at all', () => {
    expect(pushDelivery(undefined)).toBe('failed')
    expect(pushDelivery(null)).toBe('failed')
    expect(pushDelivery(NaN)).toBe('failed')
  })
})
