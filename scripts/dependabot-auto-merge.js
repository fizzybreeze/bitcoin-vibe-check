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

const [command, ...rest] = process.argv.slice(2)

if (command === 'update-type') {
  const updateType = rest[0] ?? ''
  const ok = isMergeableUpdate(updateType)
  console.error(
    ok
      ? `${updateType} may merge unattended`
      : `${updateType || '(no metadata)'} needs a human — leaving this PR alone`
  )
  process.exit(ok ? 0 : 1)
}

if (command === 'checks') {
  const raw = await readStdin()
  let checks = []
  try {
    checks = JSON.parse(raw || '[]')
  } catch {
    // `gh pr checks` prints a human-readable error rather than JSON when no
    // checks have been reported on the head commit yet. That is the normal
    // state for the first few seconds after a PR opens, not a failure.
    console.error('could not parse check output as JSON — treating as pending')
    console.log('pending')
    process.exit(0)
  }
  const { state, reason } = evaluateRequiredChecks(checks)
  console.error(reason)
  console.log(state)
  process.exit(0)
}

console.error(`unknown command: ${command ?? '(none)'}`)
process.exit(2)

async function readStdin() {
  let data = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) data += chunk
  return data.trim()
}
