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

  // Anyone can deploy to vercel.app for free, so matching the bare suffix would
  // have let any Vercel-hosted page proxy through this route and burn the
  // 15 req/day BGeometrics quota — the exact hole the allowlist exists to close.
  it('rejects Vercel deployments belonging to someone else', () => {
    expect(resolveAllowedOrigin('https://evil-app.vercel.app')).toBeNull()
    expect(resolveAllowedOrigin('https://someone-elses-projects.vercel.app')).toBeNull()
    expect(resolveAllowedOrigin('https://bitcoin-vibe-check-attacker-projects.vercel.app')).toBeNull()
  })

  it('allows the legacy bitcoin-dashboard-neon alias', () => {
    expect(resolveAllowedOrigin('https://bitcoin-dashboard-neon.vercel.app'))
      .toBe('https://bitcoin-dashboard-neon.vercel.app')
  })

  it('allows every shape of this project’s own preview URL', () => {
    for (const origin of [
      'https://bitcoin-vibe-check-fizzybreeze-projects.vercel.app',
      'https://bitcoin-vibe-check-git-main-fizzybreeze-projects.vercel.app',
      'https://bitcoin-vibe-check-n2di9u65l-fizzybreeze-projects.vercel.app',
    ]) {
      expect(resolveAllowedOrigin(origin)).toBe(origin)
    }
  })
})
