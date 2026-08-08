import { describe, it, expect, beforeEach } from 'vitest'
import {
  MAX_SYNCED_RULES, generatePushSecret, hashPushSecret,
  readOrCreatePushSecret, readPushSecret, syncableRules,
} from '../pushRules.js'

const rule = (over = {}) => ({
  id: 'r1', metric: 'price', threshold: 80000, direction: 'above',
  currency: 'usd', label: '$80,000', triggered: false, ...over,
})

beforeEach(() => localStorage.clear())

describe('syncableRules', () => {
  it('sends the fields the evaluator needs', () => {
    expect(syncableRules([rule()])).toEqual([
      { id: 'r1', metric: 'price', threshold: 80000, direction: 'above', currency: 'usd' },
    ])
  })

  it('leaves the label on the device', () => {
    // Display text the sender composes for itself from the metric registry.
    // This row is the first thing about a visitor that leaves their machine,
    // so it carries the minimum that makes the feature work.
    const [sent] = syncableRules([rule()])
    expect(sent).not.toHaveProperty('label')
    expect(sent).not.toHaveProperty('triggered')
  })

  it('drops rules that have already fired', () => {
    expect(syncableRules([rule({ triggered: true })])).toEqual([])
  })

  it('omits currency rather than sending null for an unscoped metric', () => {
    // `alertRules.js` refuses to match a currency-scoped rule with no currency,
    // so a null here would store a rule that can never fire.
    const [sent] = syncableRules([rule({ metric: 'fee', currency: undefined })])
    expect('currency' in sent).toBe(false)
  })

  it('caps the list at what the column accepts', () => {
    const many = Array.from({ length: MAX_SYNCED_RULES + 20 }, (_, i) => rule({ id: `r${i}` }))
    expect(syncableRules(many)).toHaveLength(MAX_SYNCED_RULES)
  })

  it('survives junk', () => {
    expect(syncableRules(null)).toEqual([])
    expect(syncableRules(undefined)).toEqual([])
    expect(syncableRules([null, undefined])).toEqual([])
  })
})

describe('push secret', () => {
  it('generates 256 bits of hex', () => {
    const secret = generatePushSecret()
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generatePushSecret()))
    expect(seen.size).toBe(50)
  })

  it('hashes to the hex sha256 the column stores', async () => {
    // Must agree byte for byte with `encode(digest(secret,'sha256'),'hex')` in
    // Postgres, or the RLS policy matches nothing and rules silently stop
    // syncing. Known-answer test rather than a round trip through the module.
    expect(await hashPushSecret('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    expect(await hashPushSecret('')).toBe('')
  })

  it('reuses the secret it already stored', () => {
    const first = readOrCreatePushSecret()
    expect(readOrCreatePushSecret()).toBe(first)
    expect(readPushSecret()).toBe(first)
  })

  it('replaces a stored value that is not a secret', () => {
    // Anything can be in localStorage. A malformed value would fail the
    // column's hex check on the way in and then never match on the way out.
    localStorage.setItem('btc-vibe-push-secret', 'not-a-secret')
    expect(readPushSecret()).toBe('')
    expect(readOrCreatePushSecret()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('reports no secret rather than an unpersistable one', () => {
    // A secret the browser will forget is worse than none: the row it creates
    // could never be written to again.
    const original = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')
    Storage.prototype.setItem = () => { throw new Error('quota') }
    try {
      expect(readOrCreatePushSecret()).toBe('')
    } finally {
      Object.defineProperty(Storage.prototype, 'setItem', original)
    }
  })
})
