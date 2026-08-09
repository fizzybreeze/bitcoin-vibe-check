import { describe, it, expect } from 'vitest'
import { describeTrend, describeDifficulty } from '../seriesLabel.js'

// The labels half of the accessibility pass (roadmap §5). A recharts sparkline
// is an SVG with no text in it, so without these a screen reader is not told
// the number has a history at all.

describe('describeTrend', () => {
  it('gives the reading, not the picture', () => {
    // "A line chart showing the trend" describes pixels. First, last, direction
    // and range are what someone looking at the line actually takes from it.
    expect(describeTrend('Fear and Greed', [45, 60, 30, 72], { period: '30 days' }))
      .toBe('Fear and Greed over 30 days: 45 to 72, rising. Low 30, high 72.')
  })

  it('names the direction rather than leaving it to be inferred', () => {
    expect(describeTrend('Vibe Score', [80, 40])).toContain('falling')
    expect(describeTrend('Vibe Score', [40, 80])).toContain('rising')
    expect(describeTrend('Vibe Score', [50, 90, 50])).toContain('unchanged')
  })

  it('adds the range only when the line left its own endpoints', () => {
    // "40 to 60, rising. Low 40, high 60." repeats itself, and a repetition is
    // an actual delay when it is being read aloud rather than skimmed.
    expect(describeTrend('Vibe Score', [40, 50, 60])).toBe('Vibe Score: 40 to 60, rising.')
    expect(describeTrend('Vibe Score', [50, 50])).toBe('Vibe Score: 50 to 50, unchanged.')
    // But a round trip is exactly what the endpoints hide, so it is reported.
    expect(describeTrend('Vibe Score', [50, 90, 50]))
      .toBe('Vibe Score: 50 to 50, unchanged. Low 50, high 90.')
  })

  it('returns null for an empty or absent series rather than describing nothing', () => {
    // Both call sites render no chart at all in this state, so a label here
    // would announce an element that is not on the page.
    expect(describeTrend('Vibe Score', [])).toBeNull()
    expect(describeTrend('Vibe Score', null)).toBeNull()
    expect(describeTrend('Vibe Score', undefined)).toBeNull()
  })

  it('ignores gaps instead of reading NaN out loud', () => {
    expect(describeTrend('Vibe Score', [null, 40, NaN, 60, undefined]))
      .toBe('Vibe Score: 40 to 60, rising.')
  })

  it('keeps one decimal for fractional readings and none for whole ones', () => {
    expect(describeTrend('Mayer', [1.25, 1.5])).toBe('Mayer: 1.3 to 1.5, rising.')
    expect(describeTrend('Fee', [3, 9], { unit: ' sat/vB' }))
      .toBe('Fee: 3 sat/vB to 9 sat/vB, rising.')
  })
})

describe('describeDifficulty', () => {
  it('says where the value sits on the scale, which is the bar\'s whole content', () => {
    expect(describeDifficulty(3.2))
      .toBe('Difficulty adjustment: 3.2% faster, on a scale from 10% slower to 10% faster.')
    expect(describeDifficulty(-3.2))
      .toBe('Difficulty adjustment: 3.2% slower, on a scale from 10% slower to 10% faster.')
  })

  it('says outright when the bar has clamped', () => {
    // The bar caps at ±10%. A reader told only "14.0% faster" would picture a
    // fuller bar than is actually drawn.
    expect(describeDifficulty(14)).toContain('At or beyond the end of the scale.')
    expect(describeDifficulty(3.2)).not.toContain('end of the scale')
  })

  it('distinguishes unchanged from unknown', () => {
    // The bar renders nothing at all when difficulty has not loaded, and a
    // centred bar when it is genuinely 0 — two different facts.
    expect(describeDifficulty(0)).toContain('unchanged')
    expect(describeDifficulty(null)).toBe('Difficulty adjustment: not yet known.')
    expect(describeDifficulty(NaN)).toBe('Difficulty adjustment: not yet known.')
  })
})
