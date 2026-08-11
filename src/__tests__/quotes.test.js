import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SATOSHI_QUOTES, quoteForWeek } from '../lib/quotes.js'

// Resolved from the repo root, as `icons.test.js` does: vitest runs there.

describe('the quote list', () => {
  it('is well-formed, because a half-filled entry renders as a dangling dash', () => {
    expect(SATOSHI_QUOTES.length).toBeGreaterThan(1)
    for (const q of SATOSHI_QUOTES) {
      expect(q.text.length).toBeGreaterThan(10)
      expect(q.attribution).toMatch(/^Satoshi Nakamoto, /)
    }
  })

  it('is read by the dashboard footer rather than copied into it', () => {
    // The footer and the weekly brief quoting different Satoshis is the
    // two-different-oranges bug in prose, and it would be invisible: both
    // renderings look completely correct on their own.
    const src = readFileSync(resolve('src/components/SatoshiQuote.jsx'), 'utf8')
    expect(src).toContain("from '../lib/quotes.js'")
    expect(src).not.toMatch(/attribution:\s*'Satoshi Nakamoto/)
  })
})

describe('the weekly quote', () => {
  it('is the same all week and different the week after', () => {
    // Deterministic from the date, so a brief re-generated for a past week
    // reproduces the quote that brief carried — there is nowhere to keep a
    // counter, and the only durable store this job has is a table of prices.
    for (const day of ['2026-08-09', '2026-08-10', '2026-08-14', '2026-08-15']) {
      expect(quoteForWeek(day)).toBe(quoteForWeek('2026-08-09'))
    }
    expect(quoteForWeek('2026-08-16')).not.toBe(quoteForWeek('2026-08-09'))
  })

  it('advances by exactly one quote per week and wraps rather than running off the end', () => {
    const seen = []
    for (let i = 0; i < SATOSHI_QUOTES.length + 1; i++) {
      const day = new Date(Date.UTC(2026, 7, 9) + i * 7 * 86_400_000).toISOString().slice(0, 10)
      seen.push(SATOSHI_QUOTES.indexOf(quoteForWeek(day)))
    }
    expect(seen).not.toContain(-1)
    expect(new Set(seen.slice(0, SATOSHI_QUOTES.length)).size).toBe(SATOSHI_QUOTES.length)
    expect(seen[SATOSHI_QUOTES.length]).toBe(seen[0])
  })

  it('answers null for a date it cannot read rather than picking quote zero', () => {
    expect(quoteForWeek('not-a-date')).toBeNull()
    expect(quoteForWeek(undefined)).toBeNull()
  })
})
