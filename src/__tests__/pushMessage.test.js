import { describe, it, expect } from 'vitest'
import { pushNotification, notificationTargetUrl, clientToFocus } from '../lib/pushMessage.js'

// These three functions are the whole of what `src/sw.js`'s push listeners
// decide. The listeners themselves are two lines each, and live in a service
// worker that vitest cannot import — so this file is the only place the
// awkward payloads get exercised before a real push service sends one.

const ORIGIN = 'https://bitcoinvibecheck.com'

describe('pushNotification', () => {
  it('renders a payload the sender wrote', () => {
    const { title, options } = pushNotification(
      JSON.stringify({ title: 'Alert', body: 'BTC crossed $80,000', tag: 'rule-1', url: '/?from=push' })
    )
    expect(title).toBe('Alert')
    expect(options.body).toBe('BTC crossed $80,000')
    expect(options.tag).toBe('rule-1')
    expect(options.data).toEqual({ url: '/?from=push' })
  })

  it('shows a notification for a push sent with no payload at all', () => {
    // A push event that resolves without showing one is not silent — the
    // browser substitutes its own "site updated in the background". There is
    // no option to display nothing, only a choice of what it says.
    const { title, options } = pushNotification(undefined)
    expect(title).toBe('Bitcoin Vibe Check')
    expect(options.body).toBeTruthy()
  })

  it('treats a plain-text payload as the body', () => {
    const { title, options } = pushNotification('Fees dropped to 3 sat/vB')
    expect(title).toBe('Bitcoin Vibe Check')
    expect(options.body).toBe('Fees dropped to 3 sat/vB')
  })

  it('does not show unparseable JSON to the visitor', () => {
    // Braces on a lock screen are a sender bug rendered as a message. The
    // generic line is worse for nobody and better for that.
    const { options } = pushNotification('{"body": "unterminated')
    expect(options.body).not.toContain('{')
    expect(options.body).toBe('A metric you are watching has crossed its alert level.')
  })

  it('falls back past a field that is present but blank', () => {
    // `??` would pass "" through and hand showNotification an empty title.
    // Same trap as v1.6.5, v1.6.6 and v1.7.1.
    const { title, options } = pushNotification(JSON.stringify({ title: '   ', body: '' }))
    expect(title).toBe('Bitcoin Vibe Check')
    expect(options.body).toBe('A metric you are watching has crossed its alert level.')
  })

  it('omits the tag rather than defaulting it', () => {
    // A shared default tag would make two different alerts firing in the same
    // minute collapse into one notification, losing the second outright.
    const { options } = pushNotification(JSON.stringify({ body: 'x' }))
    expect('tag' in options).toBe(false)
  })

  it('survives a JSON payload that is not an object', () => {
    for (const raw of ['null', '42', '["a"]', '"just a string"']) {
      expect(() => pushNotification(raw)).not.toThrow()
      expect(pushNotification(raw).title).toBe('Bitcoin Vibe Check')
    }
  })
})

describe('notificationTargetUrl', () => {
  it('resolves a relative path the sender gave', () => {
    expect(notificationTargetUrl({ url: '/?from=push' }, ORIGIN)).toBe(`${ORIGIN}/?from=push`)
  })

  it('lands on the dashboard when the payload names nowhere', () => {
    expect(notificationTargetUrl(undefined, ORIGIN)).toBe(`${ORIGIN}/`)
    expect(notificationTargetUrl({}, ORIGIN)).toBe(`${ORIGIN}/`)
    expect(notificationTargetUrl({ url: '' }, ORIGIN)).toBe(`${ORIGIN}/`)
  })

  it('refuses to navigate off-origin', () => {
    // The payload is signed by nothing this app can check. A sender that is
    // ever compromised would otherwise turn a notification carrying the site's
    // own icon into an open redirect.
    expect(notificationTargetUrl({ url: 'https://evil.example/phish' }, ORIGIN)).toBe(`${ORIGIN}/`)
    expect(notificationTargetUrl({ url: '//evil.example/phish' }, ORIGIN)).toBe(`${ORIGIN}/`)
  })

  it('refuses a non-http scheme', () => {
    expect(notificationTargetUrl({ url: 'javascript:alert(1)' }, ORIGIN)).toBe(`${ORIGIN}/`)
  })

  it('lands on the dashboard when the url is unparseable', () => {
    // Almost anything resolves against a base as a relative path; an invalid
    // IPv6 literal is one of the few things that genuinely throws.
    expect(notificationTargetUrl({ url: 'http://[' }, ORIGIN)).toBe(`${ORIGIN}/`)
  })
})

describe('clientToFocus', () => {
  const client = url => ({ url, focus: () => {} })

  it('prefers an exact match', () => {
    const other = client(`${ORIGIN}/`)
    const exact = client(`${ORIGIN}/?from=push`)
    expect(clientToFocus([other, exact], `${ORIGIN}/?from=push`)).toBe(exact)
  })

  it('focuses any window on the same origin rather than opening a second copy', () => {
    // This is a single-page dashboard: a tab already open is the window the
    // visitor means, whatever query string it happens to carry.
    const open = client(`${ORIGIN}/?range=1Y`)
    expect(clientToFocus([open], `${ORIGIN}/?from=push`)).toBe(open)
  })

  it('opens a new window when nothing of ours is open', () => {
    expect(clientToFocus([], `${ORIGIN}/`)).toBeNull()
    expect(clientToFocus([client('https://elsewhere.example/')], `${ORIGIN}/`)).toBeNull()
  })

  it('ignores a client whose url does not parse', () => {
    const good = client(`${ORIGIN}/`)
    expect(clientToFocus([client('not a url'), good], `${ORIGIN}/`)).toBe(good)
  })

  it('returns null rather than throwing on a bad target', () => {
    expect(clientToFocus([client(`${ORIGIN}/`)], 'not a url')).toBeNull()
    expect(clientToFocus(undefined, `${ORIGIN}/`)).toBeNull()
  })
})
