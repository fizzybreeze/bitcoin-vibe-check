import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
// Imported rather than taken as a global, for the same reason autoMerge.test.js
// imports it: eslint gives everything under src/ the browser globals, and
// spawning the CLI is the point of the last block here.
import process from 'node:process'
import {
  extractDeployments,
  productionDeployments,
  selectRollbackTarget,
  describeDeployment,
} from '../../scripts/lib/rollbackTarget.js'

// The recovery path is only ever used while production is broken, which is the
// worst possible moment to discover that the step named the wrong deployment.
// These pin the ways it could name the wrong one.

const HOUR = 3600_000
const NOW = Date.UTC(2026, 7, 7, 12, 0, 0)

function deployment(overrides = {}) {
  const { sha = 'aaaaaaa', message = 'Merge pull request #1', ...rest } = overrides
  return {
    id: `dpl_${sha}`,
    url: `bitcoin-vibe-check-${sha}.vercel.app`,
    inspectorUrl: `https://vercel.com/fizzybreeze-projects/bitcoin-vibe-check/${sha}`,
    state: 'READY',
    target: 'production',
    created: NOW - HOUR,
    isRollbackCandidate: true,
    ...rest,
    meta: { githubCommitSha: sha, githubCommitMessage: message, githubCommitRef: 'main' },
  }
}

// The two production deployments the drill was run against, in the shape the
// MCP tool returns them: the same `deployments` key at two depths.
const LIVE = deployment({ sha: 'ea45f1a', message: 'Merge pull request #36', created: NOW - HOUR })
const PREVIOUS = deployment({ sha: 'eb2a43d', message: 'Merge pull request #35', created: NOW - 13 * HOUR })
const OLDER = deployment({
  sha: '443a4a2',
  message: 'Merge pull request #34',
  created: NOW - 16 * HOUR,
  isRollbackCandidate: false,
})
const PREVIEW = deployment({
  sha: 'c25356d',
  message: 'fix(mvrv): guard the live path',
  created: NOW - 2 * HOUR,
  target: null,
  isRollbackCandidate: false,
})

const LISTING = { deployments: { pagination: { count: 4 }, deployments: [LIVE, PREVIEW, PREVIOUS, OLDER] } }

describe('extractDeployments', () => {
  it('unwraps the MCP shape, the REST shape and a bare array alike', () => {
    // Guessing wrong here returns an empty list, which reads exactly like "this
    // project has never deployed" — a wrong answer wearing a fact's clothes.
    expect(extractDeployments(LISTING)).toHaveLength(4)
    expect(extractDeployments({ deployments: [LIVE] })).toEqual([LIVE])
    expect(extractDeployments([LIVE])).toEqual([LIVE])
  })

  it('returns an empty list rather than throwing on junk', () => {
    expect(extractDeployments(null)).toEqual([])
    expect(extractDeployments({ error: 'unauthorized' })).toEqual([])
  })
})

describe('productionDeployments', () => {
  it('drops previews', () => {
    // Promoting a preview build of an unmerged branch during an outage would be
    // a second incident on top of the first.
    const ids = productionDeployments(LISTING, NOW).map(d => d.id)
    expect(ids).not.toContain(PREVIEW.id)
    expect(ids).toEqual([LIVE.id, PREVIOUS.id, OLDER.id])
  })

  it('drops deployments that are not READY', () => {
    // A failed production build still appears in the listing with
    // `target: 'production'`. Rolling onto it turns an outage into a worse one.
    const broken = deployment({ sha: 'f00ba47', state: 'ERROR', created: NOW - 30 * 60_000 })
    const ids = productionDeployments([broken, LIVE, PREVIOUS], NOW).map(d => d.id)
    expect(ids).toEqual([LIVE.id, PREVIOUS.id])
  })

  it('re-derives the ordering and ignores future-dated entries', () => {
    // The answer is literally "the second one", so a single future timestamp
    // would otherwise pin itself at the top and be reported as live forever.
    const future = deployment({ sha: 'fu7u3ff', created: NOW + 48 * HOUR })
    const shuffled = [PREVIOUS, future, OLDER, LIVE]
    expect(productionDeployments(shuffled, NOW).map(d => d.id)).toEqual([LIVE.id, PREVIOUS.id, OLDER.id])
  })
})

describe('selectRollbackTarget', () => {
  it('targets the deployment before the live one, never the live one', () => {
    // The whole point. "Newest production deployment" is the build that is
    // currently broken; rolling back to it is a no-op that costs the minutes
    // the runbook exists to save.
    const { live, target } = selectRollbackTarget(LISTING, { now: NOW })
    expect(live.id).toBe(LIVE.id)
    expect(target.id).toBe(PREVIOUS.id)
  })

  it('says when the target needs promoting rather than rolling back', () => {
    // Vercel flags only the two newest production deployments as rollback
    // candidates. Anything older is reachable by a different control, and
    // hunting the screen for a button that is not there costs the same minutes.
    const skipOne = { deployments: { deployments: [LIVE, OLDER] } }
    const { target, oneTap, reason } = selectRollbackTarget(skipOne, { now: NOW })
    expect(target.id).toBe(OLDER.id)
    expect(oneTap).toBe(false)
    expect(reason).toMatch(/promote/i)
  })

  it('assumes one-tap when the flag is absent rather than absent-minded', () => {
    const unflagged = { ...PREVIOUS, isRollbackCandidate: undefined }
    expect(selectRollbackTarget([LIVE, unflagged], { now: NOW }).oneTap).toBe(true)
  })

  it('reports no target when only one production deployment exists', () => {
    const { target, reason } = selectRollbackTarget([LIVE], { now: NOW })
    expect(target).toBeNull()
    expect(reason).toMatch(/nothing older/i)
  })

  it('reports no live deployment when the listing has none', () => {
    const { live, target, reason } = selectRollbackTarget({ deployments: { deployments: [PREVIEW] } }, { now: NOW })
    expect(live).toBeNull()
    expect(target).toBeNull()
    expect(reason).toMatch(/nothing to roll back from/i)
  })

  it('warns when the newest production deployment is not the tip of main', () => {
    // This is how a rollback that is already in effect announces itself: Vercel
    // keeps serving the promoted older build while the newer one stays top of
    // the list, so "newest" quietly stops meaning "what visitors see".
    expect(selectRollbackTarget(LISTING, { now: NOW, headSha: 'ea45f1a' }).liveMatchesHead).toBe(true)
    expect(selectRollbackTarget(LISTING, { now: NOW, headSha: '9999999' }).liveMatchesHead).toBe(false)
  })

  it('compares a full SHA against the abbreviated one the listing may carry', () => {
    const full = 'ea45f1ae9037ecd13b9573393fd4d5918fec797f'
    expect(selectRollbackTarget(LISTING, { now: NOW, headSha: full }).liveMatchesHead).toBe(true)
  })

  it('does not read a deployment with no commit SHA as matching the tip of main', () => {
    // A deployment made outside the Git integration carries an *empty* SHA, not
    // a missing one, and `headSha.startsWith('')` is true — so the obvious `??`
    // fallback suppresses the warning on a deployment nobody can identify,
    // which is the one direction this must not fail in.
    const anonymous = { ...LIVE, meta: { githubCommitSha: '', githubCommitMessage: 'deployed from a laptop' } }
    expect(selectRollbackTarget([anonymous, PREVIOUS], { now: NOW, headSha: 'ea45f1a' }).liveMatchesHead).toBe(false)

    const noMeta = { ...LIVE, meta: undefined }
    expect(selectRollbackTarget([noMeta, PREVIOUS], { now: NOW, headSha: 'ea45f1a' }).liveMatchesHead).toBe(false)
  })

  it('reports null, not false, when no head SHA was supplied', () => {
    // A missing comparison is not a failed one — printing the warning here
    // would cry wolf on every ordinary run.
    expect(selectRollbackTarget(LISTING, { now: NOW }).liveMatchesHead).toBeNull()
    expect(selectRollbackTarget(LISTING, { now: NOW, headSha: '' }).liveMatchesHead).toBeNull()
  })
})

describe('describeDeployment', () => {
  it('leads with something a human recognises', () => {
    // Nobody recognises a dpl_ id. The question being asked at 2am is "is this
    // the build from before the bad merge?", which only the commit answers.
    const line = describeDeployment(PREVIOUS)
    expect(line).toContain('eb2a43d')
    expect(line).toContain('Merge pull request #35')
    expect(line).toContain('2026-08-06 23:00 UTC')
  })

  it('survives a deployment with no git metadata', () => {
    expect(describeDeployment({ id: 'dpl_x', created: NaN })).toContain('unknown')
    expect(describeDeployment(null)).toBe('(none)')
  })
})

describe('the CLI', () => {
  const script = resolve(process.cwd(), 'scripts/vercel-rollback-target.js')

  function run(input, args = []) {
    return execFileSync('node', [script, ...args], { input, encoding: 'utf8' })
  }

  it('prints the target URL and the direct link to open it', () => {
    const out = run(JSON.stringify(LISTING))
    expect(out).toContain(`https://${PREVIOUS.url}`)
    expect(out).toContain(PREVIOUS.inspectorUrl)
    expect(out).toContain('eb2a43d')
  })

  it('exits 1 when there is nothing to roll back to', () => {
    // So a caller can branch on the exit code instead of reading prose.
    expect(() => run(JSON.stringify([LIVE]))).toThrow()
  })

  it('passes the head SHA through to the already-rolled-back warning', () => {
    expect(run(JSON.stringify(LISTING), ['--head-sha', '9999999'])).toMatch(/rollback may already be in effect/)
    expect(run(JSON.stringify(LISTING), ['--head-sha', 'ea45f1a'])).not.toMatch(/already be in effect/)
  })
})
