import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// Imported rather than taken as a global, the same way autoMerge.test.js does
// it: eslint gives everything under src/ the browser globals, and the route
// under test reads its whole configuration off the environment.
import process from 'node:process'

// The route reaches the network and the database on the happy path, so what is
// pinned here is everything *before* it does — the four ways this endpoint can
// refuse. It is the only thing standing between an anonymous POST and a
// notification delivered to every subscriber of the site, so "it refuses" is
// the behaviour worth a test rather than the behaviour worth assuming.

const sendNotification = vi.fn()
const select = vi.fn()

vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: (...a) => sendNotification(...a) },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({ select: (...a) => select(...a) }) }),
}))

const { default: handler, bearerMatches, config, VAPID_SUBJECT } =
  await import('../../api/push-evaluate.js')

const SECRET = 'a-long-enough-shared-secret'

function res() {
  const r = {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v },
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
  }
  return r
}

const configured = {
  PUSH_EVALUATE_SECRET: SECRET,
  VAPID_PRIVATE_KEY: 'private',
  VITE_VAPID_PUBLIC_KEY: 'public',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
}

let saved
beforeEach(() => {
  saved = { ...process.env }
  Object.assign(process.env, configured)
  select.mockResolvedValue({ data: [], error: null })
  sendNotification.mockReset()
})

afterEach(() => {
  process.env = saved
  vi.restoreAllMocks()
})

// `web-push` is mocked for every test above, which is exactly why this one
// reaches for the real library. `setVapidDetails` validates its subject and
// *throws*, and it is called on every tick before a single send — so getting it
// wrong does not fail one notification, it fails all of them, forever, with
// nothing in the mocked suite able to notice. The `https:` form is legal per
// RFC 8292 and is used here in preference to committing an address to a public
// repo; this is the test that stops that choice being quietly wrong.
describe('the VAPID subject the real library will be given', () => {
  it('is accepted by web-push', async () => {
    const { default: realWebPush } = await vi.importActual('web-push')
    const keys = realWebPush.generateVAPIDKeys()
    expect(() => realWebPush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey))
      .not.toThrow()
  })

  it('is https, not a mailto carrying somebody real', () => {
    expect(VAPID_SUBJECT.startsWith('https://')).toBe(true)
  })
})

// Vercel's Node default is 10s. This route's cost scales with subscribers, and
// being cut off mid-loop means pushes sent whose rules were never written back
// — which the next tick sends again, as a duplicate notification.
describe('route config', () => {
  it('raises maxDuration above the default, within the Hobby ceiling', () => {
    expect(config.maxDuration).toBeGreaterThan(10)
    expect(config.maxDuration).toBeLessThanOrEqual(60)
  })
})

describe('bearerMatches', () => {
  it('accepts the exact token', () => {
    expect(bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true)
  })

  it('rejects a wrong token of the same length', () => {
    expect(bearerMatches('Bearer a-long-enough-shared-secreT', SECRET)).toBe(false)
  })

  it('rejects a correct prefix', () => {
    expect(bearerMatches('Bearer a-long-enough', SECRET)).toBe(false)
  })

  it('rejects a bare token with no scheme', () => {
    expect(bearerMatches(SECRET, SECRET)).toBe(false)
  })

  // Both halves absent must not read as a match. An unset environment variable
  // would otherwise let an unauthenticated caller in through the front door.
  it('rejects when either side is empty', () => {
    expect(bearerMatches('Bearer ', '')).toBe(false)
    expect(bearerMatches('', '')).toBe(false)
    expect(bearerMatches(undefined, SECRET)).toBe(false)
    expect(bearerMatches(`Bearer ${SECRET}`, undefined)).toBe(false)
  })
})

describe('push-evaluate handler', () => {
  it('refuses anything that is not a POST', async () => {
    const r = res()
    await handler({ method: 'GET', headers: { authorization: `Bearer ${SECRET}` } }, r)
    expect(r.statusCode).toBe(405)
  })

  it('refuses an unauthenticated POST', async () => {
    const r = res()
    await handler({ method: 'POST', headers: {} }, r)
    expect(r.statusCode).toBe(401)
  })

  it('refuses a POST carrying the wrong token', async () => {
    const r = res()
    await handler({ method: 'POST', headers: { authorization: 'Bearer nope' } }, r)
    expect(r.statusCode).toBe(401)
  })

  // The donor-email-worker ran for months returning 404s that pg_cron logged as
  // successes. A misconfigured sender must be loud in the one place an operator
  // can see it — the cron log's status code — rather than answering 200.
  //
  // Grouped rather than one-per-variable because the Supabase URL has a
  // documented fallback to the VITE_ pair (the same project, the same rule as
  // api/chain-data.js). Writing this as a flat loop asserted that deleting
  // SUPABASE_URL alone was fatal, which it is not — the loop went red and the
  // fallback was the reason.
  const REQUIRED = [
    ['PUSH_EVALUATE_SECRET'],
    ['VAPID_PRIVATE_KEY'],
    ['VITE_VAPID_PUBLIC_KEY'],
    ['SUPABASE_SERVICE_ROLE_KEY'],
    ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
  ]

  it.each(REQUIRED)('answers 503 rather than 200 without %s', async (...keys) => {
    for (const key of keys) delete process.env[key]
    const r = res()
    await handler({ method: 'POST', headers: { authorization: `Bearer ${SECRET}` } }, r)
    expect(r.statusCode).toBe(503)
  })

  it('accepts the VITE_ Supabase URL when the unprefixed one is absent', async () => {
    delete process.env.SUPABASE_URL
    process.env.VITE_SUPABASE_URL = 'https://project.supabase.co'
    const r = res()
    await handler({ method: 'POST', headers: { authorization: `Bearer ${SECRET}` } }, r)
    expect(r.statusCode).toBe(200)
  })

  it('checks configuration before the token, so a 503 is never a 401 in disguise', async () => {
    delete process.env.PUSH_EVALUATE_SECRET
    const r = res()
    await handler({ method: 'POST', headers: { authorization: `Bearer ${SECRET}` } }, r)
    expect(r.statusCode).toBe(503)
  })

  it('is never cached', async () => {
    const r = res()
    await handler({ method: 'GET', headers: {} }, r)
    expect(r.headers['Cache-Control']).toBe('no-store')
  })

  // Today's real case: the table is empty. It must cost nothing — no upstream
  // request, no push, no write.
  it('sends nothing and fetches nothing when no subscription has rules', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    select.mockResolvedValue({ data: [{ id: '1', endpoint: 'https://x', rules: [] }], error: null })

    const r = res()
    await handler({ method: 'POST', headers: { authorization: `Bearer ${SECRET}` } }, r)

    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ subscriptions: 0, sent: 0 })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('reports the read failing rather than reporting success', async () => {
    select.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const r = res()
    await handler({ method: 'POST', headers: { authorization: `Bearer ${SECRET}` } }, r)
    expect(r.statusCode).toBe(502)
  })
})
