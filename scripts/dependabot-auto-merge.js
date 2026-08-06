#!/usr/bin/env node
// Plumbing for .github/workflows/dependabot-auto-merge.yml. All the judgement
// lives in scripts/lib/autoMerge.js; this file only moves data between `gh` and
// those functions, so there is nothing here worth a test that the workflow
// itself would not exercise better.
//
//   node scripts/dependabot-auto-merge.js update-type <type>
//     exit 0 if the update may merge unattended, 1 otherwise.
//
//   gh pr checks <pr> --json name,state | node scripts/dependabot-auto-merge.js checks
//     prints `passed`, `pending` or `failed` on stdout and the reason on
//     stderr; always exits 0, because the caller loops on the word, and a
//     non-zero exit under `set -e` would end the wait on the first poll.

import { isMergeableUpdate, evaluateRequiredChecks } from './lib/autoMerge.js'

// `process.exitCode` and a natural exit throughout, never `process.exit()`.
// Node's writes to a pipe are asynchronous, and the workflow reads this
// process's stdout through a command substitution — so exiting the instant
// after `console.log` can truncate the very word the caller is switching on.
// An empty read would fall through the bash `case` as neither passed nor
// failed, i.e. silently pending, which is the kind of intermittent fault that
// would be near-impossible to diagnose in a workflow nothing can rehearse.
const [command, ...rest] = process.argv.slice(2)

if (command === 'update-type') {
  const updateType = rest[0] ?? ''
  const ok = isMergeableUpdate(updateType)
  console.error(
    ok
      ? `${updateType} may merge unattended`
      : `${updateType || '(no metadata)'} needs a human — leaving this PR alone`
  )
  process.exitCode = ok ? 0 : 1
} else if (command === 'checks') {
  console.log(await readChecksVerdict())
} else {
  console.error(`unknown command: ${command ?? '(none)'}`)
  process.exitCode = 2
}

async function readChecksVerdict() {
  const raw = await readStdin()
  let checks
  try {
    checks = JSON.parse(raw || '[]')
  } catch {
    // `gh pr checks` prints a human-readable error rather than JSON when no
    // checks have been reported on the head commit yet. That is the normal
    // state for the first few seconds after a PR opens, not a failure.
    console.error('could not parse check output as JSON — treating as pending')
    return 'pending'
  }
  const { state, reason } = evaluateRequiredChecks(checks)
  console.error(reason)
  return state
}

async function readStdin() {
  let data = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) data += chunk
  return data.trim()
}
