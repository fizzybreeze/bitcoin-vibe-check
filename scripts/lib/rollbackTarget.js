// Which deployment production should be rolled back *to*.
//
// Kept out of the /rollback command file for the same reason autoMerge.js is
// kept out of its workflow: the one thing that can go wrong here is silent and
// expensive. The obvious reading of a deployment list — "take the newest
// production deployment" — names the deployment that is currently broken. A
// runbook is only worth having if the step you follow while panicking on a
// phone is the right one, so the step is a function with tests rather than a
// sentence someone has to parse correctly under time pressure.
//
// Nothing here talks to Vercel. It takes the JSON that
// `mcp__Vercel__list_deployments` (or `GET /v6/deployments`) returns and
// reduces it to two deployments and a verdict.

/**
 * Pull the deployment array out of whatever wrapper it arrived in.
 *
 * The MCP tool answers `{ deployments: { pagination, deployments: [...] } }` —
 * the same key twice, at two depths — while the REST API answers
 * `{ deployments: [...] }` and a caller that has already unwrapped it passes a
 * bare array. Guessing wrong yields an empty list, which reads identically to
 * "this project has never deployed": a wrong answer that looks like a fact.
 */
export function extractDeployments(payload) {
  if (Array.isArray(payload)) return payload
  const inner = payload?.deployments
  if (Array.isArray(inner)) return inner
  if (Array.isArray(inner?.deployments)) return inner.deployments
  return []
}

/**
 * Production deployments that could serve traffic, newest first.
 *
 * Three filters, each load-bearing:
 *
 * - `target === 'production'`. Preview deployments outnumber production ones
 *   roughly six to one in this project, and promoting a preview build of an
 *   unmerged branch during an outage would be a second incident.
 * - `state === 'READY'`. A deployment that errored or was cancelled still
 *   appears in the list with `target: 'production'`. Rolling back onto a failed
 *   build turns an outage into a worse outage.
 * - A usable `created` timestamp, in the past. The order is re-derived here
 *   rather than trusted from the response, because the whole answer is "the
 *   second one", and a single future-dated entry would otherwise pin itself at
 *   the top and be reported as the live deployment forever.
 */
export function productionDeployments(deployments, now = Date.now()) {
  return extractDeployments(deployments)
    .filter(
      d =>
        d?.target === 'production' &&
        String(d?.state ?? '').toUpperCase() === 'READY' &&
        Number.isFinite(d?.created) &&
        d.created <= now
    )
    .sort((a, b) => b.created - a.created)
}

/**
 * The live production deployment and the one to roll back to.
 *
 * @param {object|Array} payload  A Vercel deployments listing, in any of the
 *   shapes `extractDeployments` accepts.
 * @param {object} [options]
 * @param {number} [options.now]  Injected clock, for tests.
 * @param {string} [options.headSha]  The tip of `main`, when the caller knows
 *   it. See `liveMatchesHead` below.
 * @returns {{
 *   live: object|null,
 *   target: object|null,
 *   oneTap: boolean,
 *   liveMatchesHead: boolean|null,
 *   reason: string,
 * }}
 */
export function selectRollbackTarget(payload, { now = Date.now(), headSha } = {}) {
  const production = productionDeployments(payload, now)
  const [live = null, target = null] = production

  if (!live) {
    return {
      live: null,
      target: null,
      oneTap: false,
      liveMatchesHead: null,
      reason: 'no READY production deployment in the listing — nothing to roll back from',
    }
  }

  // `liveMatchesHead` is how a rollback that is *already in effect* announces
  // itself. Vercel keeps serving the promoted older build while the newer,
  // broken deployment stays in the list as the most recent production entry —
  // so "newest production deployment" stops meaning "what visitors are seeing",
  // and this function would offer to roll back from something that is not live
  // to something that already is. It cannot be settled from the deployment
  // list alone, so it is reported rather than resolved: a mismatch means check
  // the project's current production alias before touching anything.
  //
  // The fallback below is `||`, not `??`, and the empty case is checked
  // separately. A deployment made outside the Git integration — `vercel deploy`
  // from a laptop, which is one of the ways production ends up somewhere
  // surprising in the first place — carries `githubCommitSha: ''` rather than
  // no key at all. That is not nullish, and `headSha.startsWith('')` is `true`,
  // so `??` reported a deployment with no commit at all as matching the tip of
  // `main` and swallowed the warning. Wrong in the one direction that matters:
  // the case where nobody can tell what is live is precisely the case where
  // the warning has to fire.
  const liveSha = String(live.meta?.githubCommitSha || '')
  const liveMatchesHead =
    typeof headSha === 'string' && headSha.length > 0
      ? liveSha.length > 0 && (liveSha.startsWith(headSha) || headSha.startsWith(liveSha))
      : null

  if (!target) {
    return {
      live,
      target: null,
      oneTap: false,
      liveMatchesHead,
      reason:
        'only one READY production deployment exists — there is nothing older to promote, so the fix has to go forward through CI',
    }
  }

  // Vercel flags exactly the two most recent production deployments as rollback
  // candidates, which is what the dashboard's one-tap Instant Rollback offers.
  // Anything older is reachable, but by promoting it rather than by rolling
  // back — a different button, and worth saying so before someone hunts for a
  // control that is not on the screen. The flag is only trusted when it is
  // explicitly `false`; an older API version that omits it should not silently
  // downgrade every answer to "no one-tap available".
  const oneTap = target.isRollbackCandidate !== false

  return {
    live,
    target,
    oneTap,
    liveMatchesHead,
    reason: oneTap
      ? 'target is the previous production deployment — one-tap Instant Rollback applies'
      : 'target is not flagged as a rollback candidate — promote it instead of rolling back',
  }
}

/**
 * One deployment as a line a human can read on a phone.
 *
 * Deliberately carries the commit SHA and the subject line rather than only the
 * deployment id: nobody recognises `dpl_75Yed…`, and the question being asked
 * is "is this the build from before the bad merge?".
 */
export function describeDeployment(deployment) {
  if (!deployment) return '(none)'
  const sha = String(deployment.meta?.githubCommitSha ?? '').slice(0, 7) || 'unknown'
  const subject = String(deployment.meta?.githubCommitMessage ?? '').split('\n')[0] || '(no commit message)'
  const when = Number.isFinite(deployment.created)
    ? new Date(deployment.created).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : 'unknown time'
  return `${deployment.id} · ${sha} · ${when} · ${subject}`
}
