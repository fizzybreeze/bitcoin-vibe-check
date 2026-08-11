import { describe, it, expect } from 'vitest'
import {
  buildNewsletterDraft, vibeDelta, describeDelta, pickRows, pickWeek, shouldDraft,
  formatDate, formatDay, vibeFromRow, changePct, weekPrices, blockProduction,
  situationSection, vibeSection, networkSection, sentimentSection, dominanceSection,
  LIVE_CARD_URL, PUBLISH_WEEKDAY, WEEK_SPAN_DAYS,
} from '../../scripts/lib/newsletterDraft.js'

// The brief is generated unattended and read by a person about to send it to
// subscribers, which puts the bar in an unusual place: the failure that matters
// is not "the job crashed" but "the job produced a confident sentence that is
// wrong". Every assertion below is about that.

/** A row that reproduces all seven Vibe Score inputs — the comparable case. */
const full = (over = {}) => ({
  price_usd: 96500,
  change_24h_pct: 1.84,
  ath_usd: 126000,
  market_cap_usd: 1.9e12,
  volume_24h_usd: 20e9,
  btc_dominance_pct: 56.2,
  fear_greed_value: 62,
  fear_greed_label: 'Greed',
  mayer_multiple: 1.21,
  ma_200d_usd: 79752,
  power_law_fair_value: 174000,
  mvrv_value: 2.1,
  mvrv_date: '2026-08-10',
  price_change_30d_pct: 8.2,
  hashrate_eh: 812.4,
  hashrate_trend_30d: 4.25,
  fee_fastest_sv: 7,
  fee_30m_sv: 4,
  fee_1h_sv: 3,
  fee_economy_sv: 1,
  mempool_tx_count: 42000,
  mempool_vsize_mb: 12.5,
  block_height: 900123,
  remaining_blocks: 1200,
  difficulty_change_pct: 2.4,
  ...over,
})

/** Captures land mid-morning; the hour is deliberately not round. */
const row = (date, metrics = full(), time = '07:41:37.759Z') =>
  ({ captured_at: `${date}T${time}`, metrics })

/** A Sunday-to-Sunday week of eight captures, newest first as the query returns them. */
function week(overrides = {}) {
  const days = ['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
    '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09']
  const rows = days.map(d => row(d, full(overrides[d] ?? {})))
  return pickWeek([...rows].reverse(), new Date('2026-08-09T12:00:00Z'))
}

describe('the publishing gate', () => {
  it('composes on the publishing day and stands down on the other six', () => {
    // 9 August 2026 is a Sunday; 10 August is the Monday after it.
    expect(new Date('2026-08-09T12:00:00Z').getUTCDay()).toBe(PUBLISH_WEEKDAY)
    expect(shouldDraft({ now: new Date('2026-08-09T12:00:00Z') }).ok).toBe(true)
    expect(shouldDraft({ now: new Date('2026-08-10T12:00:00Z') }).ok).toBe(false)
  })

  it('names the day it stood down on, because a silent skip looks like a break', () => {
    const gate = shouldDraft({ now: new Date('2026-08-10T12:00:00Z') })
    expect(gate.reason).toContain('Monday')
    expect(gate.reason).toContain('Sunday')
  })

  it('can be forced, so a brief is reviewable without waiting for a Sunday', () => {
    expect(shouldDraft({ now: new Date('2026-08-10T12:00:00Z'), force: true }).ok).toBe(true)
  })
})

describe('picking the week', () => {
  it('takes the newest capture, the one a week back, and the day the week opened', () => {
    const w = week()
    expect(w.latest.captured_at).toContain('2026-08-09')
    expect(w.weekAgo.captured_at).toContain('2026-08-02')
    // Monday, not last Sunday: "opened the week at" is the first capture *after*
    // the one every comparison is drawn against.
    expect(w.weekOpen.captured_at).toContain('2026-08-03')
    expect(w.window).toHaveLength(7)
    expect(w.window.map(r => r.captured_at.slice(0, 10))).toEqual([
      '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06',
      '2026-08-07', '2026-08-08', '2026-08-09',
    ])
  })

  it('finds the nearest row to a week back rather than counting rows down', () => {
    // Two mornings failed mid-week. Counting eight rows down lands on 31 July;
    // the calendar has not moved just because the captures did.
    const rows = ['2026-08-02', '2026-08-03', '2026-08-06', '2026-08-09']
      .map(d => row(d))
    const w = pickWeek(rows, new Date('2026-08-09T12:00:00Z'))
    expect(w.weekAgo.captured_at).toContain('2026-08-02')
  })

  it('accepts a capture inside the tolerance and refuses one outside it', () => {
    const inside = pickWeek([row('2026-08-09'), row('2026-08-04')], new Date('2026-08-09T12:00:00Z'))
    expect(inside.weekAgo.captured_at).toContain('2026-08-04') // five days: still a week
    const outside = pickWeek([row('2026-08-09'), row('2026-07-28')], new Date('2026-08-09T12:00:00Z'))
    // Twelve days is not a week, and labelling it as one is the whole failure.
    expect(outside.weekAgo).toBeNull()
  })

  it('re-derives the ordering rather than trusting the query', () => {
    const rows = [row('2026-08-04'), row('2026-08-09'), row('2026-08-02'), row('2026-08-07')]
    const w = pickWeek(rows, new Date('2026-08-09T12:00:00Z'))
    expect(w.latest.captured_at).toContain('2026-08-09')
    expect(w.weekAgo.captured_at).toContain('2026-08-02')
  })

  it('drops a future-dated row instead of letting it pin itself as now', () => {
    const w = pickWeek([row('2026-08-10'), row('2026-08-09'), row('2026-08-02')],
      new Date('2026-08-09T12:00:00Z'))
    expect(w.latest.captured_at).toContain('2026-08-09')
  })

  it('survives an empty, malformed or metric-less result', () => {
    expect(pickWeek([]).latest).toBeNull()
    expect(pickWeek(null).latest).toBeNull()
    expect(pickWeek([{ metrics: full() }]).latest).toBeNull()
    expect(pickWeek([{ captured_at: '2026-08-09T07:00:00Z' }]).latest).toBeNull()
  })
})

describe('block production', () => {
  it('divides by the measured interval, not by an assumed seven days', () => {
    // This is the module's headline trap. GitHub's scheduler drifts by hours,
    // so the two captures bounding a week are routinely ~155 hours apart, not
    // 168. Assuming a week here turns a normal week into "the network ran 8%
    // slow" — a fabricated story about miners, stated confidently.
    const w = {
      latest:  row('2026-08-09', full({ block_height: 961_978 }), '07:00:00.000Z'),
      weekAgo: row('2026-08-02', full({ block_height: 961_073 }), '21:00:00.000Z'),
    }
    const b = blockProduction(w)
    expect(b.mined).toBe(905)
    expect(b.elapsedHours).toBeCloseTo(154, 0)
    // 154 hours at ten minutes is 924 blocks, so 905 is slightly slow. Against
    // a full week's 1,008 it would read as dramatically slow.
    expect(b.expectedBlocks).toBe(924)
    expect(b.avgBlockSeconds).toBeCloseTo(612.8, 0)
  })

  it('reads the subsidy off the schedule rather than assuming this epoch', () => {
    const b = blockProduction({
      latest:  row('2026-08-09', full({ block_height: 900_100 }), '07:00:00.000Z'),
      weekAgo: row('2026-08-02', full({ block_height: 900_000 }), '07:00:00.000Z'),
    })
    expect(b.newBtc).toBeCloseTo(100 * 3.125, 6)
  })

  it('refuses rather than inventing when the chain tip did not move or is missing', () => {
    const at = (h) => row('2026-08-09', full({ block_height: h }))
    expect(blockProduction({ latest: at(900_000), weekAgo: at(900_000) })).toBeNull()
    expect(blockProduction({ latest: at(900_000), weekAgo: at(null) })).toBeNull()
    expect(blockProduction({ latest: at(900_000) })).toBeNull()
  })
})

describe('the week in prose', () => {
  it('states the open, the close and both comparisons', () => {
    const w = week({ '2026-08-03': { price_usd: 90000 }, '2026-08-02': { price_usd: 88000 } })
    const text = situationSection(w).join(' ')
    expect(text).toContain('opened the week at $90,000')
    expect(text).toContain('$96,500')
    expect(text).toContain("last week's close of $88,000")
  })

  it('labels the high and low as daily captures, not as the week\'s extremes', () => {
    // There is one reading a morning; whatever happened overnight happened
    // unobserved. Printing these as "the week's high" is a claim the data
    // cannot support, and it is the kind a reader would never think to doubt.
    const w = week({ '2026-08-05': { price_usd: 99000 }, '2026-08-07': { price_usd: 91000 } })
    const text = situationSection(w).join(' ')
    expect(text).toContain('highest daily reading was $99,000')
    expect(text).toContain('$91,000')
    expect(text).toMatch(/intraday highs and lows go unobserved/)
  })

  it('drops the high/low sentence when the week never moved', () => {
    const text = situationSection(week()).join(' ')
    expect(text).not.toContain('highest daily reading')
  })

  it('reports the power law gap in the direction it computed it', () => {
    // Price 96,500 against fair value 174,000 is 44.5% *below* fair value.
    // Fair value is 80% above price — a different number — and the first draft
    // printed the first figure inside the second sentence.
    const text = sentimentSection(week()).join(' ')
    expect(text).toContain('Price is 44.5% below the power law fair value of $174,000')
    expect(text).not.toMatch(/44\.5% above/)
  })

  it('reports the Mayer gap against the moving average it names', () => {
    const text = sentimentSection(week()).join(' ')
    expect(text).toContain('21.0% above the 200-day moving average of $79,752')
  })

  it('names the Fear & Greed move, its classification and its range', () => {
    const w = week({ '2026-08-02': { fear_greed_value: 40, fear_greed_label: 'Fear' },
      '2026-08-05': { fear_greed_value: 71 } })
    const text = sentimentSection(w).join(' ')
    expect(text).toContain('up from 40 last week')
    expect(text).toContain('moved from Fear to Greed')
    expect(text).toContain('ranged between 62 and 71')
  })

  it('says the classification held rather than inventing a move', () => {
    expect(sentimentSection(week()).join(' ')).toContain('classification remains Greed')
  })

  it('measures dominance in points, because a percentage of a percentage is not one', () => {
    const w = week({ '2026-08-02': { btc_dominance_pct: 52.1 } })
    const text = dominanceSection(w).join(' ')
    expect(text).toContain('up 4.1 points')
    expect(text).not.toContain('essentially flat')
  })

  it('calls a fraction of a point flat rather than reporting it as a move', () => {
    const w = week({ '2026-08-02': { btc_dominance_pct: 56.3 } })
    expect(dominanceSection(w).join(' ')).toContain('essentially flat')
  })

  it('averages volume across the week rather than quoting one morning', () => {
    // A single 24h volume reading routinely halves between consecutive
    // captures; quoting this morning's as "the week" is a coin-flip.
    const w = week({ '2026-08-09': { volume_24h_usd: 4e9 } })
    const text = dominanceSection(w).join(' ')
    expect(text).toContain('averaged across the week')
    expect(text).not.toContain('$4.0bn')
  })
})

describe('the network section', () => {
  it('states the pace against what the same interval should have produced', () => {
    const w = week({ '2026-08-09': { block_height: 961_978 }, '2026-08-02': { block_height: 961_073 } })
    const text = networkSection(w).join(' ')
    expect(text).toMatch(/Blocks averaged \d+\.\d minutes/)
    expect(text).toContain('905 were mined')
    expect(text).toContain('issuing 2,828 BTC')
  })

  it('dates the retarget from the week\'s own block time, not from a nominal ten minutes', () => {
    // 1,200 blocks at the week's observed pace is a different date from 1,200
    // blocks at ten minutes, and the second is the one that is always slightly
    // wrong.
    const slow = week({ '2026-08-09': { block_height: 961_500, remaining_blocks: 1200 },
      '2026-08-02': { block_height: 961_000 } })
    const nominal = networkSection(week({ '2026-08-09': { block_height: null } })).join(' ')
    const observed = networkSection(slow).join(' ')
    expect(observed).toContain('due in 1,200 blocks')
    expect(observed).not.toEqual(nominal)
  })

  it('collapses the fee tiers when they all agree', () => {
    const w = week({ '2026-08-09': { fee_fastest_sv: 1, fee_30m_sv: 1, fee_1h_sv: 1, fee_economy_sv: 1 } })
    expect(networkSection(w).join(' ')).toContain('Every fee tier is at 1 sat/vB')
  })

  it('reads the congestion band off the shared scale in bytes, not megabytes', () => {
    // `congestionBand` takes vsize in bytes and the column stores megabytes.
    // Feeding it the raw column silently reports every mempool as Low.
    const busy = week({ '2026-08-09': { mempool_vsize_mb: 120 } })
    const quiet = week({ '2026-08-09': { mempool_vsize_mb: 2 } })
    expect(networkSection(busy).join(' ')).toContain('congestion is High')
    expect(networkSection(quiet).join(' ')).toContain('congestion is Low')
  })

  it('places the halving from the height it read', () => {
    const text = networkSection(week()).join(' ')
    expect(text).toContain('Block height is 900,123')
    expect(text).toContain('149,877 blocks remain until the next halving')
  })
})

describe('the Vibe Score delta', () => {
  it('is reported when both ends reproduce all seven inputs', () => {
    const w = week({ '2026-08-02': { fear_greed_value: 40 } })
    expect(vibeSection(w).join(' ')).toMatch(/up \d+ on last week/)
  })

  it('is withheld when last week cannot reproduce all seven', () => {
    // `computeVibeScore` degrades rather than vanishing, so a row missing MVRV
    // still returns a plausible number — on renormalised weights. Subtracting
    // it is a methodology change drawn as a movement.
    const w = week({ '2026-08-02': { mvrv_value: null } })
    expect(vibeFromRow(w.weekAgo)?.score).toEqual(expect.any(Number)) // it *does* score
    expect(vibeDelta(vibeFromRow(w.latest), w.weekAgo)).toBeNull()    // and is still refused
    expect(vibeSection(w).join(' ')).toContain('No comparison with last week')
  })

  it('does not withhold the raw week-over-week figures for the same reason', () => {
    // The replay rule is about the composite only. Price and hash rate are
    // single columns; a week-over-week move in one is comparable whatever else
    // was missing that morning.
    const w = week({ '2026-08-02': { mvrv_value: null, price_usd: 88000, hashrate_eh: 700 } })
    expect(situationSection(w).join(' ')).toContain("last week's close of $88,000")
    expect(networkSection(w).join(' ')).toContain('on last week')
  })

  it('reads as a person would say it, and distinguishes no-change from no-data', () => {
    expect(describeDelta(4, { over: 'last week' })).toBe('up 4 on last week')
    expect(describeDelta(-2, { over: 'last week' })).toBe('down 2 on last week')
    expect(describeDelta(0, { over: 'last week' })).toBe('level with last week')
    expect(describeDelta(null)).toBeNull()
    // The daily Nostr post shares this function and must keep its own wording.
    expect(describeDelta(4)).toBe('up 4 on yesterday')
  })
})

describe('the brief degrades rather than inventing', () => {
  it('drops the section a metric group is missing entirely', () => {
    const bare = { price_usd: 96500, block_height: 900123 }
    const w = pickWeek([row('2026-08-09', bare)], new Date('2026-08-09T12:00:00Z'))
    const draft = buildNewsletterDraft({ week: w })
    expect(draft).not.toBeNull()
    expect(draft.sections).not.toContain('DOMINANCE')
    expect(draft.sections).toContain('THE SITUATION')
  })

  it('never prints a placeholder where a figure should be', () => {
    const w = week({ '2026-08-09': { mvrv_value: null, hashrate_eh: null, btc_dominance_pct: null } })
    const draft = buildNewsletterDraft({ week: w })
    expect(draft.markdown).not.toContain('MVRV is')
    expect(draft.markdown).not.toContain('Hash rate stands at')
    expect(draft.markdown).not.toMatch(/\bnull\b|\bundefined\b|NaN/)
  })

  it('never renders a null, undefined or NaN anywhere in the body', () => {
    const cases = [week(), week({ '2026-08-09': { mvrv_value: null } }),
      pickWeek([row('2026-08-09', { price_usd: 1, block_height: 2 })], new Date('2026-08-09T12:00:00Z'))]
    for (const w of cases) {
      expect(buildNewsletterDraft({ week: w }).markdown).not.toMatch(/\bnull\b|\bundefined\b|NaN/)
    }
  })

  it('refuses to draft at all when there are no figures', () => {
    const empty = pickWeek([row('2026-08-09', {})], new Date('2026-08-09T12:00:00Z'))
    expect(buildNewsletterDraft({ week: empty })).toBeNull()
    expect(buildNewsletterDraft({ week: { latest: null } })).toBeNull()
    expect(buildNewsletterDraft({})).toBeNull()
  })

  it('says outright when the score stood on fewer inputs than it has', () => {
    const w = week({ '2026-08-09': { mvrv_value: null } })
    expect(buildNewsletterDraft({ week: w }).markdown).toMatch(/Scored on \d of \d inputs/)
  })
})

describe('the two sections the dashboard will not write', () => {
  it('leaves both empty and says they are not generated', () => {
    // Composing these from the figures above would read exactly like sourced
    // commentary and would not be — the one mistake a newsletter cannot take
    // back. WHY IT MATTERS needs macro and flow data nothing here fetches, and
    // ONE THING TO WATCH is a trading read, which §7 puts out of scope.
    const md = buildNewsletterDraft({ week: week() }).markdown
    expect(md).toContain('## WHY IT MATTERS')
    expect(md).toContain('## ONE THING TO WATCH')
    expect(md.match(/nothing here is generated/g)).toHaveLength(2)
  })

  it('puts them where they are read, not appended at the end', () => {
    const md = buildNewsletterDraft({ week: week() }).markdown
    expect(md.indexOf('## THE VIBE')).toBeLessThan(md.indexOf('## WHY IT MATTERS'))
    expect(md.indexOf('## WHY IT MATTERS')).toBeLessThan(md.indexOf('## NETWORK'))
    expect(md.indexOf('## DOMINANCE')).toBeLessThan(md.indexOf('## ONE THING TO WATCH'))
  })
})

describe('a stale or lonely capture is flagged, not silently drafted', () => {
  it('banners the brief when the newest snapshot is not the day asked for', () => {
    const w = week()
    const draft = buildNewsletterDraft({ week: w, asOf: '2026-08-11' })
    expect(draft.stale).toBe(true)
    expect(draft.markdown).toContain('capture may have failed')
  })

  it('does not banner a current one', () => {
    const draft = buildNewsletterDraft({ week: week(), asOf: '2026-08-09' })
    expect(draft.stale).toBe(false)
    expect(draft.markdown).not.toContain('capture may have failed')
  })

  it('says so when there is no row a week back at all', () => {
    // Every week-over-week sentence silently disappears in this case, which
    // from the reader's side is indistinguishable from a quiet week.
    const w = pickWeek([row('2026-08-09')], new Date('2026-08-09T12:00:00Z'))
    const draft = buildNewsletterDraft({ week: w })
    expect(draft.hasWeekAgo).toBe(false)
    expect(draft.markdown).toContain('week-over-week comparison is missing')
  })
})

describe('the subject line', () => {
  it('carries the issue number when the caller knows it, padded as published', () => {
    expect(buildNewsletterDraft({ week: week(), issue: 12 }).subject)
      .toBe("Satoshi's Weekly Brief 012 — 9 August 2026")
  })

  it('omits the number rather than guessing one', () => {
    expect(buildNewsletterDraft({ week: week() }).subject)
      .toBe("Satoshi's Weekly Brief — 9 August 2026")
  })

  it('never renders a null, undefined or NaN', () => {
    for (const issue of [null, undefined, NaN]) {
      expect(buildNewsletterDraft({ week: week(), issue }).subject).not.toMatch(/null|undefined|NaN/)
    }
  })
})

describe('the card link and its caveat', () => {
  it('links the live render rather than embedding a stale copy', () => {
    expect(buildNewsletterDraft({ week: week() }).markdown).toContain(LIVE_CARD_URL)
  })

  it('says the image is live, because that is the cost of not rasterising one', () => {
    expect(buildNewsletterDraft({ week: week() }).markdown).toMatch(/renders live/)
  })
})

describe('the brief never claims to have sent anything', () => {
  it('says outright that nothing has been sent', () => {
    expect(buildNewsletterDraft({ week: week() }).markdown).toContain('Nothing has been sent')
  })
})

describe('the sign-off', () => {
  it('carries a Satoshi quote, the same list the dashboard footer rotates', () => {
    const md = buildNewsletterDraft({ week: week() }).markdown
    expect(md).toMatch(/— Satoshi Nakamoto, (Bitcointalk|Bitcoin Whitepaper)/)
  })

  it('is stable for a given week and moves on to the next one after it', () => {
    const at = (day) => buildNewsletterDraft({
      week: pickWeek([row(day)], new Date(`${day}T12:00:00Z`)),
    }).markdown.match(/> _"(.+)"_/)[1]
    expect(at('2026-08-09')).toBe(at('2026-08-09'))
    expect(at('2026-08-09')).not.toBe(at('2026-08-16'))
  })
})

describe('the shared helpers the daily Nostr post also uses', () => {
  it('still picks today and yesterday for the daily post', () => {
    const rows = [row('2026-08-07'), row('2026-08-09'), row('2026-08-08')]
    const { today, previous } = pickRows(rows, new Date('2026-08-09T12:00:00Z'))
    expect(today.captured_at).toContain('2026-08-09')
    expect(previous.captured_at).toContain('2026-08-08')
  })

  it('refuses a change against a missing or zero base', () => {
    expect(changePct(10, 0)).toBeNull()
    expect(changePct(10, null)).toBeNull()
    expect(changePct(null, 10)).toBeNull()
    expect(changePct(11, 10)).toBeCloseTo(10)
  })
})

describe('dates', () => {
  it('spells the month out', () => {
    // Deliberately *not* titled "is ICU-independent", which is what an earlier
    // version claimed. Measured: `toLocaleDateString('en-GB', { month: 'long' })`
    // is byte-identical on ICU 78, so nothing here distinguishes the two — the
    // v1.6.9 "Sept"/"Sep" divergence is the short form only.
    expect(formatDate('2026-09-04')).toBe('4 September 2026')
    expect(formatDate('2026-08-11')).toBe('11 August 2026')
    expect(formatDate('not-a-date')).toBeNull()
  })

  it('names the weekday and drops the year inside the week', () => {
    expect(formatDay('2026-08-09')).toBe('Sunday 9 August')
    expect(formatDay('2026-08-10')).toBe('Monday 10 August')
    expect(formatDay('not-a-date')).toBeNull()
  })

  it('agrees with the span the module publishes', () => {
    expect(WEEK_SPAN_DAYS).toBe(7)
  })
})

describe('weekPrices', () => {
  it('reports how many captures it actually saw', () => {
    expect(weekPrices(week()).readings).toBe(7)
  })

  it('ignores a capture with no price rather than treating it as zero', () => {
    const w = week({ '2026-08-05': { price_usd: null } })
    const p = weekPrices(w)
    expect(p.readings).toBe(6)
    expect(p.low.value).toBeGreaterThan(0)
  })
})
