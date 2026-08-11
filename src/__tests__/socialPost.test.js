import { describe, it, expect } from 'vitest'
import { finalizeEvent, generateSecretKey, verifyEvent } from 'nostr-tools'
import {
  shouldPublish, buildSocialPost, buildNostrEvent, parseSecretKey,
  MAX_ABS_24H_CHANGE_PCT, DEFAULT_RELAYS,
} from '../../scripts/lib/socialPost.js'

// This is the first thing in the repo that publishes, unattended, to somewhere
// it cannot be taken back from. The tests are weighted accordingly: most of
// them are about the guard *refusing*, because the expensive failure here is a
// post that went out, not one that did not.

const full = (over = {}) => ({
  price_usd: 96500,
  change_24h_pct: 1.84,
  fear_greed_value: 62,
  fear_greed_label: 'Greed',
  mayer_multiple: 1.21,
  mvrv_value: 2.1,
  price_change_30d_pct: 8.2,
  hashrate_eh: 812.4,
  hashrate_trend_30d: 4.25,
  fee_fastest_sv: 7,
  mempool_tx_count: 42000,
  block_height: 900123,
  ...over,
})
const row = (date, metrics) => ({ captured_at: `${date}T06:20:00.000Z`, metrics })
const TODAY = '2026-08-11'

describe('the guard refuses', () => {
  it('a day that moved violently, in either direction', () => {
    for (const change of [-14.2, 11.5]) {
      const v = shouldPublish({ today: row(TODAY, full({ change_24h_pct: change })), asOf: TODAY })
      expect(v.ok).toBe(false)
      expect(v.reason).toContain('guard')
    }
  })

  it('but not a merely miserable one — it guards velocity, not level', () => {
    // "The vibe is 8, Ice Cold" on a bad day is an honest reading. Refusing it
    // would be the dashboard having a feeling about the market, which §7 rules
    // out and which this guard is explicitly not for.
    const grim = full({ fear_greed_value: 5, fear_greed_label: 'Extreme Fear', change_24h_pct: -2.1 })
    expect(shouldPublish({ today: row(TODAY, grim), asOf: TODAY }).ok).toBe(true)
  })

  it('a day whose volatility cannot be measured at all', () => {
    // The rule most likely to look like a bug. A guard that fails open would
    // post on exactly the day the data was strange.
    const v = shouldPublish({ today: row(TODAY, full({ change_24h_pct: null })), asOf: TODAY })
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('volatility cannot be checked')
  })

  it('a stale snapshot outright, where the newsletter only banners it', () => {
    // A draft carrying a warning is read by someone who can act on it. A post
    // has no such reader, and yesterday's numbers published as today's is wrong.
    const v = shouldPublish({ today: row('2026-08-09', full()), asOf: TODAY })
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('2026-08-09')
  })

  it('a day too thin to score', () => {
    const v = shouldPublish({ today: row(TODAY, { price_usd: 96500 }), asOf: TODAY })
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('Vibe Score')
  })

  it('an absent row', () => {
    expect(shouldPublish({ today: null, asOf: TODAY }).ok).toBe(false)
  })

  it('and always says why, so a silent skip is never indistinguishable from a break', () => {
    const refusals = [
      shouldPublish({ today: null, asOf: TODAY }),
      shouldPublish({ today: row('2026-08-01', full()), asOf: TODAY }),
      shouldPublish({ today: row(TODAY, full({ change_24h_pct: 42 })), asOf: TODAY }),
      shouldPublish({ today: row(TODAY, full({ change_24h_pct: null })), asOf: TODAY }),
      shouldPublish({ today: row(TODAY, { price_usd: 1 }), asOf: TODAY }),
    ]
    for (const r of refusals) {
      expect(r.ok).toBe(false)
      expect(typeof r.reason).toBe('string')
      expect(r.reason.length).toBeGreaterThan(10)
    }
  })

  it('lets an ordinary day through', () => {
    expect(shouldPublish({ today: row(TODAY, full()), asOf: TODAY })).toEqual({ ok: true })
  })

  it('sits at ±10, checked at the boundary rather than near it', () => {
    expect(MAX_ABS_24H_CHANGE_PCT).toBe(10)
    const at = shouldPublish({ today: row(TODAY, full({ change_24h_pct: 10 })), asOf: TODAY })
    const under = shouldPublish({ today: row(TODAY, full({ change_24h_pct: 9.99 })), asOf: TODAY })
    expect(at.ok).toBe(false)
    expect(under.ok).toBe(true)
  })
})

describe('the post itself', () => {
  it('leads with the score and says which way it moved', () => {
    const post = buildSocialPost({
      today: row(TODAY, full()),
      previous: row('2026-08-10', full({ fear_greed_value: 40 })),
    })
    expect(post.content).toMatch(/^Bitcoin vibe check — \d+\/100, \w+\./)
    expect(post.content).toMatch(/(Up|Down|Level) /)
  })

  it('omits the movement when yesterday is not comparable', () => {
    // The same rule as the newsletter delta, reached through the same function.
    const post = buildSocialPost({
      today: row(TODAY, full()),
      previous: row('2026-08-10', full({ mvrv_value: null })),
    })
    expect(post.content).not.toMatch(/(Up|Down|Level) \d* ?on yesterday/)
  })

  it('says outright when the score stood on fewer inputs', () => {
    const post = buildSocialPost({ today: row(TODAY, full({ mvrv_value: null })) })
    expect(post.content).toMatch(/\(\d\/\d inputs\)/)
  })

  it('drops a missing figure rather than printing a placeholder', () => {
    const post = buildSocialPost({ today: row(TODAY, full({ mvrv_value: null, fee_fastest_sv: null })) })
    expect(post.content).not.toContain('MVRV')
    expect(post.content).not.toContain('Fastest fee')
    expect(post.content).toContain('Mayer')
  })

  it('never renders null, undefined or NaN', () => {
    for (const metrics of [full(), full({ mvrv_value: null }), full({ fear_greed_label: null })]) {
      const post = buildSocialPost({ today: row(TODAY, metrics) })
      expect(post.content).not.toMatch(/\bnull\b|\bundefined\b|NaN/)
    }
  })

  it('links the dashboard and tags the topics it names inline', () => {
    const post = buildSocialPost({ today: row(TODAY, full()) })
    expect(post.content).toContain('https://www.bitcoinvibecheck.com')
    // The `t` tags must mirror the inline hashtags or clients filter on one and
    // display the other.
    const topics = post.tags.filter(t => t[0] === 't').map(t => t[1])
    for (const topic of topics) expect(post.content).toContain(`#${topic}`)
  })

  it('returns nothing when the day cannot be scored', () => {
    expect(buildSocialPost({ today: row(TODAY, { price_usd: 1 }) })).toBeNull()
    expect(buildSocialPost({ today: null })).toBeNull()
  })
})

describe('the event is idempotent by construction', () => {
  it('takes created_at from the snapshot, not from the clock', () => {
    const today = row(TODAY, full())
    const post = buildSocialPost({ today })
    const a = buildNostrEvent({ post, capturedAt: today.captured_at })
    expect(a.created_at).toBe(Math.floor(Date.parse(today.captured_at) / 1000))
  })

  it('so a re-run produces a byte-identical event id that relays dedupe', () => {
    // This is the whole reason the timestamp is pinned. With Date.now() a
    // second run of the job — the manual dispatch this repo relies on — would
    // be a second post.
    const today = row(TODAY, full())
    const sk = generateSecretKey()
    const sign = () => finalizeEvent(
      buildNostrEvent({ post: buildSocialPost({ today }), capturedAt: today.captured_at }), sk
    )
    const first = sign()
    const second = sign()
    expect(second.id).toBe(first.id)
    expect(verifyEvent(first)).toBe(true)
  })

  it('produces a different event when the day\'s numbers actually differ', () => {
    const sk = generateSecretKey()
    const ev = (metrics) => {
      const r = row(TODAY, metrics)
      return finalizeEvent(buildNostrEvent({ post: buildSocialPost({ today: r }), capturedAt: r.captured_at }), sk)
    }
    expect(ev(full({ price_usd: 96500 })).id).not.toBe(ev(full({ price_usd: 97500 })).id)
  })

  it('refuses an undated row rather than signing one stamped now', () => {
    const post = buildSocialPost({ today: row(TODAY, full()) })
    expect(buildNostrEvent({ post, capturedAt: 'not-a-date' })).toBeNull()
    expect(buildNostrEvent({ post: null, capturedAt: `${TODAY}T00:00:00Z` })).toBeNull()
  })

  it('signs into an event the network will actually accept', () => {
    const today = row(TODAY, full())
    const event = finalizeEvent(
      buildNostrEvent({ post: buildSocialPost({ today }), capturedAt: today.captured_at }),
      generateSecretKey()
    )
    expect(event.kind).toBe(1)
    expect(verifyEvent(event)).toBe(true)
  })
})

describe('the key', () => {
  it('accepts both forms a person actually has to hand', () => {
    const sk = generateSecretKey()
    const hex = [...sk].map(b => b.toString(16).padStart(2, '0')).join('')
    expect(parseSecretKey(hex)).toEqual(sk)
    expect(parseSecretKey(hex.toUpperCase())).toEqual(sk)
  })

  it('treats absent and blank alike, which is the dry-run switch', () => {
    // Blank counts as missing — the trap this repo has now met six times. A
    // secret saved empty in Actions must not be parsed as a key.
    expect(parseSecretKey('')).toBeNull()
    expect(parseSecretKey('   ')).toBeNull()
    expect(parseSecretKey(undefined)).toBeNull()
  })

  it('throws on a key it cannot parse rather than posting as a stranger', () => {
    // A coerced key is a valid keypair belonging to nobody: the post succeeds,
    // under an identity with no followers, and nothing looks wrong.
    expect(() => parseSecretKey('not-a-key')).toThrow(/nsec1|hex/)
    expect(() => parseSecretKey('abc123')).toThrow()
  })
})

describe('relays', () => {
  it('are several, because one accepting is a post that happened', () => {
    expect(DEFAULT_RELAYS.length).toBeGreaterThan(1)
    for (const r of DEFAULT_RELAYS) expect(r).toMatch(/^wss:\/\//)
  })
})
