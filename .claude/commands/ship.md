---
description: Implement a change end-to-end — branch, build, verify, push, open a PR with auto-merge
---

Take the request below and carry it all the way to an open, auto-merging pull
request. This is the mobile loop: the user is on a phone and cannot read a large
diff, run a dev server, or debug a failure interactively. Optimise for their
attention, not yours.

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

6. **Commit and push** to the branch with a descriptive message.

7. **Open a PR into `main`.** The body should state what changed, why, and how
   it was verified — with the real numbers from step 5.

8. **Enable auto-merge** so it lands by itself once CI passes.

9. **Report back in three lines**: what you changed, the gate results, and the
   PR link. If anything is genuinely uncertain or you made a judgement call the
   user might disagree with, say so in a fourth line — do not bury it.

## If a gate will not go green

Stop and report. Never disable a rule, delete an assertion, or add an
eslint-disable purely to get to green — those turn a real signal into a silent
one, which is the exact failure this pipeline exists to prevent. A targeted
disable is acceptable only when the rule is genuinely wrong for that code, and
it must carry a comment saying why.
