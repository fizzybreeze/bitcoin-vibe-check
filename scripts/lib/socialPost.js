/**
 * The daily Nostr post, and — more importantly — the decision not to make one.
 *
 * §4.4 paired the newsletter draft with an automated post and this repo argued
 * against the second half: a draft is safe because a person reads it before
 * anything leaves, and a post is not. That objection was overruled deliberately,
 * so what it becomes is a **guard** rather than a veto. The reasoning is worth
 * keeping because it is what the guard is shaped around: an automated dashboard
 * publishing automated commentary about markets is fine 364 days a year and
 * mortifying on the day of a crash.
 *
 * ── The guard ──────────────────────────────────────────────────────────────
 *
 * **It refuses on velocity, not on level.** Extreme *fear* is precisely when
 * this dashboard is most useful and the post is most factual — "the vibe is 8,
 * Ice Cold" on a miserable day is an honest reading, not a gaffe. What reads
 * badly is a cheerful scheduled post on a day the market moved violently in
 * either direction, because the post is composed from a snapshot taken hours
 * earlier and the reader is looking at something else entirely.
 *
 * **A day it cannot measure counts as a volatile one.** If `change_24h_pct` is
 * missing the guard cannot do its job, and a guard that fails open would post on
 * exactly the day the data was strange. That is the one rule here most likely to
 * look like a bug and it is deliberate.
 *
 * **A stale snapshot is refused outright**, which the newsletter draft only
 * banners. A draft with a warning on it is read by a person who can act on the
 * warning; a post has no such reader, and yesterday's numbers published as
 * today's is simply wrong.
 *
 * **A degraded-but-scoreable day still posts**, carrying a compact "(5/7
 * inputs)". Requiring all seven would put a public feature behind MVRV's
 * 15-requests-a-day free tier, which is how something ends up never firing and
 * nobody noticing — the v1.8.2 trap. `computeVibeScore` already has a floor
 * (MIN_DIMENSIONS, MIN_COVERAGE) and duplicating it higher up buys nothing.
 * The delta is held to the stricter rule, because that one *is* a comparison.
 */

import { nip19 } from 'nostr-tools'
import { vibeFromRow, vibeDelta, describeDelta, SITE_URL } from './newsletterDraft.js'
import { computeVibeSummary, computeVibeDimensions, vibeDimensionValues } from '../../src/lib/calculations.js'
import { vibeInputsFromMetrics } from './metrics.js'

/**
 * The 24-hour move past which the day is left alone, in either direction.
 *
 * Ten per cent is a day people are talking about rather than a day people are
 * reading a dashboard on. It is a blunt instrument on purpose: the alternative
 * is a cleverer volatility measure that has to be right, where this only has to
 * be roughly right in the direction of saying less.
 */
export const MAX_ABS_24H_CHANGE_PCT = 10

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * Whether today should be posted at all.
 *
 * Returns `{ ok }` plus a `reason` when it refuses — the reason is logged and
 * put in the job summary, because a scheduled thing that silently does nothing
 * is indistinguishable from a scheduled thing that is broken.
 */
export function shouldPublish({ today, asOf = null } = {}) {
  if (!today?.metrics) return { ok: false, reason: 'no snapshot row to post from' }

  const capturedOn = (today.captured_at ?? '').slice(0, 10)
  if (asOf && capturedOn !== asOf) {
    return { ok: false, reason: `newest snapshot is ${capturedOn || 'undated'}, not ${asOf}` }
  }

  const vibe = vibeFromRow(today)
  if (!isNum(vibe?.score)) {
    return { ok: false, reason: 'too few inputs to compose a Vibe Score' }
  }

  const change = today.metrics.change_24h_pct
  if (!isNum(change)) {
    // Deliberately not a pass. See the header: a guard that cannot measure the
    // thing it guards against must refuse, or it is decoration.
    return { ok: false, reason: '24h change unavailable, so volatility cannot be checked' }
  }
  if (Math.abs(change) >= MAX_ABS_24H_CHANGE_PCT) {
    return {
      ok: false,
      reason: `24h change is ${change.toFixed(1)}%, beyond the ±${MAX_ABS_24H_CHANGE_PCT}% guard`,
    }
  }

  return { ok: true }
}

const fmtUsd = (v) => `$${Math.round(v).toLocaleString('en-US')}`
const fmtPct = (v, dp = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`

/**
 * The post body and its tags, or null when there is nothing to say.
 *
 * Composition is deliberately not the newsletter's: the draft is a page someone
 * edits, this is a few lines someone scrolls past. What they *share* is the
 * arithmetic — both read the score and the summary sentence off the same two
 * calls the dashboard makes, so the three cannot drift into three opinions.
 */
export function buildSocialPost({ today, previous = null } = {}) {
  if (!today?.metrics) return null
  const m = today.metrics
  const vibe = vibeFromRow(today)
  if (!isNum(vibe?.score)) return null

  const delta = describeDelta(vibeDelta(vibe, previous))
  const summary = computeVibeSummary(
    vibeDimensionValues(computeVibeDimensions(vibeInputsFromMetrics(m)))
  )
  const degraded = vibe.inputsUsed < vibe.inputsTotal
    ? ` (${vibe.inputsUsed}/${vibe.inputsTotal} inputs)`
    : ''

  const head = `Bitcoin vibe check — ${vibe.score}/100, ${vibe.label}${degraded}.` +
    (delta ? ` ${delta.charAt(0).toUpperCase()}${delta.slice(1)}.` : '')

  // Same rule as the newsletter: a missing figure drops its line rather than
  // printing a placeholder. A post is the surface where that matters most —
  // nobody reads an em-dash as "the API was down", they read it as broken.
  const stats = []
  if (isNum(m.price_usd)) {
    const ch = isNum(m.change_24h_pct) ? ` (${fmtPct(m.change_24h_pct)} 24h)` : ''
    stats.push(`Price ${fmtUsd(m.price_usd)}${ch}`)
  }
  if (isNum(m.fear_greed_value)) {
    stats.push(`Fear & Greed ${m.fear_greed_value}${m.fear_greed_label ? ` · ${m.fear_greed_label}` : ''}`)
  }
  const cycle = []
  if (isNum(m.mayer_multiple)) cycle.push(`Mayer ${m.mayer_multiple.toFixed(2)}×`)
  if (isNum(m.mvrv_value))     cycle.push(`MVRV ${m.mvrv_value.toFixed(2)}`)
  if (cycle.length) stats.push(cycle.join(' · '))
  if (isNum(m.fee_fastest_sv)) stats.push(`Fastest fee ${m.fee_fastest_sv} sat/vB`)
  if (isNum(m.hashrate_eh))    stats.push(`Hash rate ${m.hashrate_eh} EH/s`)

  const parts = [head, '', stats.join('\n')]
  if (summary) parts.push('', summary)
  parts.push('', SITE_URL, '', '#bitcoin #nostr')

  return {
    content: parts.join('\n'),
    // NIP-12 topic tags mirroring the inline hashtags, plus the canonical link.
    // Lowercased because relays and clients match `t` values literally.
    tags: [['t', 'bitcoin'], ['t', 'nostr'], ['r', SITE_URL]],
  }
}

/**
 * The unsigned NIP-01 event.
 *
 * **`created_at` comes from the snapshot, not from the clock**, and that is the
 * whole idempotency story. A Nostr event id is the SHA-256 of its serialised
 * fields, so pinning the timestamp to the day's capture makes the id a pure
 * function of the day's data: re-running the job republishes a byte-identical
 * event, which every relay already dedupes. Using `Date.now()` here would make
 * a second run a second post, and the manual dispatch this repo relies on for
 * everything else would be the thing that caused it.
 *
 * The honest limit: if the snapshot is re-captured and the *numbers* change, the
 * content changes and so does the id, which is a genuinely different post and
 * should be. That is correct rather than convenient.
 */
export function buildNostrEvent({ post, capturedAt }) {
  if (!post?.content) return null
  const seconds = Math.floor(new Date(capturedAt).getTime() / 1000)
  if (!Number.isFinite(seconds)) return null
  return { kind: 1, created_at: seconds, tags: post.tags, content: post.content }
}

/**
 * The relays to publish to.
 *
 * Several, because any one of them can be down or can drop a write, and a post
 * that reached one relay is a post that happened. Publishing is treated as
 * succeeding on the first acceptance for exactly that reason.
 */
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
]

/**
 * The signing key as 32 bytes, from either an `nsec1…` or a bare hex string.
 *
 * Here rather than in the runner because it is three rules and a trap, not
 * plumbing — and because a runner that has to be *imported* to test its key
 * handling is a runner whose `main()` fires on import.
 *
 * Both input forms are accepted: both are what a person actually has to hand,
 * and pasting the wrong one of two legitimate formats is the likeliest
 * misconfiguration. **Blank counts as absent**, which is what makes an
 * empty Actions secret a dry run rather than a crash — the same trap this repo
 * has now met in `supabaseEnv`, `vapid`, `clientIp`, the MVRV env fallback and
 * the push evaluator. Anything else throws rather than being coerced: a
 * coerced key is a valid keypair belonging to nobody, so the post succeeds,
 * under an identity with no followers, and nothing anywhere looks wrong.
 */
export function parseSecretKey(raw) {
  const key = (raw ?? '').trim()
  if (!key) return null
  if (key.startsWith('nsec')) {
    const { type, data } = nip19.decode(key)
    if (type !== 'nsec') throw new Error(`expected an nsec, got ${type}`)
    return data
  }
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('NOSTR_PRIVATE_KEY must be an nsec1… or 64 hex characters')
  }
  return Uint8Array.from(key.match(/.{2}/g).map(b => parseInt(b, 16)))
}
