/**
 * Draft Satoshi's Weekly Brief from the stored snapshot rows.
 *
 * Runs as a step in `snapshot.yml`, after the capture. Everything it decides
 * lives in `scripts/lib/newsletterDraft.js`; this file is the plumbing — read a
 * fortnight of rows, compose, write them out.
 *
 * ── Why the weekly gate is here rather than on a weekly cron ────────────────
 *
 * The brief needs the day's capture to have happened, and GitHub's scheduler
 * drifts by hours — `snapshot.yml` asks for 06:17 UTC and its scheduled runs
 * start nearer 09:10. A separate weekly workflow would therefore have to *guess*
 * a time late enough to be after it, and would banner a stale week whenever the
 * guess was wrong. Running as the next step after the capture makes the ordering
 * structural instead. The cost is that this file is invoked daily and does
 * nothing six days out of seven, which `shouldDraft` reports rather than
 * performs silently.
 *
 * ── Why it reads the table rather than taking the row from the capture ──────
 *
 * The brief is derived from the *permanent record*, so what it says and what the
 * table holds cannot come apart. It also means a brief can be re-made for a past
 * week without re-fetching six upstreams, and that a capture failure produces a
 * visibly stale brief rather than a confidently wrong one.
 *
 * ── Why it never exits non-zero on a thin brief ────────────────────────────
 *
 * This step runs *after* the snapshot has already been written. Failing the job
 * here would turn "the brief was thin this week" into a red daily cron — the
 * alert everybody learns to ignore, and the one that would then be ignored on
 * the day the *capture* breaks. It exits 1 only when it could not reach the
 * database at all, which is a real fault in the same class as the capture's own.
 *
 * ── Output ────────────────────────────────────────────────────────────────
 *
 * Two places, deliberately:
 *   - `$GITHUB_STEP_SUMMARY`, which renders in the run page and is the thing you
 *     can actually read on a phone;
 *   - `weekly-brief.md`, uploaded as an artifact, which is the copy-paste path
 *     into beehiiv and survives as a file.
 *
 * Nothing is sent. There is no beehiiv credential in this job.
 */

import { appendFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { buildNewsletterDraft, pickWeek, shouldDraft } from './lib/newsletterDraft.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const OUT_FILE = process.env.NEWSLETTER_DRAFT_PATH || 'weekly-brief.md'
// Blank counts as absent — an Actions input left unfilled arrives as "", and a
// truthy check on it would force a brief every single day.
const FORCE = (process.env.NEWSLETTER_FORCE ?? '').trim().toLowerCase() === 'true'
const ISSUE = Number.parseInt((process.env.NEWSLETTER_ISSUE ?? '').trim(), 10)

// Sixteen days: a fortnight of captures plus slack, so the row a week back is
// still found when one or two mornings failed. `pickWeek` re-derives the
// ordering and picks the nearest row to seven days rather than counting down.
const ROW_LIMIT = 16

function summarise(markdown) {
  const path = process.env.GITHUB_STEP_SUMMARY
  if (!path) return
  try {
    appendFileSync(path, `${markdown}\n`)
  } catch (err) {
    // The summary is a convenience; losing it is not worth failing a job that
    // has already written the artifact.
    console.warn(`[brief] Could not write the job summary: ${err.message}`)
  }
}

async function main() {
  const gate = shouldDraft({ force: FORCE })
  if (!gate.ok) {
    console.log(`[brief] Skipped — ${gate.reason}.`)
    return
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[brief] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
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
    console.error(`[brief] Supabase read failed: ${error.message}`)
    process.exit(1)
  }

  const week = pickWeek(data)
  const asOf = new Date().toISOString().slice(0, 10)
  const draft = buildNewsletterDraft({
    week,
    asOf,
    issue: Number.isFinite(ISSUE) ? ISSUE : null,
  })

  if (!draft) {
    // Not a failure — see the header. Say why in the one place someone looks.
    const why = week.latest
      ? 'the newest snapshot carries no usable figures'
      : 'there is no snapshot row to draft from'
    console.warn(`[brief] No brief written — ${why}.`)
    summarise(`### Weekly brief\n\nNot written this week — ${why}.`)
    return
  }

  writeFileSync(OUT_FILE, `${draft.markdown}\n`)
  summarise(draft.markdown)

  console.log(`[brief] Wrote ${OUT_FILE}`)
  console.log(`[brief] Subject: ${draft.subject}`)
  console.log(`[brief] Sections: ${draft.sections.join(', ')} (+ WHY IT MATTERS, ONE THING TO WATCH to write)`)
  if (draft.stale)       console.warn('[brief] The newest snapshot is not today — check the capture step.')
  if (!draft.hasWeekAgo) console.warn('[brief] No row a week back: every week-over-week comparison is missing.')
  if (!Number.isFinite(ISSUE)) {
    console.log('[brief] No NEWSLETTER_ISSUE set, so the subject carries no issue number.')
  }
}

main().catch(err => {
  console.error('[brief] Fatal error:', err)
  process.exit(1)
})
