// The sender (roadmap §4.1b). Alerts that fire with the tab closed.
//
// This is the half of §4.1 that makes the other half true: v1.7.5 gave the
// service worker its `push` listener, v1.7.6 gave a browser a way to register
// itself, v1.7.8 gave the server the rules to check — and nothing has ever sent
// anything to any of it. The alerts panel has said "Alerts are pushed to this
// device, even with the tab closed" since v1.7.6. Until this route exists, that
// sentence is a promise rather than a description.
//
// **Why here rather than a Supabase edge function**, which is what the roadmap
// sketched. Two reasons, both about this repo rather than about the platforms.
// The decisions a sender makes are the ones worth testing — which sources a
// tick needs, which currency a rule is priced in, when a subscription is
// genuinely dead — and in JS they live in `api/lib/pushEvaluator.js` where
// vitest reads them and `hasAlertCrossed` is *the same import* the browser
// uses. In Deno they would live in a file no test in this project can load, and
// the predicate would be a copy. The second reason is smaller and still real:
// the VAPID pair is already in Vercel, where `.env.example` says to keep it.
//
// **The scheduler is still pg_cron**, per the roadmap's own finding: GitHub
// Actions cron drifts by hours (snapshot.yml asks for 06:17 UTC and starts at
// 09:10), and Vercel Hobby crons run once a day. Neither is a price alert.
// `supabase/migrations/20260809120000_schedule_push_evaluate.sql` schedules it.
//
// Nothing about this route trusts its caller: the bearer token is the only
// thing between an anonymous POST and a notification to every subscriber.

import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { timingSafeEqual } from 'node:crypto'

import { krakenPrice } from '../src/lib/marketData.js'
import { KRAKEN_OHLC_URL, extractKrakenOhlc, calc200DMA, calcMayerMultiple } from '../scripts/lib/ohlc.js'
import {
  evaluateSubscription,
  firedEntries,
  pushDelivery,
  requiredSources,
  rulesAfterDelivery,
} from './lib/pushEvaluator.js'

// Long enough for a slow push service, short enough that a wedged upstream
// cannot hold a function open. Every request here is best-effort by design.
const FETCH_TIMEOUT_MS = 10_000

// Web Push's own ceiling is 4096 bytes of ciphertext; these payloads are three
// short fields and run to a couple of hundred. The TTL is how long the push
// service holds a notification for a device that is offline — four hours, on
// the reasoning that a threshold crossing is news for an afternoon and stale by
// the next morning. A phone that has been off for a day should not wake up to
// yesterday's fee spike.
const PUSH_TTL_SECONDS = 4 * 60 * 60

// The VAPID `sub` claim: who to contact if this sender misbehaves. RFC 8292
// takes a `https:` URL as readily as a `mailto:`, and a URL is the right choice
// for a public repo — the alternative is committing somebody's address to a
// file anyone can read, to satisfy a field no push service reads in anger.
const VAPID_SUBJECT = 'https://bitcoinvibecheck.com'

const CURRENCY_SUFFIX = { usd: 'USD', gbp: 'GBP', eur: 'EUR', cad: 'CAD', chf: 'CHF' }

// One request prices every pair — see the note in pushEvaluator.js about why
// the currency list is not narrowed per tick.
const KRAKEN_TICKER_URL =
  'https://api.kraken.com/0/public/Ticker?pair=XBTUSD,XBTGBP,XBTEUR,XBTCAD,XBTCHF'
const FEES_URL = 'https://mempool.space/api/v1/fees/recommended'
const FNG_URL = 'https://api.alternative.me/fng/?limit=1'

async function safeFetch(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn(`[push-evaluate] fetch failed: ${url} — ${err.message}`)
    return null
  }
}

/**
 * Constant-time bearer comparison.
 *
 * `timingSafeEqual` throws on a length mismatch, so the lengths are compared
 * first — which leaks the token's length and nothing else. The alternative,
 * `a === b`, leaks the common prefix, and this token guards the ability to
 * notify every subscriber of this site.
 */
export function bearerMatches(header, expected) {
  const offered = typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice(7)
    : ''
  if (!offered || !expected || offered.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(offered), Buffer.from(expected))
}

/**
 * The live reading, fetching only the sources the pending rules actually name.
 *
 * A tick whose subscribers only watch fees makes exactly one upstream request.
 * A tick with no rules at all makes none — which is today's case, and matters
 * more than it sounds: this runs 288 times a day against four free, keyless
 * APIs, and the cheapest way to keep them available is not to ask them
 * questions nobody is waiting on.
 */
async function fetchReading(sources) {
  const [tickerRaw, feesRaw, fngRaw, ohlcRaw] = await Promise.all([
    sources.has('ticker') ? safeFetch(KRAKEN_TICKER_URL) : null,
    sources.has('fees')   ? safeFetch(FEES_URL)          : null,
    sources.has('fng')    ? safeFetch(FNG_URL)           : null,
    sources.has('ohlc')   ? safeFetch(KRAKEN_OHLC_URL)   : null,
  ])

  const result = tickerRaw?.result ?? {}
  const prices = {}
  for (const [code, suffix] of Object.entries(CURRENCY_SUFFIX)) {
    prices[code] = krakenPrice(result, suffix)
  }

  // `calc200DMA` refuses a series shorter than 200 candles rather than
  // averaging what it has — the snapshot job's rule, and the right one here for
  // the same reason: a Mayer Multiple computed over 40 days is a plausible
  // number that would fire somebody's alert at the wrong level.
  const ma200 = calc200DMA(extractKrakenOhlc(ohlcRaw))

  return {
    prices,
    fee: feesRaw?.fastestFee ?? null,
    // parseInt because alternative.me sends its index as a string.
    fng: fngRaw?.data?.[0]?.value != null ? parseInt(fngRaw.data[0].value, 10) : null,
    mayer: calcMayerMultiple(prices.usd, ma200),
  }
}

export default async function handler(req, res) {
  // Never cached, at the edge or anywhere else. This endpoint has side effects.
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.PUSH_EVALUATE_SECRET
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidPublic = process.env.VITE_VAPID_PUBLIC_KEY
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Missing configuration is 503, never 200. A sender that reports success
  // while sending nothing is the failure mode this whole item exists to end,
  // and it is exactly what the orphaned donor-email-worker did for months.
  if (!secret || !vapidPrivate || !vapidPublic || !supabaseUrl || !serviceKey) {
    console.error('[push-evaluate] not configured — refusing to run')
    return res.status(503).json({ error: 'Not configured' })
  }

  if (!bearerMatches(req.headers.authorization, secret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Service role, because there is no SELECT policy on this table by design and
  // there must not be one — an endpoint readable with the anon key is an
  // enumeration oracle for every subscriber's browser.
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, rules')

  if (error) {
    console.error(`[push-evaluate] read failed: ${error.message}`)
    return res.status(502).json({ error: 'Subscription read failed' })
  }

  const pending = (subscriptions ?? []).filter(s => Array.isArray(s.rules) && s.rules.length > 0)
  if (pending.length === 0) {
    return res.status(200).json({ subscriptions: 0, sent: 0, reaped: 0, sources: [] })
  }

  const sources = requiredSources(pending.flatMap(s => s.rules))
  const reading = await fetchReading(sources)

  webpush.setVapidDetails(VAPID_SUBJECT, vapidPublic, vapidPrivate)

  let sent = 0
  let failed = 0
  const reap = []

  for (const sub of pending) {
    const entries = evaluateSubscription(sub.rules, reading)
    const fired = firedEntries(entries)

    const delivered = new Set()
    let gone = false

    for (const entry of fired) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(entry.payload),
          { TTL: PUSH_TTL_SECONDS }
        )
        delivered.add(entry.rule.id)
        sent += 1
      } catch (err) {
        const outcome = pushDelivery(err?.statusCode)
        if (outcome === 'gone') {
          gone = true
          break
        }
        failed += 1
        console.warn(`[push-evaluate] send failed (${err?.statusCode}): ${err?.message}`)
      }
    }

    if (gone) {
      reap.push(sub.id)
      continue
    }

    // Written back only when it actually changed. A row whose rules are
    // untouched must not be updated: the trigger would bump `rules_updated_at`
    // on every tick and make a quiet subscription look busy.
    const next = rulesAfterDelivery(entries, delivered)
    if (JSON.stringify(next) !== JSON.stringify(sub.rules)) {
      const { error: writeError } = await supabase
        .from('push_subscriptions')
        .update({ rules: next })
        .eq('id', sub.id)
      if (writeError) {
        // Logged rather than fatal: the notification has already been
        // delivered, and failing the whole tick over the bookkeeping would
        // strand every subscription after this one.
        console.error(`[push-evaluate] rules write failed for ${sub.id}: ${writeError.message}`)
      }
    }
  }

  // Reaped in one statement, and only for endpoints the push service said are
  // gone. This is the path the 20260808100000 migration deliberately left to
  // the sender rather than giving the browser a DELETE policy it could have
  // pointed at everybody's rows.
  if (reap.length > 0) {
    const { error: reapError } = await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', reap)
    if (reapError) console.error(`[push-evaluate] reap failed: ${reapError.message}`)
  }

  const summary = {
    subscriptions: pending.length,
    sent,
    failed,
    reaped: reap.length,
    sources: [...sources],
  }
  console.log(`[push-evaluate] ${JSON.stringify(summary)}`)
  return res.status(200).json(summary)
}
