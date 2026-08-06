---
description: Find the PR's Vercel preview URL, check the deploy succeeded, and report it as a tappable link
---

Find the Vercel preview deployment for the current work and report it as one
tappable link. The user is on a phone and wants to *look at* the change —
the deliverable is a URL they can open, not a status report.

**Optional argument** (a PR number, a branch name, or nothing): $ARGUMENTS

## Resolving what to look at

1. With **no argument**, use the current branch: `git rev-parse --abbrev-ref HEAD`.
   If that is `main`, the target is the production deployment instead.
2. With a **number**, treat it as a PR number and resolve its head branch.
3. With **anything else**, treat it as a branch name.

## Finding the URL

Prefer the GitHub side first — it is the fastest path and needs no Vercel
credentials:

- Read the PR's comments and its deployment statuses. Vercel posts the preview
  URL as a bot comment and as a commit status / deployment on the head SHA.
  The MCP tools for this are `mcp__github__pull_request_read` and
  `mcp__github__get_commit`.

If GitHub has nothing (the PR is very new, or Vercel commented before the last
push), fall back to the Vercel MCP tools: `list_projects` to resolve the project,
then `list_deployments` filtered to the branch, and take the newest.

Two things to get right:

- **Match the deployment to the latest commit on the branch.** A preview URL
  from two pushes ago looks identical and will show the wrong thing. Compare the
  deployment's commit SHA against `git rev-parse HEAD` (or the PR's head SHA)
  and say so explicitly if they differ.
- **A preview URL that returns 401 is expected, not broken.** If deployment
  protection is on, the raw link requires a Vercel login. Say that rather than
  reporting the deploy as failed.

## Reporting

Keep it to a few lines:

- **Ready:** the URL on its own line so it is tappable, plus the state
  (`READY`), the commit it was built from, and how old it is.
- **Still building:** say so with the elapsed time and offer to re-check —
  do not poll in a loop or `sleep` waiting for it.
- **Failed:** name the failing step and quote the actual error from the build
  logs (`get_deployment_build_logs`). A failed preview is usually a real build
  failure that `npm run build` would also catch locally — say if it reproduces.

If the change is visual, remind the user in one short line what specifically to
look at on the preview, and at which breakpoint — that is the whole point of
opening it on the phone they are holding.

## When there is no preview at all

If the project has preview deployments disabled, or the branch has never been
pushed, say which of those it is and stop. Do not describe how the feature would
look — offer the local alternative instead: the fixture-driven Playwright
screenshot path can render the change at phone and desktop widths without any
deployment, and works even when Vercel does not.
