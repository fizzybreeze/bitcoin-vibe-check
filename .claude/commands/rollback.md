---
description: Find the last known-good production deployment and report the direct link to roll back to it
---

Production is suspected broken and the user is on a phone. The deliverable is
**one tappable link to the right screen**, not an explanation of Vercel. Vercel's
rollback is dashboard-only, and navigating to it for the first time under time
pressure is exactly the cost this command exists to remove.

**Optional argument** (nothing, or a deployment id / commit SHA to target): $ARGUMENTS

Read `README.md` → Deployment → *If production breaks* before acting. This
command finds the target; that section is the procedure, and it is the one
source of truth for it.

## Do not roll back on your own initiative

Promoting an old build is an outward-facing change to a live site. **Report the
target and stop.** The user presses the button. Say so plainly rather than
offering — the whole point is that they are one tap away.

The exception is if they explicitly asked you to roll production back in this
session. Even then, the MCP tools available here are read-only for deployments,
so the answer is still the link.

## Finding the target

1. `mcp__Vercel__list_projects` (team `fizzybreeze-projects`) to resolve the
   project, then `mcp__Vercel__list_deployments`.
2. Do **not** eyeball the list. Write the JSON response to the scratchpad and
   run it through the selector, passing the tip of `main` so an already-active
   rollback is caught:

   ```
   node scripts/vercel-rollback-target.js --head-sha "$(git rev-parse origin/main)" < deployments.json
   ```

   It prints the live deployment, the target, the target's URL, a direct
   `open:` link, and a verdict. Exit 1 means there is nothing to roll back to.

   The reason this is a script and not a judgement call: the intuitive read of a
   deployment list — "the newest production one" — names the build that is
   currently broken. `rollbackTarget.test.js` pins that, along with dropping
   previews, dropping failed builds, and re-deriving the ordering.

3. **Check the target actually serves** before recommending it, with
   `mcp__Vercel__web_fetch_vercel_url` on its URL. A rollback target that 500s
   is not a rollback target, and this costs one call.

4. If the run warned that the live deployment is not the tip of `main`, say so
   first and stop: a rollback is probably already in effect, and the listing
   alone cannot tell you what the production alias currently points at.

## Reporting

Four lines at most:

- **The target**, as its commit SHA and PR subject — that is what the user
  recognises, not `dpl_75Yed…`. Plus how old it is.
- **The direct link** on its own line so it is tappable, and the one control to
  press when it opens (`Instant Rollback`, or `Promote to Production` if the
  verdict said the target is not a rollback candidate).
- **What rolling back does not fix**: it reverts the deployed build only.
  Anything already written to Supabase, and any service worker already installed
  on a visitor's phone, is unaffected.
- **The follow-up**, in one line: `git revert` on `main` through a normal PR, so
  the next merge does not redeploy the same bug on top of the rollback.

If nothing is wrong with production — the user is only asking out of curiosity —
say which deployment is live and stop there. Do not pre-emptively describe the
rollback procedure; it is in the README.
