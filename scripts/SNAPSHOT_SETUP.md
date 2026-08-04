# Daily Metrics Snapshot — Setup

`scripts/snapshot.js` fetches every dashboard data source once a day and upserts
one row into the Supabase `metric_snapshots` table. It runs on GitHub Actions
(`.github/workflows/snapshot.yml`) at 06:17 UTC, and can be triggered by hand
from the Actions tab — including from the GitHub mobile app.

> **This replaces the previous setup**, which ran on a Proxmox LXC container on
> a home LAN and wrote to a SQLite file at `~/btcvc/metrics.db`. That
> arrangement could not be observed or restarted from a phone, had no alerting
> if it silently stopped, and — because the data never left the LAN — could
> never be read by the deployed app. It also depended on `better-sqlite3`, a
> native module that was never actually a dependency of this project.
>
> Nothing needs to be decommissioned urgently, but the container can be
> switched off once you have confirmed a green run here. The old SQLite file is
> not migrated; the new series starts from the first Actions run.

---

## One-time setup

### 1. Add three repository secrets

**Settings → Secrets and variables → Actions → New repository secret**

| Secret | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase dashboard → Project Settings → Data API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API Keys → `service_role` |
| `BGEOMETRICS_API_KEY` | Your BGeometrics account (optional — without it, MVRV fields are null) |

> ⚠️ The **service role key bypasses RLS**. It belongs only in GitHub Actions
> secrets. Never put it in a `VITE_`-prefixed variable or in Vercel's client
> environment — those are compiled into the browser bundle.
>
> It is needed because `metric_snapshots` is deliberately read-only to the
> public: there is no anon insert policy, so writes must come from a trusted
> context.

### 2. Trigger a first run

**Actions → Daily Snapshot → Run workflow**

A green run and one new row in `metric_snapshots` means you are done.

---

## What gets stored

One row per UTC day:

| Column | Notes |
|---|---|
| `captured_at` | timestamptz, when the run happened |
| `captured_on` | date, generated from `captured_at` in UTC — unique, one row per day |
| `metrics` | jsonb, the full metric set |

Re-running on the same day **upserts** rather than duplicating, so manual runs
are safe.

The `metrics` object covers price and market data (price, volume, market cap,
24h change, ATH and distance from it, dominance), cycle indicators (200-day MA,
Mayer Multiple, Power Law fair value, MVRV), fee tiers, network state (block
height, difficulty change, hash rate and its 30-day trend), mempool size, and
Lightning capacity/channels/nodes, plus the Fear & Greed value and label.

## Failure behaviour

The job goes **red** — visible in the Actions tab and emailed to you — if:

- `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing.
- No price could be fetched. A row with no price is worthless, and writing one
  would put a plausible-looking but empty day into the series.
- The Supabase write itself fails.

Individual upstream APIs failing is *not* fatal: those fields are stored as
`null` and the affected field names are logged. That is deliberate — a partial
day of data is worth keeping, an empty one is not.

## Running locally

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... BGEOMETRICS_API_KEY=... \
  node scripts/snapshot.js
```
