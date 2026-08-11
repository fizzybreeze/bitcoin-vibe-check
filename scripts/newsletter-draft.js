/**
 * Draft the day's newsletter from the stored snapshot rows.
 *
 * Runs as a second step in `snapshot.yml`, after the capture. Everything it
 * decides lives in `scripts/lib/newsletterDraft.js`; this file is the plumbing —
 * read two rows, compose, write them out.
 *
 * ── Why it reads the table rather than taking the row from the capture ──────
 *
 * The draft is derived from the *permanent record*, so what it says and what
 * the table holds cannot come apart. It also means a draft can be re-made for a
 * day without re-fetching six upstreams, and that a capture failure produces a
 * visibly stale draft rather than a confidently wrong one — `buildNewsletterDraft`
 * takes `asOf` for exactly that and puts a warning at the top.
 *
 * ── Why it never exits non-zero on a missing draft ─────────────────────────
 *
 * This step runs *after* the snapshot has already been written. Failing the job
 * here would turn "the newsletter draft was thin today" into a red daily cron —
 * the alert that everybody learns to ignore, and the one that would then be
 * ignored on the day the *capture* breaks. It exits 1 only when it could not
 * reach the database at all, which is a real fault in the same class as the
 * capture's own.
 *
 * ── Output ────────────────────────────────────────────────────────────────
 *
 * Two places, deliberately:
 *   - `$GITHUB_STEP_SUMMARY`, which renders in the run page and is the thing
 *     you can actually read on a phone;
 *   - `newsletter-draft.md`, uploaded as an artifact, which is the copy-paste
 *     path into beehiiv and survives as a file.
 *
 * Nothing is sent. There is no beehiiv credential in this job.
 */

import { appendFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { buildNewsletterDraft, pickRows } from './lib/newsletterDraft.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const OUT_FILE = process.env.NEWSLETTER_DRAFT_PATH || 'newsletter-draft.md'

// Enough to find today and yesterday with a gap or two behind them, and few
// enough that this is one small read. `pickRows` re-derives the ordering.
const ROW_LIMIT = 5

function summarise(markdown) {
  const path = process.env.GITHUB_STEP_SUMMARY
  if (!path) return
  try {
    appendFileSync(path, `${markdown}\n`)
  } catch (err) {
    // The summary is a convenience; losing it is not worth failing a job that
    // has already written the artifact.
    console.warn(`[draft] Could not write the job summary: ${err.message}`)
  }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[draft] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase
    .from('metric_snapshots')
    .select('captured_at, metrics')
    .order('captured_at', { ascending: false })
    .limit(ROW_LIMIT)

  if (error) {
    console.error(`[draft] Supabase read failed: ${error.message}`)
    process.exit(1)
  }

  const { today, previous } = pickRows(data)
  const asOf = new Date().toISOString().slice(0, 10)
  const draft = buildNewsletterDraft({ today, previous, asOf })

  if (!draft) {
    // Not a failure — see the header. Say why in the one place someone looks.
    const why = today
      ? 'the newest snapshot carries no usable figures'
      : 'there is no snapshot row to draft from'
    console.warn(`[draft] No draft written — ${why}.`)
    summarise(`### Newsletter draft\n\nNot written today — ${why}.`)
    return
  }

  writeFileSync(OUT_FILE, `${draft.markdown}\n`)
  summarise(draft.markdown)

  console.log(`[draft] Wrote ${OUT_FILE}`)
  console.log(`[draft] Subject: ${draft.subject}`)
  if (draft.stale)     console.warn('[draft] The newest snapshot is not today — check the capture step.')
  if (!draft.hasDelta) console.log('[draft] No Vibe Score delta: yesterday is missing or not fully replayable.')
}

main().catch(err => {
  console.error('[draft] Fatal error:', err)
  process.exit(1)
})
