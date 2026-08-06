import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
// Imported rather than taken as a global: eslint gives everything under src/
// the browser globals, and this is the one test that legitimately reaches for
// Node — spawning the CLI is the point of it.
import process from 'node:process'
import {
  MERGEABLE_UPDATE_TYPES,
  REQUIRED_CHECKS,
  isMergeableUpdate,
  evaluateRequiredChecks,
} from '../../scripts/lib/autoMerge.js'

// This is the only logic in the repo that can merge to production without a
// human looking at it, and the workflow around it cannot be exercised without
// opening a real Dependabot PR. So the gates get pinned here instead.

describe('isMergeableUpdate', () => {
  it('accepts patch and minor version updates', () => {
    expect(isMergeableUpdate('version-update:semver-patch')).toBe(true)
    expect(isMergeableUpdate('version-update:semver-minor')).toBe(true)
  })

  it('refuses majors', () => {
    // The whole point of the issue: React 19, Vite 8, Tailwind v4 and ESLint 10
    // are all majors here, and a breaking change in one of them is exactly what
    // a green suite can still miss.
    expect(isMergeableUpdate('version-update:semver-major')).toBe(false)
  })

  it('refuses an empty update type', () => {
    // What fetch-metadata reports when it found no metadata — i.e. when it is
    // not confident this is a Dependabot PR at all.
    expect(isMergeableUpdate('')).toBe(false)
    expect(isMergeableUpdate(undefined)).toBe(false)
  })

  it('refuses an update type it does not recognise', () => {
    expect(isMergeableUpdate('version-update:semver-prerelease')).toBe(false)
    expect(isMergeableUpdate('direct:production')).toBe(false)
  })

  it('lists only patch and minor as mergeable', () => {
    expect(MERGEABLE_UPDATE_TYPES).toEqual([
      'version-update:semver-patch',
      'version-update:semver-minor',
    ])
  })
})

const passing = REQUIRED_CHECKS.map(name => ({ name, state: 'SUCCESS' }))

describe('evaluateRequiredChecks', () => {
  it('names the checks branch protection actually requires', () => {
    // These are job names, from ci.yml and e2e.yml. If a job is renamed and
    // this is not, the workflow waits forever rather than merging something
    // unverified — but it should be a red unit test first.
    expect(REQUIRED_CHECKS).toEqual(['Lint, test, build', 'Playwright (chromium)'])
  })

  it('passes when every required check succeeded', () => {
    expect(evaluateRequiredChecks(passing).state).toBe('passed')
  })

  it('treats a missing required check as pending, never as passed', () => {
    // The failure that matters most. A check suite that has not registered yet
    // looks exactly like a check suite with nothing to say, and merging on the
    // second reading would skip the gate entirely.
    const [first] = REQUIRED_CHECKS
    const result = evaluateRequiredChecks([{ name: first, state: 'SUCCESS' }])
    expect(result.state).toBe('pending')
    expect(result.reason).toContain(REQUIRED_CHECKS[1])
  })

  it('treats no checks at all as pending', () => {
    expect(evaluateRequiredChecks([]).state).toBe('pending')
    expect(evaluateRequiredChecks(undefined).state).toBe('pending')
  })

  it('stays pending while a required check is still running', () => {
    for (const state of ['QUEUED', 'IN_PROGRESS', 'PENDING', 'WAITING', 'REQUESTED']) {
      const checks = [{ name: REQUIRED_CHECKS[0], state }, ...passing.slice(1)]
      expect(evaluateRequiredChecks(checks).state).toBe('pending')
    }
  })

  it('fails when a required check failed, was cancelled or timed out', () => {
    for (const state of ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ERROR', 'ACTION_REQUIRED']) {
      const checks = [{ name: REQUIRED_CHECKS[0], state }, ...passing.slice(1)]
      const result = evaluateRequiredChecks(checks)
      expect(result.state).toBe('failed')
      expect(result.reason).toContain(REQUIRED_CHECKS[0])
    }
  })

  it('reports failure even when the other required check is still running', () => {
    const checks = [
      { name: REQUIRED_CHECKS[0], state: 'FAILURE' },
      { name: REQUIRED_CHECKS[1], state: 'IN_PROGRESS' },
    ]
    // Waiting out a run that is already doomed just burns the timeout.
    expect(evaluateRequiredChecks(checks).state).toBe('failed')
  })

  it('does not accept a skipped or neutral required check as success', () => {
    // Branch protection would, but neither job carries an `if:`, so a skip
    // means something changed and the safe answer is to stall.
    for (const state of ['SKIPPED', 'NEUTRAL', 'STALE']) {
      const checks = [{ name: REQUIRED_CHECKS[0], state }, ...passing.slice(1)]
      expect(evaluateRequiredChecks(checks).state).toBe('pending')
    }
  })

  it('ignores checks outside the required set', () => {
    // The Vercel preview deployment is the one that matters: it is not required
    // for merge, and blocking on a preview build would be waiting for the
    // human step this workflow exists to skip.
    const withVercel = [...passing, { name: 'Vercel', state: 'PENDING' }]
    expect(evaluateRequiredChecks(withVercel).state).toBe('passed')

    const failingVercel = [...passing, { name: 'Vercel', state: 'FAILURE' }]
    expect(evaluateRequiredChecks(failingVercel).state).toBe('passed')
  })

  it('takes the latest result when a check is reported more than once', () => {
    // Re-running a failed job leaves both entries in the response.
    const rerun = [
      { name: REQUIRED_CHECKS[0], state: 'FAILURE' },
      { name: REQUIRED_CHECKS[0], state: 'SUCCESS' },
      ...passing.slice(1),
    ]
    expect(evaluateRequiredChecks(rerun).state).toBe('passed')
  })

  it('reads states case-insensitively', () => {
    const lower = REQUIRED_CHECKS.map(name => ({ name, state: 'success' }))
    expect(evaluateRequiredChecks(lower).state).toBe('passed')
  })
})

// The CLI is the seam between logic that can be tested and a bash loop that
// cannot. The workflow branches on its exit code for `update-type` and on the
// single word it prints for `checks`, so both are contracts, and neither is
// visible from the functions above.
// Resolved from the project root rather than `import.meta.url`, which vitest's
// jsdom transform does not leave as a file: URL.
const CLI = resolve(process.cwd(), 'scripts/dependabot-auto-merge.js')

function run(args, stdin = '') {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      input: stdin,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { code: 0, stdout: stdout.trim() }
  } catch (error) {
    return { code: error.status, stdout: String(error.stdout ?? '').trim() }
  }
}

describe('dependabot-auto-merge CLI', () => {
  it('exits 0 for a mergeable update type and 1 for a major', () => {
    expect(run(['update-type', 'version-update:semver-minor']).code).toBe(0)
    expect(run(['update-type', 'version-update:semver-major']).code).toBe(1)
  })

  it('exits 1 when fetch-metadata reported no update type', () => {
    // The step passes the output through unquoted-empty, so this is the shape
    // an unrecognised PR actually arrives as.
    expect(run(['update-type', '']).code).toBe(1)
    expect(run(['update-type']).code).toBe(1)
  })

  it('prints the check verdict on stdout and always exits 0', () => {
    // Exit 0 matters: the workflow polls this inside a `set -e` shell, so a
    // non-zero exit would end the wait on the first poll rather than loop.
    const green = JSON.stringify(REQUIRED_CHECKS.map(name => ({ name, state: 'SUCCESS' })))
    expect(run(['checks'], green)).toEqual({ code: 0, stdout: 'passed' })

    const half = JSON.stringify([{ name: REQUIRED_CHECKS[0], state: 'SUCCESS' }])
    expect(run(['checks'], half)).toEqual({ code: 0, stdout: 'pending' })

    const red = JSON.stringify([{ name: REQUIRED_CHECKS[0], state: 'FAILURE' }])
    expect(run(['checks'], red)).toEqual({ code: 0, stdout: 'failed' })
  })

  it('treats non-JSON and empty input as pending, not as passed', () => {
    // What `gh pr checks --json` leaves on stdout when no checks have been
    // reported on the head commit yet — the normal state seconds after a PR
    // opens. Reading it as anything but pending would merge unchecked code.
    expect(run(['checks'], 'no checks reported on the branch')).toEqual({ code: 0, stdout: 'pending' })
    expect(run(['checks'], '')).toEqual({ code: 0, stdout: 'pending' })
  })

  it('exits 2 on an unknown command rather than printing a verdict', () => {
    expect(run(['merge-it-please']).code).toBe(2)
    expect(run([]).code).toBe(2)
  })
})
