import { describe, it, expect } from 'vitest'
import {
  buildNewsletterDraft, vibeDelta, describeDelta, metricLines, pickRows,
  formatDate, vibeFromRow, LIVE_CARD_URL,
} from '../../scripts/lib/newsletterDraft.js'

// The draft is generated unattended and read by a person who is about to send
// it to subscribers, which puts the bar in an unusual place: the failure that
// matters is not "the job crashed" but "the job produced a confident sentence
// that is wrong". Every assertion below is about that.

/** A row that reproduces all seven Vibe Score inputs — the comparable case. */
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

describe('the Vibe Score delta', () => {
  it('is reported when both days reproduce all seven inputs', () => {
    const today = row('2026-08-11', full())
    const prev  = row('2026-08-10', full({ fear_greed_value: 40 }))
    const delta = vibeDelta(vibeFromRow(today), prev)
    expect(typeof delta).toBe('number')
    expect(delta).toBeGreaterThan(0)
  })

  it('is withheld when yesterday cannot reproduce all seven', () => {
    // This is the whole point. `computeVibeScore` degrades rather than
    // vanishing, so a row missing MVRV still returns a plausible number — on
    // renormalised weights. Subtracting it from today's is a methodology change
    // drawn as a movement, which is precisely the mistake v1.6.9 refused for
    // the sparkline.
    const today = row('2026-08-11', full())
    const prev  = row('2026-08-10', full({ mvrv_value: null }))
    expect(vibeFromRow(prev)?.score).toEqual(expect.any(Number)) // it *does* score
    expect(vibeDelta(vibeFromRow(today), prev)).toBeNull()       // and is still refused
  })

  it('is withheld when there is no previous row at all', () => {
    expect(vibeDelta(vibeFromRow(row('2026-08-11', full())), null)).toBeNull()
  })

  it('says so in the draft rather than leaving the omission unexplained', () => {
    const draft = buildNewsletterDraft({ today: row('2026-08-11', full()), previous: null })
    expect(draft.hasDelta).toBe(false)
    expect(draft.markdown).toContain('No comparison with yesterday')
  })

  it('reads as a person would say it, and distinguishes no-change from no-data', () => {
    expect(describeDelta(4)).toBe('up 4 on yesterday')
    expect(describeDelta(-2)).toBe('down 2 on yesterday')
    // Not the same claim: one says the vibe held, the other says we cannot tell.
    expect(describeDelta(0)).toBe('level with yesterday')
    expect(describeDelta(null)).toBeNull()
  })
})

describe('a missing metric drops its line', () => {
  it('never prints a placeholder where a figure should be', () => {
    const lines = metricLines(full({ mvrv_value: null, fee_fastest_sv: null }))
    expect(lines.join('\n')).not.toContain('—\n')
    expect(lines.some(l => l.includes('MVRV'))).toBe(false)
    expect(lines.some(l => l.includes('Fastest fee'))).toBe(false)
    expect(lines.some(l => l.includes('Price'))).toBe(true)
  })

  it('drops the qualifier without dropping the figure it qualifies', () => {
    const lines = metricLines(full({ change_24h_pct: null, hashrate_trend_30d: null }))
    expect(lines.find(l => l.includes('Price'))).toBe('- **Price** — $96,500')
    expect(lines.find(l => l.includes('Hash rate'))).toBe('- **Hash rate** — 812.4 EH/s')
  })

  it('refuses to draft at all when there are no figures', () => {
    // A draft with nothing in it is not a short newsletter; it wastes the one
    // moment of attention this job gets.
    expect(buildNewsletterDraft({ today: row('2026-08-11', {}) })).toBeNull()
    expect(buildNewsletterDraft({ today: null })).toBeNull()
  })
})

describe('the draft degrades rather than inventing', () => {
  it('drops the score from the subject line when the day cannot be scored', () => {
    // Below MIN_DIMENSIONS the score is null. The subject is built around it,
    // so this is the one place a null would render as "undefined" to a reader.
    const bare = { price_usd: 96500, block_height: 900123 }
    const draft = buildNewsletterDraft({ today: row('2026-08-11', bare) })
    expect(draft).not.toBeNull()
    expect(draft.subject).toBe('Bitcoin Vibe Check — 11 August 2026')
    expect(draft.subject).not.toMatch(/null|undefined|NaN/)
    expect(draft.markdown).toContain('No Vibe Score today')
  })

  it('says outright when the score stood on fewer inputs than it has', () => {
    const draft = buildNewsletterDraft({ today: row('2026-08-11', full({ mvrv_value: null })) })
    expect(draft.markdown).toMatch(/Scored on \d of \d inputs/)
  })

  it('never renders a null, undefined or NaN anywhere in the body', () => {
    for (const metrics of [full(), full({ mvrv_value: null }), { price_usd: 1, block_height: 2 }]) {
      const draft = buildNewsletterDraft({ today: row('2026-08-11', metrics) })
      expect(draft.markdown).not.toMatch(/\bnull\b|\bundefined\b|NaN/)
    }
  })
})

describe('a stale row is flagged, not silently drafted as today', () => {
  it('banners the draft when the newest snapshot is not the day asked for', () => {
    const draft = buildNewsletterDraft({
      today: row('2026-08-09', full()), asOf: '2026-08-11',
    })
    expect(draft.stale).toBe(true)
    expect(draft.markdown).toContain('9 August 2026')
    expect(draft.markdown).toContain('capture may have failed')
  })

  it('does not banner a current one', () => {
    const draft = buildNewsletterDraft({ today: row('2026-08-11', full()), asOf: '2026-08-11' })
    expect(draft.stale).toBe(false)
    expect(draft.markdown).not.toContain('capture may have failed')
  })
})

describe('picking the two rows', () => {
  it('re-derives the ordering rather than trusting the query', () => {
    const rows = [row('2026-08-09', full()), row('2026-08-11', full()), row('2026-08-10', full())]
    const { today, previous } = pickRows(rows, new Date('2026-08-11T12:00:00Z'))
    expect(today.captured_at).toContain('2026-08-11')
    expect(previous.captured_at).toContain('2026-08-10')
  })

  it('drops a future-dated row instead of letting it pin itself as today', () => {
    const rows = [row('2026-08-12', full()), row('2026-08-11', full())]
    const { today } = pickRows(rows, new Date('2026-08-11T12:00:00Z'))
    expect(today.captured_at).toContain('2026-08-11')
  })

  it('survives an empty or malformed result', () => {
    expect(pickRows([]).today).toBeNull()
    expect(pickRows(null).today).toBeNull()
    expect(pickRows([{ metrics: full() }]).today).toBeNull()
  })
})

describe('the card link and its caveat', () => {
  it('links the live render rather than embedding a stale copy', () => {
    const draft = buildNewsletterDraft({ today: row('2026-08-11', full()) })
    expect(draft.markdown).toContain(LIVE_CARD_URL)
  })

  it('says the image is live, because that is the cost of not rasterising one', () => {
    // Without this the draft silently promises that the picture matches the
    // numbers beside it, which is true only on the day it is generated.
    const draft = buildNewsletterDraft({ today: row('2026-08-11', full()) })
    expect(draft.markdown).toMatch(/renders live/)
  })
})

describe('the draft never claims to have sent anything', () => {
  it('says outright that nothing has been sent', () => {
    const draft = buildNewsletterDraft({ today: row('2026-08-11', full()) })
    expect(draft.markdown).toContain('Nothing has been sent')
  })
})

describe('the date is spelled out', () => {
  it('renders the months this draft can print', () => {
    // Deliberately *not* titled "is ICU-independent", which is what the first
    // draft claimed. Measured: `toLocaleDateString('en-GB', { month: 'long' })`
    // is byte-identical on ICU 78, so nothing here distinguishes the two — the
    // v1.6.9 "Sept"/"Sep" divergence is the short form only. This pins the
    // output; the reason for the lookup table is in the module.
    expect(formatDate('2026-09-04')).toBe('4 September 2026')
    expect(formatDate('2026-08-11')).toBe('11 August 2026')
    expect(formatDate('not-a-date')).toBeNull()
  })
})
