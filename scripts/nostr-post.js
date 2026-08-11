/**
 * Publish the day's vibe to Nostr.
 *
 * Runs as a third step in `snapshot.yml`, after the capture and the newsletter
 * draft. Everything it *decides* — what to say, and whether today should be said
 * at all — lives in `scripts/lib/socialPost.js`; this file signs and sends.
 *
 * ── The kill switch is the secret ─────────────────────────────────────────
 *
 * With no `NOSTR_PRIVATE_KEY` the step composes the post, prints it, and
 * publishes nothing. So turning this off is deleting one Actions secret — no
 * code change, no deploy, nothing to remember — and turning it on for the first
 * time is a dry run you can read before anything is public. That is the
 * opposite arrangement from a feature flag in the repo, which is the thing you
 * cannot flip from a phone at the moment you want it flipped.
 *
 * ── Why it does not fail the job ──────────────────────────────────────────
 *
 * This runs after the snapshot is already written and the draft already made. A
 * relay refusing a write, or the guard declining the day, must not turn the
 * daily cron red: that is the alert everybody learns to ignore, and it would
 * then be ignored on the day the *capture* breaks. It exits non-zero only for a
 * key it cannot parse — a configuration fault, and one that would otherwise be
 * silent every single day.
 */

import { appendFileSync } from 'node:fs'
import { finalizeEvent, nip19 } from 'nostr-tools'
import { Relay } from 'nostr-tools/relay'
import {
  buildSocialPost, buildNostrEvent, shouldPublish, parseSecretKey, DEFAULT_RELAYS,
} from './lib/socialPost.js'
import { pickRows } from './lib/newsletterDraft.js'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const NOSTR_PRIVATE_KEY = (process.env.NOSTR_PRIVATE_KEY ?? '').trim()
const RELAYS = (process.env.NOSTR_RELAYS ?? '').trim()
  ? process.env.NOSTR_RELAYS.split(',').map(r => r.trim()).filter(Boolean)
  : DEFAULT_RELAYS

const PUBLISH_TIMEOUT_MS = 10_000

function summarise(md) {
  const path = process.env.GITHUB_STEP_SUMMARY
  if (!path) return
  try { appendFileSync(path, `${md}\n`) } catch { /* the summary is a convenience */ }
}

/** Publish to every relay; one acceptance is a published post. */
async function publish(event, relays) {
  const results = await Promise.allSettled(relays.map(async (url) => {
    const relay = await Relay.connect(url)
    try {
      await Promise.race([
        relay.publish(event),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), PUBLISH_TIMEOUT_MS)),
      ])
      return url
    } finally {
      relay.close()
    }
  }))

  const accepted = results.filter(r => r.status === 'fulfilled').map(r => r.value)
  const refused = results
    .map((r, i) => (r.status === 'rejected' ? `${relays[i]} (${r.reason?.message ?? r.reason})` : null))
    .filter(Boolean)
  return { accepted, refused }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[nostr] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
    process.exit(1)
  }

  // Parsed before anything else: a malformed key is a configuration fault, and
  // the one failure here worth being loud about.
  let secretKey
  try {
    secretKey = parseSecretKey(NOSTR_PRIVATE_KEY)
  } catch (err) {
    console.error(`[nostr] ${err.message}`)
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data, error } = await supabase
    .from('metric_snapshots')
    .select('captured_at, metrics')
    .order('captured_at', { ascending: false })
    .limit(5)

  if (error) {
    console.warn(`[nostr] Supabase read failed: ${error.message} — not posting.`)
    summarise(`### Nostr post\n\nSkipped — could not read the snapshots (${error.message}).`)
    return
  }

  const { today, previous } = pickRows(data)
  const asOf = new Date().toISOString().slice(0, 10)

  const verdict = shouldPublish({ today, asOf })
  if (!verdict.ok) {
    console.log(`[nostr] Not posting today — ${verdict.reason}.`)
    summarise(`### Nostr post\n\n**Not posted today** — ${verdict.reason}.`)
    return
  }

  const post = buildSocialPost({ today, previous })
  const unsigned = buildNostrEvent({ post, capturedAt: today.captured_at })
  if (!unsigned) {
    console.log('[nostr] Nothing to post.')
    return
  }

  if (!secretKey) {
    // The dry run. Everything above ran for real; only the send is withheld.
    console.log('[nostr] NOSTR_PRIVATE_KEY is not set — dry run, nothing published.\n')
    console.log(post.content)
    summarise(`### Nostr post (dry run — no key set)\n\n\`\`\`\n${post.content}\n\`\`\``)
    return
  }

  const event = finalizeEvent(unsigned, secretKey)
  const { accepted, refused } = await publish(event, RELAYS)

  if (accepted.length === 0) {
    console.warn(`[nostr] No relay accepted the event. Refused: ${refused.join('; ')}`)
    summarise(`### Nostr post\n\n**Not published** — no relay accepted it.\n\n${refused.join('\n')}`)
    return
  }

  const njump = `https://njump.me/${nip19.noteEncode(event.id)}`
  console.log(`[nostr] Published to ${accepted.length}/${RELAYS.length} relays: ${accepted.join(', ')}`)
  if (refused.length) console.log(`[nostr] Refused by: ${refused.join('; ')}`)
  console.log(`[nostr] ${njump}`)
  summarise(
    `### Nostr post\n\nPublished to ${accepted.length}/${RELAYS.length} relays — [view](${njump})\n\n` +
    `\`\`\`\n${post.content}\n\`\`\``
  )
}

main().catch(err => {
  // Deliberately not a non-zero exit: see the header.
  console.warn('[nostr] Did not post:', err.message)
})
