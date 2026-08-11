// @vitest-environment node
//
// Node, not jsdom: this file imports both serverless handlers, and `api/og.js`
// pulls the same module graph the real function does.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  clientIp, hasQueryParams, createRateLimiter, rateLimitVerdict,
} from '../../api/lib/abuseGuard.js'

describe('clientIp', () => {
  // The trap this ordering exists for: `x-forwarded-for` is a list an
  // intermediary prepends to, so reading its first entry is exactly how a
  // caller rotates limiter keys. The platform headers cannot be forged, so they
  // win — a request arriving with a made-up `x-forwarded-for` is still counted
  // under the address Vercel saw.
  it('prefers the platform headers over a forgeable x-forwarded-for', () => {
    expect(clientIp({
      'x-vercel-forwarded-for': '203.0.113.7',
      'x-real-ip': '198.51.100.4',
      'x-forwarded-for': '10.0.0.1, 203.0.113.7',
    })).toBe('203.0.113.7')

    expect(clientIp({
      'x-real-ip': '198.51.100.4',
      'x-forwarded-for': '10.0.0.1',
    })).toBe('198.51.100.4')
  })

  it('falls back to x-forwarded-for when no platform header is present', () => {
    expect(clientIp({ 'x-forwarded-for': '203.0.113.9, 70.41.3.18' })).toBe('203.0.113.9')
  })

  it('reads a header sent more than once as its first value', () => {
    expect(clientIp({ 'x-real-ip': ['203.0.113.5', '10.0.0.1'] })).toBe('203.0.113.5')
  })

  // Blank counts as absent — the same trap as the Supabase and VAPID env vars.
  // A header present and empty carries no information, and keying on '' would
  // file every such caller into one shared bucket.
  it('treats a blank or whitespace header as absent and moves on', () => {
    expect(clientIp({ 'x-vercel-forwarded-for': '   ', 'x-real-ip': '203.0.113.7' }))
      .toBe('203.0.113.7')
    expect(clientIp({ 'x-real-ip': '' })).toBeNull()
  })

  it('returns null when nothing identifies the caller', () => {
    expect(clientIp({})).toBeNull()
    expect(clientIp()).toBeNull()
  })
})

describe('hasQueryParams', () => {
  it('reads the runtime-parsed query when there is one', () => {
    expect(hasQueryParams({ query: { bust: '1' } })).toBe(true)
    expect(hasQueryParams({ query: {} })).toBe(false)
  })

  it('falls back to the raw url', () => {
    expect(hasQueryParams({ url: '/api/chain-data?bust=1' })).toBe(true)
    expect(hasQueryParams({ url: '/api/chain-data' })).toBe(false)
  })

  // A trailing `?` is what a URL bar produces, not what a cache-buster does.
  it('does not count a bare question mark as a parameter', () => {
    expect(hasQueryParams({ url: '/api/og?' })).toBe(false)
  })

  it('reports no parameters when the request says nothing either way', () => {
    expect(hasQueryParams({})).toBe(false)
    expect(hasQueryParams()).toBe(false)
  })
})

describe('createRateLimiter', () => {
  // Deliberately aligned to a 60-second boundary: the windows are fixed rather
  // than sliding, so an arbitrary instant sits partway through one and every
  // assertion below would be off by the remainder.
  const T0 = 1_699_999_980_000

  it('allows exactly the limit and refuses the next one', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 })
    const verdicts = [1, 2, 3, 4].map(() => limiter.check('a', T0))
    expect(verdicts.map(v => v.allowed)).toEqual([true, true, true, false])
    expect(verdicts.map(v => v.remaining)).toEqual([2, 1, 0, 0])
  })

  it('counts each caller separately', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    expect(limiter.check('a', T0).allowed).toBe(true)
    expect(limiter.check('b', T0).allowed).toBe(true)
    expect(limiter.check('a', T0).allowed).toBe(false)
  })

  it('starts a fresh count in the next window', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    expect(limiter.check('a', T0).allowed).toBe(true)
    expect(limiter.check('a', T0 + 59_000).allowed).toBe(false)
    expect(limiter.check('a', T0 + 60_000).allowed).toBe(true)
  })

  it('reports how long the window has left, never zero', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    expect(limiter.check('a', T0).retryAfterSeconds).toBe(60)
    expect(limiter.check('a', T0 + 30_500).retryAfterSeconds).toBe(30)
    // The last moment of a window still has to say "come back in a second";
    // `Retry-After: 0` reads as "immediately", which is what was just refused.
    expect(limiter.check('a', T0 + 59_999).retryAfterSeconds).toBe(1)
  })

  // The bound is the point as much as the counting is: a map keyed by client
  // address and grown without limit is the memory-exhaustion vector a limiter
  // exists to prevent.
  it('never grows past maxKeys, and lets the overflow through rather than refusing it', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 })
    for (const key of ['a', 'b', 'c']) limiter.check(key, T0)
    expect(limiter.size).toBe(3)

    // Every key is live in this window, so there is nothing to prune. A refusal
    // here would mean one flood of distinct addresses locks out everyone who
    // arrives after it.
    expect(limiter.check('d', T0).allowed).toBe(true)
    expect(limiter.size).toBe(3)
  })

  it('reclaims keys whose window has passed instead of failing open', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 })
    for (const key of ['a', 'b', 'c']) limiter.check(key, T0)

    const next = T0 + 60_000
    expect(limiter.check('d', next).allowed).toBe(true)
    expect(limiter.size).toBe(1)
    // Admitted properly, so it is counted properly.
    expect(limiter.check('d', next).allowed).toBe(false)
  })
})

describe('rateLimitVerdict', () => {
  it('counts an identifiable caller', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    const req = { headers: { 'x-real-ip': '203.0.113.7' } }
    expect(rateLimitVerdict(limiter, req).allowed).toBe(true)
    expect(rateLimitVerdict(limiter, req).allowed).toBe(false)
  })

  // Fail open, and do not even take a slot: on the platform every request
  // carries an address, so an unidentifiable one means a header was renamed —
  // and reading that as "one shared client" would turn a platform change into a
  // site-wide 429.
  it('lets an unidentifiable caller through without keying a bucket', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
    for (let i = 0; i < 5; i++) {
      expect(rateLimitVerdict(limiter, { headers: {} }).allowed).toBe(true)
    }
    expect(limiter.size).toBe(0)
  })
})

// ─── The routes ──────────────────────────────────────────────────────────────

function mockRes() {
  return {
    statusCode: null,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
    end(body) { this.body = body; return this },
  }
}

const ip = n => ({ 'x-real-ip': `203.0.113.${n}` })

/**
 * Freeze the clock at a window boundary for the two route suites.
 *
 * Both limiters use **fixed** windows — `floor(now / windowMs) * windowMs` — so
 * a suite that fills a window and then asserts the next request is refused is
 * racing the minute hand. Sixty requests, each fanning out to six mocked
 * upstreams, is slow enough on a loaded runner to cross a boundary; when it
 * does the limiter resets and the request under test renders for real. It
 * failed exactly that way in CI, reporting six fetches where none were
 * expected.
 *
 * This is v1.7.17's own finding met from the other side: that round aligned the
 * *unit* fixture to a boundary after two tests failed for reasons that had
 * nothing to do with the code, and left the route suites on the wall clock.
 *
 * `toFake: ['Date']` only. Faking the timer queue as well would stall the
 * handlers' own `setTimeout`s with nothing advancing them — and per v1.6.10
 * `AbortSignal.timeout` schedules on a native timer the fake clock does not
 * patch, so the two halves would not agree in any case.
 */
function freezeAtWindowStart() {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // A round minute, so no window can roll over mid-suite however long it
    // takes. Arbitrary date, deliberately not `Date.now()` rounded — a fixture
    // that moves is a fixture that can start failing on its own.
    vi.setSystemTime(new Date('2026-08-11T10:00:00.000Z'))
  })
  afterEach(() => { vi.useRealTimers() })
}

describe('/api/chain-data abuse posture', () => {
  let handler, rateLimiter, fetchMock
  freezeAtWindowStart()

  beforeEach(async () => {
    ({ default: handler, rateLimiter } = await import('../../api/chain-data.js'))
    rateLimiter.reset()
    fetchMock = vi.fn(async () => { throw new Error('unrouted fetch') })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => { vi.unstubAllGlobals() })

  // The vector: a CDN cache key includes the query string, so `?1`, `?2`, `?3`
  // each miss and each spend one of BGeometrics' 15 requests a day.
  it('refuses a query string without spending an upstream request', async () => {
    const res = mockRes()
    await handler({ headers: ip(1), query: { bust: '1' } }, res)

    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.headers['Cache-Control']).toBe('no-store')
  })

  it('answers 429 with a Retry-After once a caller is over the limit', async () => {
    for (let i = 0; i < 60; i++) {
      await handler({ headers: ip(2) }, mockRes())
    }
    const res = mockRes()
    await handler({ headers: ip(2) }, res)

    expect(res.statusCode).toBe(429)
    expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0)
    // The 61st request did no work; the first 60 each tried BGeometrics once.
    expect(fetchMock).toHaveBeenCalledTimes(60)
  })

  // A 429 cached at a shared CDN is served to every visitor of that region,
  // which turns one client's rate limit into everybody's blank MVRV card.
  it('never lets a refusal be cached at the edge', async () => {
    for (let i = 0; i < 61; i++) await handler({ headers: ip(3) }, mockRes())
    const res = mockRes()
    await handler({ headers: ip(3) }, res)

    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(res.headers['Cache-Control']).not.toMatch(/s-maxage/)
  })

  it('leaves an ordinary request alone', async () => {
    const res = mockRes()
    await handler({ headers: ip(4) }, res)
    expect(res.statusCode).not.toBe(400)
    expect(res.statusCode).not.toBe(429)
  })
})

describe('/api/og abuse posture', () => {
  let handler, rateLimiter, fetchMock
  freezeAtWindowStart()

  beforeEach(async () => {
    ({ default: handler, rateLimiter } = await import('../../api/og.js'))
    rateLimiter.reset()
    fetchMock = vi.fn(async () => { throw new Error('unrouted fetch') })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => { vi.unstubAllGlobals() })

  // Constraint 1 of the route does not stop applying to a request we dislike:
  // an unfurler shown a 4xx draws a blank rectangle, so a refusal sheds to the
  // static image instead.
  it('sheds a query string to the static image without fetching anything', async () => {
    const res = mockRes()
    await handler({ method: 'GET', headers: ip(5), query: { bust: '1' } }, res)

    expect(res.statusCode).toBe(302)
    expect(res.headers.Location).toBe('/og-image.png')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.headers['Cache-Control']).toBe('no-store')
  })

  it('sheds a caller that is over the limit, and does so without rendering', async () => {
    for (let i = 0; i < 30; i++) await handler({ method: 'GET', headers: ip(6) }, mockRes())
    fetchMock.mockClear()

    const res = mockRes()
    await handler({ method: 'GET', headers: ip(6) }, res)

    expect(res.statusCode).toBe(302)
    expect(res.headers.Location).toBe('/og-image.png')
    expect(fetchMock).not.toHaveBeenCalled()
  }, 30_000)

  // The ordinary upstream-failure redirect keeps its 60-second cache; only the
  // refusal is `no-store`, so one bad client cannot pin the generic card in
  // front of everybody else's share.
  it('keeps the two redirects distinguishable by their caching', async () => {
    const refused = mockRes()
    await handler({ method: 'GET', headers: ip(7), query: { bust: '1' } }, refused)

    const failed = mockRes()
    await handler({ method: 'GET', headers: ip(8) }, failed)

    expect(refused.headers['Cache-Control']).toBe('no-store')
    expect(failed.headers['Cache-Control']).toContain('s-maxage=60')
  }, 30_000)
})
