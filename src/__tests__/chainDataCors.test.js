import { describe, it, expect } from 'vitest'
import { resolveAllowedOrigin } from '../../api/chain-data.js'

// The route previously sent Access-Control-Allow-Origin: *, letting any site
// proxy through it and burn the BGeometrics quota (15 req/day on the free tier).
describe('resolveAllowedOrigin', () => {
  it('allows the apex domain', () => {
    expect(resolveAllowedOrigin('https://bitcoinvibecheck.com'))
      .toBe('https://bitcoinvibecheck.com')
  })

  it('allows the www subdomain', () => {
    expect(resolveAllowedOrigin('https://www.bitcoinvibecheck.com'))
      .toBe('https://www.bitcoinvibecheck.com')
  })

  it('allows Vercel preview deployments over https', () => {
    const preview = 'https://bitcoin-vibe-check-abc123-fizzybreeze-projects.vercel.app'
    expect(resolveAllowedOrigin(preview)).toBe(preview)
  })

  it('rejects an unrelated origin', () => {
    expect(resolveAllowedOrigin('https://evil.example.com')).toBeNull()
  })

  it('rejects a lookalike domain that merely contains the allowed host', () => {
    expect(resolveAllowedOrigin('https://bitcoinvibecheck.com.evil.example')).toBeNull()
  })

  it('rejects a lookalike that merely ends with vercel.app as a substring', () => {
    // "notvercel.app" ends with the literal string but is a different domain,
    // so suffix matching must be on a dot boundary.
    expect(resolveAllowedOrigin('https://something.notvercel.app')).toBeNull()
  })

  it('rejects plain http preview origins', () => {
    expect(resolveAllowedOrigin('http://foo.vercel.app')).toBeNull()
  })

  it('returns null when no Origin header was sent (same-origin request)', () => {
    expect(resolveAllowedOrigin(undefined)).toBeNull()
    expect(resolveAllowedOrigin('')).toBeNull()
  })

  it('returns null for a malformed Origin', () => {
    expect(resolveAllowedOrigin('not-a-url')).toBeNull()
  })
})
