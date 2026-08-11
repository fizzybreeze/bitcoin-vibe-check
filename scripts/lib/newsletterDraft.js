/**
 * Satoshi's Weekly Brief, composed from the stored snapshot rows.
 *
 * The newsletter exists and the signup works; newsletters go quiet because
 * *writing* them is manual. The value in this one was never the prose — it is
 * the numbers, which are already collected, already formatted and already have
 * a rendering pipeline. This removes the expensive part and leaves the cheap
 * part to a person.
 *
 * ── Weekly, not daily, and what that changed ───────────────────────────────
 *
 * v1.9.0 shipped this as a *daily* draft: a bullet list of that morning's
 * figures. That is not what the brief is. The brief is a **weekly bulletin** —
 * the current readings at the moment of publishing, wrapped around a record of
 * what moved across the preceding seven days — and the difference is not
 * cadence, it is that almost every sentence in it is a *comparison*. A daily
 * draft has one row and can only state; a weekly one has eight and can say what
 * happened. So the composition is rebuilt around a week rather than re-timed:
 * `pickWeek` selects the three rows that matter (this Sunday, last Sunday, and
 * the Monday the week opened on) plus the window between them, and the sections
 * below are prose paragraphs in the brief's own voice rather than a metric dump.
 *
 * ── What this deliberately does not do ─────────────────────────────────────
 *
 * **It never sends anything.** There is no beehiiv call here, no API key and no
 * new secret, so "keep a human in the send loop" is structural rather than a
 * policy someone could quietly change.
 *
 * **It does not write the two sections that are not arithmetic.** The brief's
 * WHY IT MATTERS and ONE THING TO WATCH carry macro decisions, ETF flows,
 * long-term-holder supply and levels to watch — none of which this dashboard
 * fetches, and the last of which is a trading call, which §7 puts out of scope
 * for the product outright. Those sections come through as marked, empty blocks
 * addressed to the writer. Generating them from the figures to hand would be
 * inventing sourcing, which is the one failure a newsletter cannot survive: a
 * confident sentence about something nobody measured.
 *
 * **It does not rasterise a card.** `/og-live.png` already renders the current
 * numbers on request, so the draft links it rather than installing a browser
 * into a scheduled job to make a second copy of the same picture. The cost is
 * stated in the draft itself: the image is *live*, so a brief read a week late
 * links a card showing that week's numbers, not the ones in the text.
 *
 * ── The two rules that actually matter ─────────────────────────────────────
 *
 * **The Vibe Score delta is held to the replay rule; the raw figures are not.**
 * `computeVibeScore` degrades rather than vanishing, so a row missing MVRV
 * still returns a plausible number on renormalised weights — right for the live
 * card, wrong for a *comparison*, whose whole claim is that its two ends are the
 * same measurement. That is v1.6.9's sparkline rule, reused rather than
 * re-decided. It applies to the composite **only**: price, hash rate and Fear &
 * Greed are single readings off one column each, and a week-over-week move in
 * one of them is comparable whatever else was missing that morning.
 *
 * **Elapsed time is measured, never assumed.** Block production is the brief's
 * best "what happened this week" figure and the easiest to get confidently
 * wrong: the two captures bounding the week are not 168 hours apart — GitHub's
 * scheduler drifts by hours, so on real rows they have been 154. Dividing a
 * height delta by an assumed week produced "the network ran 11% slow" out of a
 * week that actually ran slightly fast. Every rate here divides by the interval
 * between the two `captured_at` timestamps.
 */

import {
  computeVibeScore, computeVibeSummary, computeVibeDimensions, vibeDimensionValues,
  computeIssuedSupply, computeAthDistance,
} from '../../src/lib/calculations.js'
import { blocksToNextHalving, epochPercentage } from '../../src/utils.js'
import { congestionBand } from '../../src/lib/scales.js'
import { quoteForWeek } from '../../src/lib/quotes.js'
import { vibeInputsFromMetrics, vibeSufficiency } from './metrics.js'

/** Where the live card is served. Rendered per request, hence the caveat below. */
export const LIVE_CARD_URL = 'https://www.bitcoinvibecheck.com/og-live.png'
export const SITE_URL = 'https://www.bitcoinvibecheck.com'

/** The title the brief is published under, minus its issue number. */
export const BRIEF_TITLE = "Satoshi's Weekly Brief"

/**
 * Sunday, because the brief reads as written on a Sunday morning — "last
 * week's close", "Monday's opening". Publishing it on another day would make
 * every one of those phrases wrong, so this is the anchor the prose is built
 * against rather than a scheduling preference.
 */
export const PUBLISH_WEEKDAY = 0

/**
 * The issue number, anchored to a known one rather than counted anywhere.
 *
 * The brief goes out numbered, and the number has to survive a job that keeps
 * no state: there is nowhere to increment a counter, and the only durable store
 * this job has is a table of market metrics. One published issue and its date
 * fix the whole sequence, forwards and backwards — so a brief re-made for a
 * past week carries the number that week's brief carried, which a counter could
 * never promise.
 *
 * 16 August 2026 is the first Sunday this automation runs, and it is issue 005.
 */
export const ISSUE_ANCHOR = Object.freeze({ date: '2026-08-16', number: 5 })

/**
 * Which issue a brief published on `iso` is.
 *
 * Floored rather than rounded, so a brief forced on a Wednesday belongs to the
 * issue of the Sunday that opened its week rather than being pulled forward
 * into the next one. Null below issue 1 — a brief dated before the sequence
 * began has no number, and printing "issue 000" or a negative one is worse than
 * printing none.
 */
export function issueNumber(iso) {
  const ms = Date.parse(`${iso}T00:00:00Z`)
  const anchor = Date.parse(`${ISSUE_ANCHOR.date}T00:00:00Z`)
  if (!Number.isFinite(ms)) return null
  const n = ISSUE_ANCHOR.number + Math.floor((ms - anchor) / (7 * 86_400_000))
  return n >= 1 ? n : null
}

/** How far apart the two ends of "the week" are meant to be, and the slack. */
export const WEEK_SPAN_DAYS = 7
/**
 * Two days either side, so one failed capture does not silently cancel the
 * brief's entire week-over-week half. Beyond that the comparison stops being a
 * week and the sections that need one drop out rather than mislabelling a
 * ten-day move as seven.
 */
export const WEEK_SPAN_TOLERANCE_DAYS = 2

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const num = (v) => (isNum(v) ? v : null)
const dayOf = (row) => (row?.captured_at ?? '').slice(0, 10)
const daysBetween = (a, b) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)

const fmtUsd    = (v) => `$${Math.round(v).toLocaleString('en-US')}`
const fmtInt    = (v) => Math.round(v).toLocaleString('en-US')
const fmtPct    = (v, dp = 1) => `${v.toFixed(dp)}%`
const fmtSigned = (v, dp = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(dp)}%`
/** "up 2.3%" / "down 2.3%" / "flat" — a move as a sentence rather than a sign. */
const moveWords = (v, dp = 1) =>
  Math.abs(v) < 0.05 ? 'flat' : `${v > 0 ? 'up' : 'down'} ${Math.abs(v).toFixed(dp)}%`

/** Percentage change, or null when either end is missing or the base is zero. */
export function changePct(now, then) {
  if (!isNum(now) || !isNum(then) || then === 0) return null
  return ((now - then) / then) * 100
}

/** A row's Vibe Score, or null when the row cannot produce one at all. */
export function vibeFromRow(row) {
  if (!row?.metrics) return null
  return computeVibeScore(vibeInputsFromMetrics(row.metrics))
}

/**
 * The change in Vibe Score against an earlier row, or null.
 *
 * Null covers four distinct cases and deliberately does not distinguish them in
 * the output — no earlier row, one that cannot be scored, one that is not fully
 * replayable, and today not being scoreable either. A newsletter explaining
 * that it could not compare this week with last because MVRV was missing is
 * worse than one that simply does not mention last week.
 */
export function vibeDelta(today, previous) {
  if (!isNum(today?.score)) return null
  if (!previous?.metrics) return null
  // The comparability rule, not a second copy of it.
  if (!vibeSufficiency(previous.metrics).sufficient) return null
  const before = vibeFromRow(previous)
  if (!isNum(before?.score)) return null
  return today.score - before.score
}

/**
 * "up 4 on last week", "level with yesterday" — the delta as a reader says it.
 *
 * `over` is a parameter because the same arithmetic serves two publications on
 * two cadences: the daily Nostr post compares with yesterday, this brief with
 * last week. Two functions would be two chances for them to disagree about what
 * a zero means.
 */
export function describeDelta(delta, { over = 'yesterday' } = {}) {
  if (!isNum(delta)) return null
  if (delta === 0) return `level with ${over}`
  return `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} on ${over}`
}

/**
 * 11 August 2026, from a table rather than from ICU.
 *
 * Honest about its own reach, because a mutation proved it: swapping this for
 * `toLocaleDateString('en-GB', { month: 'long' })` produces **byte-identical**
 * output on ICU 78, so no test here can tell the two apart. The v1.6.9 finding
 * this borrows from is about the *short* form — September renders as "Sept" on
 * current ICU and "Sep" on older builds — and the long form does not currently
 * differ. The table is kept anyway because it removes the dependency rather
 * than betting that the long form never moves.
 */
export function formatDate(iso) {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * "Monday 4 August" — the weekday matters in prose that says "on Monday", and
 * the year does not: every date in the body is inside the week the title has
 * already dated, so repeating 2026 four times is noise.
 */
export function formatDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${formatDate(iso).split(' ')[1]}`
}

/** "A, B and C" — clause lists that read as a sentence rather than a CSV. */
function joinClauses(parts) {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * The newest usable row and the one before it, from an unordered query result.
 *
 * Kept for the daily Nostr post, which compares with yesterday. The brief uses
 * `pickWeek` below.
 */
export function pickRows(rows, now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  const usable = (Array.isArray(rows) ? rows : [])
    .filter(r => typeof r?.captured_at === 'string' && r.captured_at.slice(0, 10) <= today)
    .sort((a, b) => b.captured_at.localeCompare(a.captured_at))
  return { today: usable[0] ?? null, previous: usable[1] ?? null }
}

/**
 * The week: where it ended, where it started, and what it did in between.
 *
 * - `latest`   — this Sunday's capture. Everything the brief states as "now".
 * - `weekAgo`  — last Sunday's, the other end of every week-over-week claim.
 * - `weekOpen` — the first capture *after* last Sunday, i.e. Monday's, which is
 *   what "opened the week at" means.
 * - `window`   — every capture from Monday to Sunday, oldest first, which is
 *   what the week's high and low readings are drawn from.
 *
 * Ordering is re-derived rather than trusted and future-dated rows are dropped,
 * the same two rules `mvrvFallback.js` applies to this table: a row dated
 * tomorrow would otherwise pin itself as "now" forever.
 */
export function pickWeek(rows, now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  const usable = (Array.isArray(rows) ? rows : [])
    .filter(r => typeof r?.captured_at === 'string' && r.metrics && dayOf(r) <= today)
    .sort((a, b) => b.captured_at.localeCompare(a.captured_at))

  const latest = usable[0] ?? null
  if (!latest) return { latest: null, weekAgo: null, weekOpen: null, window: [] }

  const end = dayOf(latest)
  // The row nearest to a week back, not merely the eighth row down: a gap in
  // the captures shifts the count without shifting the calendar.
  let weekAgo = null
  let closest = Infinity
  for (const row of usable.slice(1)) {
    const off = Math.abs(daysBetween(end, dayOf(row)) - WEEK_SPAN_DAYS)
    if (off <= WEEK_SPAN_TOLERANCE_DAYS && off < closest) {
      closest = off
      weekAgo = row
    }
  }

  const window = usable
    .filter(r => (weekAgo
      ? dayOf(r) > dayOf(weekAgo)
      : daysBetween(end, dayOf(r)) < WEEK_SPAN_DAYS))
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at))

  return { latest, weekAgo, weekOpen: window[0] ?? null, window }
}

/**
 * Whether today is a publishing day.
 *
 * The gate lives here rather than in the workflow's `if:` because GitHub
 * Actions has no weekday expression, so the alternative is a shell step whose
 * only test is next Sunday. `force` is the manual path — the brief is
 * re-makeable for any day, and having to wait for a Sunday to look at one is
 * how a scheduled thing goes unexamined until it is wrong in public.
 */
export function shouldDraft({ now = new Date(), force = false } = {}) {
  if (force) return { ok: true, reason: 'forced' }
  const day = now.getUTCDay()
  if (day !== PUBLISH_WEEKDAY) {
    return {
      ok: false,
      reason: `${WEEKDAYS[day]} is not the publishing day (${WEEKDAYS[PUBLISH_WEEKDAY]})`,
    }
  }
  return { ok: true, reason: 'publishing day' }
}

/**
 * The week's price arc.
 *
 * `high` and `low` are the highest and lowest *daily captures*, which is not the
 * same claim as the week's high and low — there is one reading a morning, and
 * whatever happened overnight happened unobserved. The brief says so where it
 * prints them; this is the reason it has to.
 */
export function weekPrices({ latest, weekAgo, weekOpen, window } = {}) {
  const now = num(latest?.metrics?.price_usd)
  const readings = (window ?? [])
    .map(r => ({ value: num(r.metrics?.price_usd), day: dayOf(r) }))
    .filter(r => isNum(r.value))

  let high = null
  let low  = null
  for (const r of readings) {
    if (!high || r.value > high.value) high = r
    if (!low  || r.value < low.value)  low  = r
  }

  const open      = num(weekOpen?.metrics?.price_usd)
  const lastClose = num(weekAgo?.metrics?.price_usd)
  return {
    now,
    open,
    lastClose,
    high,
    low,
    readings: readings.length,
    vsOpenPct:      changePct(now, open),
    vsLastClosePct: changePct(now, lastClose),
  }
}

/**
 * What the chain did this week: blocks, pace, and the coins that came with them.
 *
 * Every rate divides by the *measured* interval between the two captures. See
 * the module header — assuming 168 hours here fabricates a story about miners
 * out of GitHub's scheduler drifting.
 */
export function blockProduction({ latest, weekAgo } = {}) {
  const to   = num(latest?.metrics?.block_height)
  const from = num(weekAgo?.metrics?.block_height)
  if (!isNum(to) || !isNum(from) || to <= from) return null

  const elapsedMs = Date.parse(latest.captured_at) - Date.parse(weekAgo.captured_at)
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return null

  const mined = to - from
  const elapsedSeconds = elapsedMs / 1000
  return {
    mined,
    elapsedHours:    elapsedSeconds / 3600,
    avgBlockSeconds: elapsedSeconds / mined,
    // What a perfectly-paced network would have produced over the *same*
    // interval, which is the only honest thing to compare `mined` against.
    expectedBlocks:  Math.round(elapsedSeconds / 600),
    // Reused rather than re-derived: the subsidy schedule already lives in one
    // place, and it is the place that knows where the halvings are.
    newBtc: computeIssuedSupply(to) - computeIssuedSupply(from),
  }
}

// ── The sections ─────────────────────────────────────────────────────────────
//
// Each returns an array of paragraphs, and each is empty when it has nothing to
// say. A missing figure drops its clause, and a clause that would leave a
// sentence hollow drops the sentence — `ogModelIsRenderable`'s rule in prose. A
// shorter brief reads as a shorter brief; one carrying "Hash rate stands at —"
// reads as broken, and the second is far more expensive than the first.

export function situationSection(week) {
  const p = weekPrices(week)
  if (!isNum(p.now)) return []

  const endLabel = formatDay(dayOf(week.latest))
  const out = []

  const opening = []
  if (isNum(p.open) && dayOf(week.weekOpen) !== dayOf(week.latest)) {
    opening.push(`Bitcoin opened the week at ${fmtUsd(p.open)} and trades at ${fmtUsd(p.now)} on ${endLabel}`)
    if (isNum(p.vsOpenPct)) opening.push(`${moveWords(p.vsOpenPct)} on the week's opening`)
  } else {
    opening.push(`Bitcoin trades at ${fmtUsd(p.now)} on ${endLabel}`)
  }
  if (isNum(p.vsLastClosePct)) {
    opening.push(`${moveWords(p.vsLastClosePct)} on last week's close of ${fmtUsd(p.lastClose)}`)
  }
  out.push(`${joinClauses(opening)}.`)

  // Only worth printing when the week actually moved: "the highest reading was
  // X and the lowest was X" on a flat week is a sentence that says nothing.
  if (p.high && p.low && p.high.value !== p.low.value) {
    out.push(
      `The highest daily reading was ${fmtUsd(p.high.value)} on ${formatDay(p.high.day)}; ` +
      `the lowest was ${fmtUsd(p.low.value)} on ${formatDay(p.low.day)}. ` +
      `_(One capture a morning across ${p.readings} days — intraday highs and lows go unobserved.)_`
    )
  }

  const m = week.latest.metrics
  const ath = computeAthDistance(p.now, num(m.ath_usd))
  if (isNum(ath)) {
    out.push(`That leaves price ${fmtPct(Math.abs(ath))} ${ath < 0 ? 'below' : 'above'} the all-time high of ${fmtUsd(m.ath_usd)}.`)
  }
  return out
}

export function vibeSection(week) {
  const vibe = vibeFromRow(week.latest)
  if (!isNum(vibe?.score)) {
    return ['There are too few live inputs to compose a Vibe Score this week, so the readings below stand on their own.']
  }

  const delta  = describeDelta(vibeDelta(vibe, week.weekAgo), { over: 'last week' })
  const summary = computeVibeSummary(
    vibeDimensionValues(computeVibeDimensions(vibeInputsFromMetrics(week.latest.metrics)))
  )

  const out = [
    `The Vibe Score reads **${vibe.score} — ${vibe.label}**${delta ? `, ${delta}` : ''}.` +
    (summary ? ` ${summary}` : ''),
  ]
  // Said out loud rather than left in the number, on the same reasoning the
  // live card carries "Scored on N of M inputs".
  if (vibe.inputsUsed < vibe.inputsTotal) {
    out.push(
      `_Scored on ${vibe.inputsUsed} of ${vibe.inputsTotal} inputs — one or more sources were ` +
      'unavailable, so the weights were renormalised._'
    )
  }
  if (!delta) {
    out.push(
      '_No comparison with last week: that snapshot is missing or cannot reproduce all seven ' +
      'inputs, and a difference between two differently-weighted scores is a methodology change ' +
      'drawn as a movement._'
    )
  }
  return out
}

export function networkSection(week) {
  const m = week.latest.metrics ?? {}
  const prev = week.weekAgo?.metrics ?? {}
  const blocks = blockProduction(week)
  const out = []

  // Hash rate, difficulty and the week's pace.
  const first = []
  if (isNum(m.hashrate_eh)) {
    const wk = changePct(m.hashrate_eh, num(prev.hashrate_eh))
    const clauses = [`Hash rate stands at ${m.hashrate_eh} EH/s`]
    if (isNum(wk))                    clauses.push(`${moveWords(wk)} on last week`)
    if (isNum(m.hashrate_trend_30d))  clauses.push(`${moveWords(m.hashrate_trend_30d, 1)} over 30 days`)
    first.push(`${joinClauses(clauses)}.`)
  }
  if (isNum(m.remaining_blocks)) {
    const secs = blocks?.avgBlockSeconds ?? 600
    const due = new Date(Date.parse(week.latest.captured_at) + m.remaining_blocks * secs * 1000)
    const when = `The next difficulty adjustment is due in ${fmtInt(m.remaining_blocks)} blocks, ` +
      `around ${formatDate(due.toISOString().slice(0, 10))}`
    first.push(isNum(m.difficulty_change_pct)
      ? `${when}, and is tracking at ${fmtSigned(m.difficulty_change_pct)}.`
      : `${when}.`)
  }
  if (blocks) {
    const off = blocks.mined - blocks.expectedBlocks
    const pace = off === 0
      ? `exactly the ${fmtInt(blocks.expectedBlocks)} a ten-minute average would have produced`
      : `${fmtInt(Math.abs(off))} ${off > 0 ? 'more' : 'fewer'} than the ` +
        `${fmtInt(blocks.expectedBlocks)} a ten-minute average would have produced`
    first.push(
      `Blocks averaged ${(blocks.avgBlockSeconds / 60).toFixed(1)} minutes: ` +
      `${fmtInt(blocks.mined)} were mined in the ${blocks.elapsedHours.toFixed(0)} hours since ` +
      `last week's capture — ${pace} — issuing ${fmtInt(blocks.newBtc)} BTC.`
    )
  }
  if (first.length) out.push(first.join(' '))

  // Fees and the mempool.
  const second = []
  const band = isNum(m.mempool_vsize_mb) ? congestionBand(m.mempool_vsize_mb * 1e6) : null
  if (band) {
    const queued = isNum(m.mempool_tx_count) ? `, with ${fmtInt(m.mempool_tx_count)} transactions queued` : ''
    second.push(`Mempool congestion is ${band.label}${queued}.`)
  }
  const tiers = [
    ['fastest',  m.fee_fastest_sv],
    ['half-hour', m.fee_30m_sv],
    ['hour',     m.fee_1h_sv],
    ['economy',  m.fee_economy_sv],
  ].filter(([, v]) => isNum(v))
  if (tiers.length) {
    const rates = new Set(tiers.map(([, v]) => v))
    second.push(rates.size === 1
      ? `Every fee tier is at ${tiers[0][1]} sat/vB.`
      : `Transactions confirm at ${tiers[0][1]} sat/vB for the ${tiers[0][0]} tier, ` +
        `${tiers[tiers.length - 1][1]} sat/vB for ${tiers[tiers.length - 1][0]}.`)
  }
  if (second.length) out.push(second.join(' '))

  // Where the chain is in its own schedule.
  if (isNum(m.block_height)) {
    const remaining = blocksToNextHalving(m.block_height)
    const third = [`Block height is ${fmtInt(m.block_height)}.`]
    // `blocksToNextHalving` counts down to a fixed height and keeps counting
    // past it, so the day after the halving this sentence would offer a
    // negative number of blocks and a date in the past. Two years away, one
    // condition, and the alternative is a brief that is obviously broken on
    // the one morning it is most read.
    if (isNum(remaining) && remaining > 0) {
      const secs = blocks?.avgBlockSeconds ?? 600
      const days = Math.round((remaining * secs) / 86_400)
      third.push(
        `${fmtInt(remaining)} blocks remain until the next halving — approximately ${fmtInt(days)} ` +
        "days at this week's average block time. The current epoch is " +
        `${fmtPct(epochPercentage(m.block_height))} complete.`
      )
    }
    out.push(third.join(' '))
  }

  return out
}

export function sentimentSection(week) {
  const m = week.latest.metrics ?? {}
  const prev = week.weekAgo?.metrics ?? {}
  const out = []

  if (isNum(m.fear_greed_value)) {
    const clauses = [`Fear & Greed reads ${m.fear_greed_value}`]
    if (isNum(prev.fear_greed_value)) {
      const d = m.fear_greed_value - prev.fear_greed_value
      clauses.push(d === 0 ? 'unchanged on last week' : `${d > 0 ? 'up' : 'down'} from ${prev.fear_greed_value} last week`)
    }
    let sentence = `${clauses.join(', ')}.`
    if (m.fear_greed_label) {
      sentence += prev.fear_greed_label && prev.fear_greed_label !== m.fear_greed_label
        ? ` The classification moved from ${prev.fear_greed_label} to ${m.fear_greed_label}.`
        : ` The classification remains ${m.fear_greed_label}.`
    }
    const values = (week.window ?? []).map(r => num(r.metrics?.fear_greed_value)).filter(isNum)
    if (values.length > 1) {
      const lo = Math.min(...values)
      const hi = Math.max(...values)
      if (lo !== hi) sentence += ` It ranged between ${lo} and ${hi} across the week.`
    }
    out.push(sentence)
  }

  const cycle = []
  if (isNum(m.mayer_multiple)) {
    let s = `The Mayer Multiple is ${m.mayer_multiple.toFixed(3)}`
    if (isNum(m.ma_200d_usd) && isNum(m.price_usd)) {
      const gap = changePct(m.price_usd, m.ma_200d_usd)
      if (isNum(gap)) {
        s += `: price is ${fmtPct(Math.abs(gap))} ${gap < 0 ? 'below' : 'above'} the 200-day ` +
             `moving average of ${fmtUsd(m.ma_200d_usd)}`
      }
    }
    cycle.push(`${s}.`)
  }
  if (isNum(m.mvrv_value)) {
    const dated = m.mvrv_date ? ` (as of ${formatDate(m.mvrv_date) ?? m.mvrv_date})` : ''
    cycle.push(`MVRV is ${m.mvrv_value.toFixed(2)}${dated}.`)
  }
  if (isNum(m.power_law_fair_value) && isNum(m.price_usd)) {
    // Phrased as price-relative-to-model, the same direction as the Mayer
    // sentence above, because the inverse is a *different number*: at $64,006
    // against $174,994 the price is 63% below fair value while fair value is
    // 173% above the price, and the first draft printed the first figure with
    // the second sentence around it.
    const gap = changePct(m.price_usd, m.power_law_fair_value)
    if (isNum(gap)) {
      cycle.push(
        `Price is ${fmtPct(Math.abs(gap))} ${gap < 0 ? 'below' : 'above'} the power law fair ` +
        `value of ${fmtUsd(m.power_law_fair_value)}.`
      )
    }
  }
  if (cycle.length) out.push(cycle.join(' '))

  return out
}

export function dominanceSection(week) {
  const m = week.latest.metrics ?? {}
  const prev = week.weekAgo?.metrics ?? {}
  if (!isNum(m.btc_dominance_pct)) return []

  const out = []
  let s = `BTC dominance is ${fmtPct(m.btc_dominance_pct, 1)}`
  if (isNum(prev.btc_dominance_pct)) {
    const pts = m.btc_dominance_pct - prev.btc_dominance_pct
    s += Math.abs(pts) < 0.5
      ? `, essentially flat on last week's ${fmtPct(prev.btc_dominance_pct, 1)}`
      : `, ${pts > 0 ? 'up' : 'down'} ${Math.abs(pts).toFixed(1)} points on last week's ${fmtPct(prev.btc_dominance_pct, 1)}`
  }
  out.push(`${s}.`)

  if (isNum(m.market_cap_usd)) {
    const wk = changePct(m.market_cap_usd, num(prev.market_cap_usd))
    let s = `Market capitalisation is $${(m.market_cap_usd / 1e12).toFixed(2)}T` +
      (isNum(wk) ? `, ${moveWords(wk)} on the week` : '')
    // Averaged across the week's captures rather than quoted from this
    // morning's, because a single 24h volume reading is the one figure here
    // that routinely halves and doubles between two consecutive mornings.
    const volumes = (week.window ?? []).map(r => num(r.metrics?.volume_24h_usd)).filter(isNum)
    if (volumes.length > 1) {
      const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length
      s += `, on $${(mean / 1e9).toFixed(1)}bn of daily volume averaged across the week`
    }
    out.push(`${s}.`)
  }
  return out
}

/**
 * A section the dashboard cannot write, addressed to the person who can.
 *
 * Deliberately loud and deliberately empty. The alternative — composing
 * something plausible out of the figures already printed above — reads exactly
 * like sourced commentary and is not, which is the one mistake a newsletter
 * cannot take back.
 */
function writerBlock(prompt) {
  return [`> ✍️ **Yours to write — nothing here is generated.** ${prompt}`]
}

const HEADINGS = [
  ['THE SITUATION',      situationSection],
  ['THE VIBE',           vibeSection],
  ['NETWORK',            networkSection],
  ['SENTIMENT',          sentimentSection],
  ['DOMINANCE',          dominanceSection],
]

/**
 * The brief, or null when there is nothing worth drafting.
 *
 * `week` is `pickWeek`'s result. `asOf` is the date the job believes it is
 * drafting for, so a stale newest row is reported rather than silently
 * published as this week's news. `issue` overrides the number derived from the
 * anchor, for the week somebody skips an issue or sends two.
 */
export function buildNewsletterDraft({ week, asOf = null, issue = null } = {}) {
  if (!week?.latest?.metrics) return null

  const sections = HEADINGS
    .map(([heading, build]) => [heading, build(week)])
    .filter(([, paragraphs]) => paragraphs.length > 0)

  // A brief with no readings in it is not a short newsletter, it is an empty
  // one — and the person opening it learns nothing the job's own log did not
  // already say.
  //
  // Counted in figures rather than in sections, which is not the same thing and
  // was not the same thing here: `vibeSection` answers an unscoreable day with
  // a sentence explaining the absence, so a row carrying *nothing* still
  // produced one non-empty section and drafted a brief whose entire body was an
  // apology. That note is worth printing beside real figures and worth nothing
  // on its own.
  const carriesFigures = sections.some(([heading]) => heading !== 'THE VIBE')
    || isNum(vibeFromRow(week.latest)?.score)
  if (!carriesFigures) return null

  const endDay    = dayOf(week.latest)
  const dateLabel = formatDate(endDay) ?? endDay
  const stale     = Boolean(asOf && endDay && asOf !== endDay)
  // Derived from the date the brief covers, not from the day the job ran: a
  // brief re-made for a past week has to carry that week's number.
  const issueNo   = isNum(issue) ? issue : issueNumber(endDay)
  const number    = isNum(issueNo) ? ` ${String(issueNo).padStart(3, '0')}` : ''
  const subject   = `${BRIEF_TITLE}${number} — ${dateLabel}`

  const body = [`# ${subject}`, '', `_${BRIEF_TITLE} is powered by [Bitcoin Vibe Check](${SITE_URL})._`, '']

  if (stale) {
    body.push(
      `> ⚠️ The newest snapshot is from **${dateLabel}**, not ${formatDate(asOf) ?? asOf}.`,
      "> This week's capture may have failed — check the run log before sending.",
      ''
    )
  }
  if (!week.weekAgo) {
    body.push(
      '> ⚠️ No snapshot within ' + `${WEEK_SPAN_DAYS - WEEK_SPAN_TOLERANCE_DAYS}–${WEEK_SPAN_DAYS + WEEK_SPAN_TOLERANCE_DAYS}` +
      ' days of this one, so every week-over-week comparison is missing rather than wrong.',
      ''
    )
  }

  for (const [heading, paragraphs] of sections) {
    body.push(`## ${heading}`, '', ...paragraphs.flatMap(p => [p, '']))
    // The two human sections sit where they sit in the published brief, so the
    // draft is edited in reading order rather than rearranged after the fact.
    if (heading === 'THE VIBE') {
      body.push('## WHY IT MATTERS', '',
        ...writerBlock(
          'The dashboard has no feed for macro decisions, ETF flows or long-term-holder ' +
          'supply. Last week\'s open question, what answered it, and what moved because of it.'
        ), '')
    }
  }

  body.push('## ONE THING TO WATCH', '',
    ...writerBlock(
      'A level, a date or an event — the interpretation is yours. The figures above are the ' +
      'record; this section is the read, and this project does not generate reads.'
    ), '')

  body.push(`![This week's Vibe card](${LIVE_CARD_URL})`, '',
    `_That image renders live at ${LIVE_CARD_URL} — it shows the numbers at the moment it is ` +
    'loaded, so it matches the text above only while this brief is current. Download it if you ' +
    'are sending later._', '')

  const quote = quoteForWeek(endDay)
  if (quote) body.push('---', '', `> _"${quote.text}"_`, `> — ${quote.attribution}`, '')

  body.push('---', '', `Check the live dashboard → [bitcoinvibecheck.com](${SITE_URL})`, '')
  body.push('_Draft generated from the daily snapshots. Nothing has been sent — edit this, or throw it away._')

  return {
    subject,
    markdown: body.join('\n'),
    stale,
    issue: isNum(issueNo) ? issueNo : null,
    hasWeekAgo: Boolean(week.weekAgo),
    sections: sections.map(([heading]) => heading),
  }
}
