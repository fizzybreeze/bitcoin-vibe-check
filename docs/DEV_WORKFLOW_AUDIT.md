# Development Workflow Audit — Optimising for Claude-Based Mobile Development

**Date:** 2026-08-04
**Repo:** `fizzybreeze/bitcoin-vibe-check`
**Stack:** Vite 8 + React 19 → Vercel · Supabase (Postgres 17) · GitHub
**Goal:** Continuous development and continuous integration driven from a mobile phone.

---

> ## 📌 Status: historical record — mostly implemented
>
> This is a **snapshot of the repo as it stood on 2026-08-04**, kept because it
> explains *why* the current CI, security and mobile-development setup looks the
> way it does. It is not a description of the repo today. Findings below are
> written in the present tense of that date; the table says where each one
> actually landed.
>
> Two facts in the body are now stale and are **not** edited in place, so the
> record stays intact:
>
> - **The repo was private then; it is public now.** The §4.2 cost analysis
>   ("Actions minutes are metered… ~135 minutes at 30 PRs a month") no longer
>   applies — Actions minutes are free for public repositories. What the change
>   *does* add is the `claude.yml` write-access requirement described in
>   `CLAUDE.md`, which is what keeps an `@claude` trigger safe from strangers.
> - **Node was pinned to 24.x, not 22.** §4.1, §4.2, §5.1 and §5.2 all recommend
>   22; the repo standardised on 24.x instead — `engines` in `package.json`, and
>   both workflows read that via `node-version-file` so there is one source of
>   truth rather than three copies.
>
> | Finding (§2) | Status |
> |---|---|
> | 🔴 `donors` RLS disabled | ✅ Fixed — `20260804120000_secure_donors_rls.sql` |
> | 🟠 16 lint errors | ✅ Fixed — lint is clean and is a required check |
> | 🟠 Zero CI, zero PRs, no branch protection | ✅ Fixed — `ci.yml` + `e2e.yml`, `main` protected, all work via PR |
> | 🟠 Snapshot job on a home Proxmox box | ✅ Fixed — `snapshot.yml` → Supabase `metric_snapshots` |
> | 🟡 E2E not portable / not hermetic | ✅ Fixed — suite is fully mocked and runs in CI |
> | 🟡 Phantom tests for `OnChainSignalsCard` | ✅ Fixed — component and its tests deleted |
> | 🟡 `main` / `dev` divergence | ✅ Fixed — trunk-based on `main`, `dev` gone |
> | 🟡 Undocumented env vars | ✅ Fixed — `.env.example`, plus tables in `CLAUDE.md` and `README.md` |
> | 🔵 Repo hygiene (artifacts, Node pin, `vercel.json`, migrations, CLAUDE.md drift) | ✅ Fixed — see the notes above on the Node version |
>
> Recommendations from §6 also landed: `.claude/settings.json`, the SessionStart
> hook, and the `/ship` and `/verify` slash commands. `/preview` and `/fixci`
> (§6.4) were **not** written — they remain the obvious next additions. The
> `name` length constraint suggested in §2 shipped with the RLS migration as
> `donors_name_length` (2–50 characters).
>
> Two things arrived after this audit and so are absent below: the Binance
> geo-block that broke the snapshot job and then the browser chart (both now on
> Kraken via `src/lib/ohlc.js`), and the retirement of the orphaned
> `donor-email-worker` pg_cron job.

---

## 1. The core problem

Everything in this stack currently works because **you are the CI system**.

Today, between "code changes" and "bitcoinvibecheck.com updates", the only verification that
happens is you — reading the diff, running `npm run dev`, and looking at the browser. There is no
automated gate anywhere in the pipeline. Vercel deploys every push to `main` straight to
production, and nothing checks it first.

That works on a laptop. It does not survive contact with a phone, because on a phone you can't
read a 2,000-line diff, can't run a dev server, and can't eyeball a rendering bug.

> **Mobile-first development is not a tooling problem. It is the problem of moving the
> verification you currently do with your eyes into gates a machine can run without you.**

Everything below follows from that one idea. The recommendations fall into three groups:

1. **Build the gates** so it's safe for Claude to push without you watching (§3, §4).
2. **Fix what the gates would immediately catch** — because CI that is red on day one gets
   switched off by day three (§2).
3. **Give Claude the context and permissions** to work unattended (§6).

---

## 2. Audit findings

Ranked by severity. Every finding was verified against the live repo, the live Vercel project,
and the live Supabase project — not inferred.

### 🔴 CRITICAL — `donors` table is fully exposed to the public internet

Supabase's own linter flags this at ERROR level, twice:

```
rls_disabled_in_public     Table `public.donors` is public, but RLS has not been enabled.
policy_exists_rls_disabled Table `public.donors` has RLS policies but RLS is not enabled.
                           Policies include {"Allow public read of approved donors"}.
```

Someone wrote the policy `Allow public read of approved donors` and **never enabled RLS**, so the
policy is completely inert. It is doing nothing.

Why this is genuinely exploitable, not theoretical:

- `src/lib/supabase.js` reads `VITE_SUPABASE_ANON_KEY` — a `VITE_`-prefixed variable, so it is
  **compiled into the public JavaScript bundle** by design. Anyone can read it from the deployed site.
- The **deployed site is public**, and that is all an attacker needs. Opening devtools on
  bitcoinvibecheck.com yields the project URL, the anon key, and — from the `.from('donors')`
  call in the bundle — the table name. The repo itself is private, but that protects nothing
  here: the credentials are in the shipped JavaScript, not in the source tree.
- With RLS off, the anon key grants full `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on `donors`.

So today, anyone can read donor names awaiting approval, insert arbitrary content that will appear
on your site pending moderation, rewrite existing rows, or **delete the entire table**.

**⚠️ The obvious one-line fix will break your app.** Supabase's own suggested remediation is
`alter table public.donors enable row level security;` — **do not run that on its own.**

Verified against the live database, `donors` has exactly one policy:

| Policy | Command | Using |
|---|---|---|
| `Allow public read of approved donors` | `SELECT` | `approved = true` |

There is **no `INSERT` policy**. But the app inserts with the anon key at `App.jsx:1088`:

```js
await supabase.from('donors').insert({ name: trimmed, approved: false })
```

Enabling RLS alone would therefore start denying every donation submission, silently — the
`DonationCard` would just show its error state forever. Apply both statements together, as one
migration:

```sql
-- Write: anyone may submit a name, but never pre-approve their own.
-- with_check mirrors exactly what App.jsx:1088 inserts.
create policy "public submits unapproved donors"
  on public.donors for insert to anon
  with check (approved = false);

-- The existing SELECT policy already matches App.jsx:1332 (.eq('approved', true)),
-- so reads keep working untouched.

-- No update/delete policy for anon = those operations are denied once RLS is on.
alter table public.donors enable row level security;
```

This is a good illustration of why the audit was worth doing: the tooling's own recommended fix,
applied literally, would have taken down a working feature.

Approving names then happens through the Supabase dashboard or the service-role key, never the
anon key. Add a length constraint on `name` while you're there — there is currently nothing
stopping a 10MB submission.

### 🟠 HIGH — `npm run lint` fails, with 16 errors

```
$ npm run lint  →  exit 1, 16 errors
```

This matters more than it looks, because **lint is the gate that most cheaply replaces your eyes**,
and two of these are real defects rather than style noise:

| Error | File | Why it's real |
|---|---|---|
| `no-dupe-keys` — duplicate `athUsd` | `ShareModal.test.jsx:33` | The first value is silently discarded. A test is asserting against a fixture that doesn't say what it appears to say. |
| `react-hooks/purity` — `Date.now()` in render | `App.jsx:205` and others | Impure render under React 19. A genuine correctness hazard with concurrent rendering, not a style preference. |
| `no-unused-vars` ×3, `react-refresh/only-export-components` | tests, `ShareModal.jsx` | Noise — but noise is what hides the two rows above. |

**This must be fixed before CI is introduced.** A pipeline that is red the moment you install it
trains you to ignore it.

### 🟠 HIGH — Zero CI, zero PRs, zero branch protection

- There is no `.github/` directory at all. No workflows, no templates, no Dependabot, no CODEOWNERS.
- **Zero pull requests have ever been opened** on this repo. All work is direct-push.
- **No branch is protected** — including `main`, which is production.

The practical consequence: a Claude session running from your phone can push a broken commit
directly to `main` and it is live on bitcoinvibecheck.com within about 40 seconds, with nothing in
between. The blast radius of a mistake is currently "production", and the feedback loop is "notice
it yourself, later".

### 🟠 HIGH — The daily snapshot job runs on a home server, writing to a local file

`scripts/SNAPSHOT_SETUP.md` documents the daily metrics job as running on a **Proxmox LXC
container** on your LAN, appending to **SQLite at `~/btcvc/metrics.db`**, maintained by SSH-ing in
from your Mac.

Every property of this is hostile to mobile development:

- You cannot observe it, restart it, or debug it from a phone.
- It is a single point of failure with no alerting — if it silently stops, you find out weeks later.
- The data is trapped. It is on your LAN, so the deployed app can never read it.
- Maintaining it requires a laptop and your home network.

Meanwhile you are **already paying for a managed Postgres** (Supabase) that is sitting nearly
empty. This job should be a GitHub Actions cron writing to Supabase — see §5.

### 🟡 MEDIUM — E2E tests are not portable to fresh environments

Measured: **16 of 17 pass**, once a browser is available. Two distinct portability problems:

1. **Browser version drift.** Playwright 1.60.0 requires chromium build `1223`. Fresh
   environments (including this one, and a clean CI runner) don't have it. Without an explicit
   `npx playwright install` step, the entire suite errors out rather than failing meaningfully.
2. **One test is not hermetic.** `dashboard.spec.js:159` ("clickable without console errors")
   fails on any restricted network with six `ERR_TUNNEL_CONNECTION_FAILED` errors, because some
   endpoints the app calls are not mocked in `mockApis()`. The other 16 tests mock properly.

Both are fixable and both must be fixed before e2e can be a trusted gate.

### 🟡 MEDIUM — Green tests giving false confidence

`src/components/OnChainSignalsCard.jsx` was removed from the app in v1.4 — `App.jsx` does not
import it. But the file remains, and `SignalCards.test.jsx` still imports and tests it.

**7 of your 122 passing tests exercise a component that never renders.** They will stay green
forever regardless of what the app does. Delete the component and its tests.

### 🟡 MEDIUM — `main` and `dev` have silently diverged

```
main ahead by 4 · dev ahead by 1
```

The commit `feat: add daily metrics snapshot script` exists on **both branches with different
SHAs** (`0447325` on main, `7b96267` on dev). That is the signature of a hand-merge that went
sideways — the same change applied twice through different paths.

This is what a manual `git merge dev` release step costs you over time, and it is exactly the kind
of problem that is miserable to untangle from a phone.

Also present: stale branches never cleaned up (`layout-v2`, and two abandoned `claude/*` branches).

### 🟡 MEDIUM — Environment variables are undocumented

`CLAUDE.md` documents exactly one variable, `VITE_COINGECKO_API_KEY`. The code actually reads four:

| Variable | Read by | Documented? |
|---|---|---|
| `VITE_COINGECKO_API_KEY` | `App.jsx` | ✅ |
| `VITE_SUPABASE_URL` | `src/lib/supabase.js` | ❌ |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabase.js` | ❌ |
| `BGEOMETRICS_API_KEY` | `api/chain-data.js` | ❌ |

There is no `.env.example`. Note `src/lib/supabase.js` fails *soft* — `createClient` returns
`null` when the vars are missing, so donations silently stop working rather than erroring. That is
a bug that will never announce itself.

### 🔵 LOW — Repo and config hygiene

- **Build artifacts committed to git.** `test-results/.last-run.json` is tracked, and
  `test-results/` is not in `.gitignore`. Every local test run dirties your working tree.
- **Node version unpinned.** No `engines` or `packageManager` field. Vercel builds on Node 24.x;
  this environment is 22.x. Unpinned versions are how "works locally, fails in CI" happens.
- **No `vercel.json`.** All Vercel configuration is dashboard click-ops, which means it is
  invisible to Claude, unreviewable in a PR, and undocumented.
- **No Supabase migrations.** `list_migrations` returns empty — the entire schema was created by
  hand. Claude cannot see your schema from the repo, so it has to guess or ask.
- **`CLAUDE.md` drift.** The "Key source files" table omits `src/hooks/` entirely
  (`usePersistedState`, `usePriceAlerts`, `useShareImage`), `src/utils/cycleCalculations.js`, and
  eight components in `src/components/`. It also states components are "all in `src/App.jsx`",
  which stopped being true several versions ago.

### ✅ What's already good

Worth stating plainly, because these are the foundation the rest builds on:

- **Unit tests are fast and genuine** — 122 tests across 8 files in ~6 seconds. This is an
  excellent CI gate and the single best asset you have.
- **Build is very fast** — 631ms. Preview deploys will be near-instant.
- **E2E fixtures are well built** — `e2e/fixtures.js` is thorough and properly mocks most APIs.
- **`html2canvas` is already lazy-loaded** via dynamic import in `useShareImage.js`, so the 199kB
  chunk is correctly code-split out of the main bundle.
- **Calculations are already extracted** to `src/lib/calculations.js` as pure functions — exactly
  the right shape for testing, and why the unit suite is as good as it is.
- **`CLAUDE.md` exists and is genuinely detailed.** Drift aside, this is the highest-leverage file
  in the repo for Claude-based work, and it is already well above average.
- **Every branch gets a Vercel preview URL.** This is already your best mobile QA surface — you
  just aren't using it deliberately yet.

---

## 3. Target architecture

```
  Phone (Claude app / GitHub mobile / claude.ai/code)
       │
       │  "add a 30-day volatility card"
       ▼
  Claude session ──► branch: claude/volatility-card
       │
       ▼
  git push  ──────────────────────────────────────────┐
       │                                              │
       ▼                                              ▼
  GitHub Actions CI                            Vercel preview deploy
  ├── lint          (~20s)                     └── unique URL per branch
  ├── unit tests    (~30s)                            │
  ├── build         (~30s)                            │
  └── e2e chromium  (~90s)                            │
       │                                              │
       └──────────────┬───────────────────────────────┘
                      ▼
              Pull Request  ◄── your mobile control surface
              ├── ✅ all checks green
              ├── 🔗 preview URL — open it, look at it on the actual phone
              └── [Merge] ──► main ──► production deploy
```

The PR is the whole point. It is the one surface that shows you check status, the diff, and a live
preview URL in a single view that works properly on a phone — and it gives you a merge button that
is *safe to press* because the gates already ran.

**Recommended branching model: trunk-based.**

Collapse to a single long-lived branch. `main` is trunk and production. Work happens on
short-lived `claude/*` branches that live hours, not weeks, and merge via PR with auto-merge on
green. **Delete `dev`.**

The `dev` branch is currently buying you nothing except a manual merge step — and that step has
already produced the duplicate-commit divergence in §2. Branch protection plus required checks
gives you everything `dev` was supposed to give you, without a laptop-bound merge ritual.

---

## 4. GitHub changes

### 4.1 CI workflow

`.github/workflows/ci.yml` — fast gates on every push and PR:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

concurrency:                                  # cancel superseded runs — saves minutes
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

### 4.2 E2E workflow

Separate, because it's slower and needs a browser. PRs only:

```yaml
name: E2E
on: pull_request

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium   # ← the missing step from §2
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

Uploading the report on failure matters for mobile: when a test fails you get a downloadable
artifact with screenshots, rather than needing a laptop to reproduce.

Also change `playwright.config.js`: `reuseExistingServer: !process.env.CI`. Reusing a server in CI
hides port conflicts and produces confusing failures.

**Cost.** The repo is private, so Actions minutes are metered: 2,000/month on Free, 3,000 on Pro.
The two workflows cost roughly 1.5 min (CI) + 3 min (E2E) per PR run, so even at 30 PRs a month
you are around 135 minutes — comfortably inside the free allowance. The `concurrency` blocks
cancel superseded runs, which is what stops a rapid push-push-push sequence from burning it.

### 4.3 Branch protection on `main`

This is the single highest-leverage change in this document. It is what makes it *safe* to let
Claude push while you're on a bus.

Settings → Branches → Add rule for `main`:

- ✅ Require a pull request before merging
- ✅ Require status checks to pass — select `verify` and `e2e`
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above settings
- ❌ Do **not** require approvals — you are a solo dev; self-approval is friction with no benefit

Then Settings → General → Pull Requests:

- ✅ **Allow auto-merge** — this is the mobile superpower. Tap it once when the PR opens; it merges
  itself when the checks go green. You don't have to come back.
- ✅ Automatically delete head branches — solves the stale-branch problem permanently.

### 4.4 The Claude GitHub App

Install it (`/install-github-app`). This is what turns GitHub's mobile app into a development
environment:

- File an issue from your phone, comment `@claude implement this`, and it opens a PR.
- Comment `@claude` on any PR review thread to get changes pushed to that PR.
- No Claude session needs to be open. It runs on GitHub's infrastructure.

This is the difference between "I can supervise development from my phone" and "I can *initiate*
development from my phone."

### 4.5 Supporting files

- **`.github/pull_request_template.md`** — a short checklist. What changed, what you verified,
  preview URL checked on mobile Y/N.
- **`.github/dependabot.yml`** — weekly npm updates, grouped into one PR. With CI protecting
  `main`, dependency bumps become a merge button instead of a chore.
- **`.gitignore`** — add `test-results/` and `playwright-report/`, then
  `git rm --cached test-results/.last-run.json`.

---

## 5. Vercel and Supabase changes

### 5.1 Vercel

**Commit a `vercel.json`.** Right now every setting lives in a dashboard Claude cannot see. Config
in the repo is config Claude can read, reason about, and change in a reviewable PR:

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "github": { "silent": false },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

**Pin Node.** Add `"engines": { "node": "22.x" }` to `package.json` and set the same in Vercel's
project settings (currently 24.x) and in CI. One version, three places, no drift.

**Keep preview deployments on every branch.** They are already working and they are your mobile QA
surface. The discipline to add is *using* them: the PR template should ask whether you opened the
preview URL on your actual phone. That is the check that replaces "run the dev server and look at it".

**Tighten `api/chain-data.js`.** It currently sets `Access-Control-Allow-Origin: *`, meaning any
site can proxy through your function and consume your BGeometrics quota (15 requests/day on the
free tier). Restrict it to your own origins.

### 5.2 Supabase

**Fix RLS first** — see §2. Nothing else here matters as much.

**Adopt migrations.** `list_migrations` is empty; your schema exists only as clicks someone made
months ago. Run `supabase db pull` to capture current state into `supabase/migrations/`, then
commit it. This gives you three things at once: Claude can read your actual schema instead of
guessing, schema changes become reviewable in PRs like any other code, and you can rebuild the
database if it is ever lost.

**Fix the function search_path** (linter WARN — a privilege-escalation vector):

```sql
alter function public.enqueue_donor_email() set search_path = '';
```

**Move the snapshot job off Proxmox.** This retires the home server entirely:

```yaml
name: Daily Snapshot
on:
  schedule: [{ cron: '0 6 * * *' }]
  workflow_dispatch:              # ← lets you trigger it from the GitHub mobile app

jobs:
  snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: node scripts/snapshot.js
        env:
          BGEOMETRICS_API_KEY: ${{ secrets.BGEOMETRICS_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```

`scripts/snapshot.js` needs its SQLite writes swapped for Supabase inserts — a contained change,
and a good first task to hand to Claude. What you gain: failures appear in the Actions tab and
email you, you can re-run it from your phone, the home server and its `better-sqlite3` native
build dependency both disappear, and the historical data becomes queryable by the app — which
unlocks features you can't currently build at all.

---

## 6. Using Claude effectively

### 6.1 Kill the permission prompts

`.claude/` currently contains only `launch.json`. Every session therefore re-prompts for routine
commands, and **tapping "allow" on a phone for the twentieth time is the fastest way to abandon
mobile development.**

Create `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm ci)", "Bash(npm install)", "Bash(npm test)",
      "Bash(npm run lint)", "Bash(npm run build)", "Bash(npm run test:e2e)",
      "Bash(npx playwright install:*)",
      "Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)",
      "Bash(git add:*)", "Bash(git commit:*)", "Bash(git push:*)",
      "Bash(git checkout:*)", "Bash(git fetch:*)"
    ]
  }
}
```

Commit it. It applies to every session, on every device, forever. There is a `/fewer-permission-prompts`
skill that will generate a tuned version of this from your actual session history.

### 6.2 Make fresh sessions work immediately

Every Claude Code web session starts from a clean container. Right now that means no `node_modules`
and no browser, so the first thing any session must do is a manual install — and e2e simply cannot
run at all.

Add a SessionStart hook (the `/session-start-hook` skill scaffolds this) that runs `npm ci` and
`npx playwright install chromium`. Then every session — including ones you start from your phone
while doing something else — is ready to verify its own work from the first message.

### 6.3 Fix CLAUDE.md

It is already good, which is why the drift is worth fixing — you rely on it. Three changes:

1. **Document all four environment variables** (§2) and add a `.env.example`.
2. **Correct the file map.** Add `src/hooks/`, `src/utils/cycleCalculations.js`, and the eight
   components in `src/components/`. Remove the claim that components are "all in `src/App.jsx`".
3. **Add a "Definition of done" section.** This is the highest-value addition, because it is what
   Claude checks itself against when you aren't watching:

   ```markdown
   ## Definition of done
   Before pushing, all of these must pass:
   - `npm run lint`   — zero errors
   - `npm test`       — all green
   - `npm run build`  — succeeds
   - `npm run test:e2e` — for any UI change

   Never push directly to `main`. Open a PR from a `claude/*` branch.
   Any change to Supabase schema must be a migration in `supabase/migrations/`.
   ```

### 6.4 Slash commands for one-tap mobile workflows

Typing long prompts on a phone is the real bottleneck. Custom commands in `.claude/commands/`
turn a paragraph into a few characters:

| Command | What it does |
|---|---|
| `/ship <description>` | Branch, implement, run all gates, commit, push, open PR, enable auto-merge |
| `/verify` | Run lint + test + build + e2e, report only what failed |
| `/preview` | Find the PR's Vercel preview URL and report deploy status |
| `/fixci` | Read the failing Actions logs, diagnose, push a fix |

`/ship` is the one that matters. It compresses your entire development loop into one phrase you
can type one-handed.

### 6.5 Working practices that matter more on mobile

**Ask for a plan before implementation on anything non-trivial.** Reviewing a five-bullet plan on
a phone is realistic. Reviewing a 400-line diff on a phone is not. Catching a wrong approach at the
plan stage is the single biggest time-saver in mobile development.

**Insist on a test with every behaviour change.** Your unit suite is fast and good — it is the
mechanism that lets you *not* read the diff. Every new test makes the next mobile session safer.
This is compounding leverage, and it is why the false-confidence issue in §2 matters.

**Let Claude drive its own feedback loop.** Sessions can run the gates, read their own failures,
and iterate before you ever see the result. Say "run the full suite and fix anything that fails"
rather than reviewing intermediate states. Your attention is the scarce resource on a phone.

**Use PR subscriptions.** Once a PR is open, Claude can watch it — CI failures and review comments
wake the session and it pushes fixes without you doing anything. This is what makes "continuous"
literal: you open the PR and check back when it's green.

**Keep changes small.** `src/App.jsx` is 2,004 lines and holds most of the app. Large files
produce large diffs, and large diffs are unreviewable on a phone. Extracting components from
`App.jsx` as you touch them is a direct investment in mobile reviewability.

---

## 7. Roadmap

### Phase 1 — Safety (do this first, ~1 hour)

Nothing else is safe to build on until these are done.

1. **Enable RLS on `donors`** with the verified policy set (§2). Security hole, live right now.
2. **Fix the 16 lint errors.** Including the two real defects.
3. **Delete `OnChainSignalsCard`** and its 7 phantom tests.
4. **Reconcile `main` and `dev`**, then delete `dev` and the stale branches.

### Phase 2 — Gates (~2 hours)

5. Add `ci.yml` and `e2e.yml`. Fix the non-hermetic e2e test and `reuseExistingServer`.
6. Turn on branch protection for `main` with required checks. Enable auto-merge.
7. Pin Node to 22 in `package.json`, Vercel, and CI.
8. `.gitignore` the test artifacts; untrack `.last-run.json`.

### Phase 3 — Mobile enablement (~2 hours)

9. Install the Claude GitHub App.
10. Add `.claude/settings.json` and the SessionStart hook.
11. Write `/ship` and `/verify`.
12. Fix CLAUDE.md; add `.env.example` and the Definition of Done.

### Phase 4 — Infrastructure (~3 hours)

13. Migrate the snapshot job from Proxmox to GitHub Actions + Supabase.
14. `supabase db pull` → commit migrations.
15. Commit `vercel.json`; fix the CORS wildcard on `api/chain-data.js`.
16. Add Dependabot and the PR template.

---

## 8. What this gets you

Once Phase 3 is done, this is the actual loop from a phone:

1. Open Claude on your phone. *"Add a 30-day realised volatility card to the cycle indicators row."*
2. Claude plans it, you approve the plan in one tap.
3. It implements, writes tests, runs lint + tests + build + e2e, and pushes to `claude/volatility-card`.
4. It opens a PR and enables auto-merge.
5. CI runs. Vercel builds a preview. You open the preview URL **on the phone you're holding** —
   which is the correct device to check a mobile-first dashboard on anyway.
6. Checks go green, auto-merge fires, production deploys.

You never touched a laptop, and at no point was production exposed to unverified code.

The deeper win is that the gates make Claude's work *self-correcting*. It can run the same checks
you would, read its own failures, and fix them before you look. Today that isn't possible, because
there is nothing for it to check against — `npm run lint` already fails, so a failing lint tells it
nothing. **Building the gates is what makes autonomy safe; fixing the existing failures is what
makes the gates meaningful.**
