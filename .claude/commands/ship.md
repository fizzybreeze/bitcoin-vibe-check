---
description: Implement a change end-to-end — branch, build, verify, push, open a PR for review
---

Take the request below and carry it all the way to an open pull request, ready
for a human to merge. This is the mobile loop: the user is on a phone and cannot
read a large diff, run a dev server, or debug a failure interactively. Optimise
for their attention, not yours.

**Request:** $ARGUMENTS

## Steps

1. **Plan first, if the change is non-trivial.** Anything beyond a one-line or
   purely cosmetic edit gets a short plan — five bullets at most — before you
   write code. Reviewing a plan on a phone is realistic; reviewing 400 lines is
   not, and catching a wrong approach here is the biggest time-saver available.
   Skip this only when the change is genuinely trivial.

2. **Branch from the latest `main`.** Never commit to `main` directly; it is
   protected and the push will be rejected.
   ```
   git fetch origin main && git checkout -B claude/<short-slug> origin/main
   ```

3. **Implement it**, matching the conventions already in the surrounding code.

4. **Write or update a test for every behaviour change.** The fast unit suite is
   what lets the user *not* read the diff — each new test makes the next mobile
   session safer. A change with no test needs an explicit reason.

5. **Run every gate and fix what breaks.** Iterate until all four are green:
   `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`.
   Do not push red. Do not report success you have not observed.

6. **Commit** to the branch with a descriptive message. Do not push yet — step 7
   may rewrite this commit, and rebasing before the first push avoids ever
   needing a force-push.

7. **Re-check the base branch.** Step 2 branched from `main`; that may have been
   a long time ago.
   ```
   git fetch origin main && git log --oneline HEAD..origin/main
   ```
   If that prints anything, `main` has moved. Rebase onto it and **re-run all
   four gates** — a clean rebase only means the *text* merged, not that the
   combination still works.
   ```
   git rebase origin/main
   ```

8. **Sanity-check the diff before opening anything.**
   ```
   git diff --stat origin/main HEAD
   ```
   Every file listed should be one this change meant to touch. A file showing
   **pure deletions that you did not intend** is the signature of a stale base —
   you are about to revert someone else's merged work. Stop and re-read the
   diff; do not open the PR to "see what CI says".

9. **Push** to the branch.

10. **Open a PR into `main`.** The body should state what changed, why, and how
    it was verified — with the real numbers from step 5.

11. **Do not enable auto-merge.** The PR you just opened waits for a human to
    merge it. The "Allow auto-merge" repository setting is off permanently and
    that decision is closed — do not turn it on, do not ask about it, and do not
    mention it as an option in your report. See the rule in `CLAUDE.md`, which
    also covers the one thing that *does* merge unattended (Dependabot patch and
    minor bumps) and how that is done without the setting.

12. **Report back in three lines**: what you changed, the gate results, and the
    PR link. If anything is genuinely uncertain or you made a judgement call the
    user might disagree with, say so in a fourth line — do not bury it.

13. **Say what to look at on the preview**, in one line, if the change is
    visual — which card, and at which breakpoint. The PR is not the deliverable;
    the user seeing the change work is. `/preview` fetches the URL.

## Why steps 7 and 8 exist

PR #12 branched from `main`, then ran long enough that six other PRs merged
underneath it. It would have deleted `vercel.json`, `dependabot.yml`,
`claude.yml`, the PR template and `scripts/lib/ohlc.js`, and undone 19
dependency updates — and auto-merge was already enabled, so it could have done
that unattended. It was caught by hand.

`git diff --stat origin/main HEAD` is what made it obvious once someone thought
to run it. Run it every time; it costs a second.

## If a gate will not go green

Stop and report. Never disable a rule, delete an assertion, or add an
eslint-disable purely to get to green — those turn a real signal into a silent
one, which is the exact failure this pipeline exists to prevent. A targeted
disable is acceptable only when the rule is genuinely wrong for that code, and
it must carry a comment saying why.
