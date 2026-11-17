import { describe, it, expect } from 'vitest'
import { formatMvrvDate, mvrvCaption } from '../mvrvCaption.js'

describe('mvrvCaption', () => {
  // The free tier runs a week behind, so a bare date reads as a stalled feed.
  it('says the date is when the data is from', () => {
    expect(mvrvCaption('2026-11-09', 'live')).toBe('Data as of 9 Nov')
  })

  it('names the snapshot fallback as well', () => {
    expect(mvrvCaption('2026-09-30', 'snapshot')).toBe('Data as of 30 Sep · from daily snapshot')
  })

  it('renders no caption rather than a broken one', () => {
    for (const d of [null, undefined, '', 'yesterday', '2026-13-01', '2026-11-00', 20261109]) {
      expect(mvrvCaption(d, 'live')).toBeNull()
    }
  })

  it('spells every month the same way on every ICU build', () => {
    expect(Array.from({ length: 12 }, (_, i) =>
      formatMvrvDate(`2026-${String(i + 1).padStart(2, '0')}-01`).split(' ')[1]))
      .toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
  })
})
