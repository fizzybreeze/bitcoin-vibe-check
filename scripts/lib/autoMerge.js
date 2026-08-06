// The decision half of .github/workflows/dependabot-auto-merge.yml.
//
// Kept out of the YAML on purpose. A gate that merges to production unattended
// is the last place you want logic that can only be exercised by opening a real
// Dependabot PR and watching what happens — so the two questions the workflow
// actually asks ("is this update type safe to merge without me?" and "are the
// required checks green?") live here as pure functions with unit tests, and the
// workflow is reduced to plumbing.

/**
 * Update types that may merge without a human.
 *
 * Majors are deliberately absent. They are where breaking changes live, and
 * this project has real exposure: React 19, Vite 8, Tailwind v4 and ESLint 10
 * are all majors where an upgrade could plausibly change behaviour in a way
 * the suite would not notice. `dependabot.yml` already refuses to even open
 * React and Vite majors automatically; this is the second layer.
 */
export const MERGEABLE_UPDATE_TYPES = [
  'version-update:semver-patch',
  'version-update:semver-minor',
]

/**
 * The checks branch protection requires on `main`, by job name.
 *
 * These are the names GitHub reports, which are the `name:` of the *job* —
 * "Lint, test, build" from ci.yml and "Playwright (chromium)" from e2e.yml —
 * not the workflow names. Renaming a job without updating this list would make
 * the workflow wait forever rather than merge something unverified, which is
 * the right way round to fail; autoMerge.test.js pins them anyway.
 */
export const REQUIRED_CHECKS = ['Lint, test, build', 'Playwright (chromium)']

/**
 * Is this the kind of Dependabot update that may merge unattended?
 *
 * Anything unrecognised — an empty string when fetch-metadata found no
 * metadata, a future update type, a typo — is a no. The default has to be
 * "leave it for a human", because the failure mode of the other default is a
 * silent unreviewed merge.
 */
export function isMergeableUpdate(updateType) {
  return MERGEABLE_UPDATE_TYPES.includes(updateType)
}

/**
 * Reduce `gh pr checks --json name,state` output to one of three states.
 *
 * `passed` is only ever returned when every required check is present *and*
 * successful. A required check that has not been reported yet reads as
 * `pending`, not `passed` — a check suite that is slow to register must never
 * be mistaken for a check suite that agreed.
 *
 * Checks beyond the required set (the Vercel preview deployment, most notably)
 * are ignored entirely. They are not required for merge by branch protection,
 * and waiting on a preview build is precisely the human step being skipped.
 *
 * @param {Array<{name: string, state: string}>} checks
 * @returns {{state: 'passed'|'pending'|'failed', reason: string}}
 */
export function evaluateRequiredChecks(checks) {
  // A name can appear more than once if a job was re-run, and the response is
  // not documented as ordered, so "the last one wins" would decide a merge on
  // whichever way GitHub happened to sort the array that minute. Every entry
  // for a required check is kept and all of them have to agree, which resolves
  // the ambiguity in the only direction that is safe: a name carrying both a
  // failure and a success reads as failed, waits out the timeout, and asks for
  // a human rather than guessing which one is current.
  const seen = new Map()
  for (const check of checks ?? []) {
    if (!check?.name) continue
    const states = seen.get(check.name) ?? []
    states.push(String(check.state ?? '').toUpperCase())
    seen.set(check.name, states)
  }

  const failed = REQUIRED_CHECKS.filter(name =>
    (seen.get(name) ?? []).some(state => FAILING_STATES.includes(state))
  )
  if (failed.length > 0) {
    return { state: 'failed', reason: `required checks failed: ${failed.join(', ')}` }
  }

  const waiting = REQUIRED_CHECKS.filter(name => {
    const states = seen.get(name) ?? []
    return states.length === 0 || !states.every(state => SUCCESS_STATES.includes(state))
  })
  if (waiting.length > 0) {
    return { state: 'pending', reason: `waiting on: ${waiting.join(', ')}` }
  }

  return { state: 'passed', reason: `all ${REQUIRED_CHECKS.length} required checks succeeded` }
}

// Success is a strict allowlist of the two vocabularies GitHub reports through
// this one field — SUCCESS for a check run, SUCCESSFUL for a legacy commit
// status. Notably absent are NEUTRAL and SKIPPED, which branch protection
// *would* accept: neither job can skip today (they carry no `if:`), so a
// skipped required check means something changed, and the safe response to
// that is to stall until the workflow times out rather than to merge.
//
// Everything outside both lists — QUEUED, IN_PROGRESS, PENDING, STALE, and any
// state GitHub adds later — falls through to pending, so an unfamiliar value
// delays a merge instead of waving it through.
const SUCCESS_STATES = ['SUCCESS', 'SUCCESSFUL']
const FAILING_STATES = ['FAILURE', 'FAILING', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']
