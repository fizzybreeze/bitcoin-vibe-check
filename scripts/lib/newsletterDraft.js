/**
 * The day's newsletter draft, composed from stored snapshot rows.
 *
 * "Satoshi's Weekly Brief" exists and the signup works; newsletters go quiet
 * because *writing* them is manual. The value in this one was never the prose —
 * it is the numbers, which are already collected, already formatted and already
 * have a rendering pipeline. This removes the expensive part and leaves the
 * cheap part to a person.
 *
 * ── What this deliberately does not do ─────────────────────────────────────
 *
 * **It never sends anything.** There is no beehiiv call here, no API key and no
 * new secret, so "keep a human in the send loop" is structural rather than a
 * policy someone could quietly change. An automated dashboard publishing
 * automated commentary about markets is fine 364 days a year and mortifying on
 * the day of a crash.
 *
 * **It does not rasterise a card.** `/og-live.png` already renders the current
 * numbers on request — that is §3.3's machinery, reached at read time instead
 * of duplicated at write time — so the draft links it rather than installing a
 * browser into a daily job to make a second copy of the same picture. The cost
 * of that choice is stated in the draft itself: the image is *live*, so a draft
 * read a week late links a card showing that week's numbers, not the ones in
 * the text beside it. It is right for a draft that goes out the same day and
 * wrong for an archive, and saying so is cheaper than pretending otherwise.
 *
 * ── The rule that actually matters ─────────────────────────────────────────
 *
 * The Vibe Score delta is the one figure here that is not simply read off a
 * row, and it is the one that can be confidently wrong. `computeVibeScore`
 * degrades rather than vanishing — a row missing MVRV still returns a plausible
 * number on renormalised weights — which is right for the live card and wrong
 * for a *comparison*, because the whole claim a delta makes is that its two
 * ends are the same measurement. That is v1.6.9's rule for the sparkline, and
 * it is reused here rather than re-decided: a previous row is comparable only
 * if it reproduces all seven inputs. An incomparable one omits the delta
 * instead of printing a difference between two different methodologies.
 */

import {
  computeVibeScore, computeVibeSummary, computeVibeDimensions, vibeDimensionValues,
} from '../../src/lib/calculations.js'
import { vibeInputsFromMetrics, vibeSufficiency } from './metrics.js'

/** Where the live card is served. Rendered per request, hence the caveat above. */
export const LIVE_CARD_URL = 'https://www.bitcoinvibecheck.com/og-live.png'
export const SITE_URL = 'https://www.bitcoinvibecheck.com'

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** A row's Vibe Score, or null when the row cannot produce one at all. */
export function vibeFromRow(row) {
  if (!row?.metrics) return null
  return computeVibeScore(vibeInputsFromMetrics(row.metrics))
}

/**
 * The change in Vibe Score against the previous day, or null.
 *
 * Null covers four distinct cases and deliberately does not distinguish them in
 * the output — no previous row, a previous row that cannot be scored, a
 * previous row that is not fully replayable, and today not being scoreable
 * either. A newsletter saying "we could not compare today with yesterday
 * because MVRV was missing" is worse than one that simply does not mention
 * yesterday.
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

/** "up 4", "down 2", "level" — the delta as a reader would say it. */
export function describeDelta(delta) {
  if (!isNum(delta) || delta === 0) return delta === 0 ? 'level with yesterday' : null
  return `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} on yesterday`
}

const fmtUsd = (v) => `$${Math.round(v).toLocaleString('en-US')}`
const fmtPct = (v, dp = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`

/**
 * The body lines, each present only if the metric behind it is.
 *
 * A missing figure drops its whole line rather than printing an em-dash. This
 * is `ogModelIsRenderable`'s rule in a second place: a shorter newsletter reads
 * as a shorter newsletter, where one carrying "MVRV: —" reads as broken, and
 * the second is far more expensive than the first.
 */
export function metricLines(m = {}) {
  const lines = []
  if (isNum(m.price_usd)) {
    const change = isNum(m.change_24h_pct) ? ` (${fmtPct(m.change_24h_pct, 2)} on the day)` : ''
    lines.push(`- **Price** — ${fmtUsd(m.price_usd)}${change}`)
  }
  if (isNum(m.fear_greed_value)) {
    const label = m.fear_greed_label ? ` · ${m.fear_greed_label}` : ''
    lines.push(`- **Fear & Greed** — ${m.fear_greed_value}${label}`)
  }
  if (isNum(m.mayer_multiple)) lines.push(`- **Mayer Multiple** — ${m.mayer_multiple.toFixed(2)}×`)
  if (isNum(m.mvrv_value))     lines.push(`- **MVRV** — ${m.mvrv_value.toFixed(2)}`)
  if (isNum(m.fee_fastest_sv)) lines.push(`- **Fastest fee** — ${m.fee_fastest_sv} sat/vB`)
  if (isNum(m.hashrate_eh)) {
    const trend = isNum(m.hashrate_trend_30d) ? ` (${fmtPct(m.hashrate_trend_30d)} over 30 days)` : ''
    lines.push(`- **Hash rate** — ${m.hashrate_eh} EH/s${trend}`)
  }
  if (isNum(m.block_height)) lines.push(`- **Block height** — ${m.block_height.toLocaleString('en-US')}`)
  return lines
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
 * than betting that the long form never moves, which is a cheaper bet to hold
 * than to check. The tests below pin the strings; they do not, and cannot,
 * prove the independence.
 */
export function formatDate(iso) {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/**
 * The draft, or null when there is nothing worth drafting.
 *
 * `today` and `previous` are `metric_snapshots` rows. `asOf` is the date the
 * job believes it is drafting for, so a stale newest row can be reported rather
 * than silently drafted as today's news.
 */
export function buildNewsletterDraft({ today, previous = null, asOf = null } = {}) {
  if (!today?.metrics) return null
  const m = today.metrics
  const lines = metricLines(m)
  // A draft with no figures in it is not a short newsletter, it is an empty
  // one — and a person opening it learns nothing that the job's own log did
  // not already say.
  if (lines.length === 0) return null

  const vibe = vibeFromRow(today)
  // The same two calls `App.jsx` makes, in the same order, so the sentence in
  // the draft is the sentence on the dashboard rather than a second opinion.
  const summary = computeVibeSummary(
    vibeDimensionValues(computeVibeDimensions(vibeInputsFromMetrics(m)))
  )
  const delta = vibeDelta(vibe, previous)
  const deltaPhrase = describeDelta(delta)

  const capturedOn = (today.captured_at ?? '').slice(0, 10)
  const dateLabel = formatDate(capturedOn) ?? capturedOn
  // Only ever a warning, never a refusal: a stale row still contains real
  // numbers, and the person reading this is better served by the draft plus a
  // note than by an empty page.
  const stale = asOf && capturedOn && asOf !== capturedOn

  const subject = isNum(vibe?.score)
    ? `Bitcoin Vibe Check — ${dateLabel}: ${vibe.score}, ${vibe.label}`
    : `Bitcoin Vibe Check — ${dateLabel}`

  const body = []
  body.push(`# ${subject}`, '')
  if (stale) {
    body.push(
      `> ⚠️ The newest snapshot is from **${dateLabel}**, not ${formatDate(asOf) ?? asOf}.`,
      '> Today\'s capture may have failed — check the run log before sending.',
      ''
    )
  }

  if (isNum(vibe?.score)) {
    const movement = deltaPhrase ? `, ${deltaPhrase}` : ''
    body.push(`**The vibe today is ${vibe.score} — ${vibe.label}**${movement}.`, '')
    if (summary) body.push(summary, '')
    // Said out loud rather than left in the number, on the same reasoning the
    // live card carries "Scored on N of M inputs".
    if (vibe.inputsUsed < vibe.inputsTotal) {
      body.push(
        `_Scored on ${vibe.inputsUsed} of ${vibe.inputsTotal} inputs — one or more sources ` +
        'were unavailable, so the weights were renormalised._',
        ''
      )
    }
    if (!deltaPhrase) {
      body.push(
        '_No comparison with yesterday: the previous snapshot is missing or cannot ' +
        'reproduce all seven inputs, so a difference between the two would be a ' +
        'methodology change drawn as a movement._',
        ''
      )
    }
  } else {
    body.push(
      '**No Vibe Score today** — too few live inputs to compose one, so the ' +
      'numbers below stand on their own.',
      ''
    )
  }

  body.push('## The numbers', '', ...lines, '')
  body.push(
    `![Today's Vibe card](${LIVE_CARD_URL})`,
    '',
    `_That image renders live at ${LIVE_CARD_URL} — it shows the numbers at the ` +
    'moment it is loaded, so it matches the text above only while this draft is ' +
    'current. Download it if you are sending later._',
    ''
  )
  body.push('---', '', `Read the live dashboard at [bitcoinvibecheck.com](${SITE_URL}).`, '')
  body.push(
    '_Draft generated from the daily snapshot. Nothing has been sent — edit this, ' +
    'or throw it away._',
  )

  return { subject, markdown: body.join('\n'), stale: Boolean(stale), hasDelta: deltaPhrase != null }
}

/**
 * The newest usable row and the one before it, from an unordered query result.
 *
 * Ordering is re-derived rather than trusted, and future-dated rows are
 * dropped — both the same rules `mvrvFallback.js` applies to this table, and
 * for the same reason: a row dated tomorrow would otherwise pin itself as
 * "today" forever.
 */
export function pickRows(rows, now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  const usable = (Array.isArray(rows) ? rows : [])
    .filter(r => typeof r?.captured_at === 'string' && r.captured_at.slice(0, 10) <= today)
    .sort((a, b) => b.captured_at.localeCompare(a.captured_at))
  return { today: usable[0] ?? null, previous: usable[1] ?? null }
}
