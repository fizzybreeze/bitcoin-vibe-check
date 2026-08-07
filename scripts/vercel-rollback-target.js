#!/usr/bin/env node
// Plumbing for the /rollback command. All the judgement lives in
// scripts/lib/rollbackTarget.js; this only reads JSON and prints lines.
//
//   node scripts/vercel-rollback-target.js < deployments.json
//   node scripts/vercel-rollback-target.js --head-sha "$(git rev-parse origin/main)" < deployments.json
//
// The input is whatever a Vercel deployments listing looks like — the MCP
// tool's response, or `curl .../v6/deployments?projectId=…`. Exits 0 when a
// rollback target was found, 1 when there is none, so a caller can branch
// without parsing prose.

import { selectRollbackTarget, describeDeployment } from './lib/rollbackTarget.js'

const args = process.argv.slice(2)
const headShaIndex = args.indexOf('--head-sha')
const headSha = headShaIndex === -1 ? undefined : args[headShaIndex + 1]

const raw = await readStdin()
let payload
try {
  payload = JSON.parse(raw || '{}')
} catch {
  console.error('input was not JSON — pipe a Vercel deployments listing into this command')
  process.exitCode = 2
  payload = null
}

if (payload) {
  const { live, target, oneTap, liveMatchesHead, reason } = selectRollbackTarget(payload, { headSha })

  console.log(`live:   ${describeDeployment(live)}`)
  console.log(`target: ${describeDeployment(target)}`)
  if (target) console.log(`url:    https://${target.url}`)
  if (target?.inspectorUrl) console.log(`open:   ${target.inspectorUrl}`)
  console.log(`verdict: ${reason}`)
  if (target && !oneTap) console.log('note:   use Promote to Production, not Instant Rollback')
  if (liveMatchesHead === false) {
    console.log(
      'warn:   the newest production deployment is not the tip of main — a rollback may already be in effect; check the production alias before promoting anything'
    )
  }

  process.exitCode = target ? 0 : 1
}

async function readStdin() {
  let data = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) data += chunk
  return data.trim()
}
