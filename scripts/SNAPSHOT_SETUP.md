# Daily Metrics Snapshot

`scripts/snapshot.js` captures one row of Bitcoin metrics per day into the
Supabase `metric_snapshots` table.

It runs on **GitHub Actions** — see `.github/workflows/snapshot.yml`. There is
nothing to install and no server to maintain.

> **Previously:** this job ran on a Proxmox LXC container on a home LAN, writing
> to a SQLite file at `~/btcvc/metrics.db`. That setup could not be observed or
> restarted from a phone, had no alerting, and — because the data sat on a home
> network — the deployed app could never read it. It also depended on
> `better-sqlite3`, a native module that was never actually a dependency of this
> project. All of that is retired.

---

## Schedule

| | |
|---|---|
| **Cron** | `17 6 * * *` — 06:17 UTC daily |
| **Manual run** | Actions → Daily Snapshot → *Run workflow* (works from the GitHub mobile app) |
| **Failures** | Show up in the Actions tab and email you, like any other workflow |

## Required secrets

Set these under **Settings → Secrets and variables → Actions**:

| Secret | Where to find it | Notes |
|---|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API | Same URL the app uses |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | **Service role, not anon.** Writes bypass RLS by design |
| `BGEOMETRICS_API_KEY` | BGeometrics dashboard | Optional — without it the MVRV fields are null |

> ⚠️ The service role key must never appear in a `VITE_`-prefixed variable.
> Those are compiled into the client bundle and readable by anyone on the site.
> It belongs only in GitHub Actions secrets and Vercel server-side env vars.

The job **fails fast** if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is
missing, rather than collecting data and silently dropping it.

## Where the data goes

`public.metric_snapshots`:

| Column | Type | |
|---|---|---|
| `id` | `bigint` | identity primary key |
| `captured_at` | `timestamptz` | when the run happened |
| `captured_on` | `date` | generated from `captured_at` in UTC, **unique** |
| `metrics` | `jsonb` | the full metric object |

The unique index on `captured_on` means the script **upserts**: re-running it on
the same day corrects that day's row instead of adding a duplicate. So a manual
re-run after a failure is always safe.

RLS is enabled with public read and no anon write. The data is aggregate market
data that is already public at source, and the dashboard is expected to chart
it; writes are service-role only.

## Running it locally

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
BGEOMETRICS_API_KEY=... \
node scripts/snapshot.js
```

It refuses to write if no price could be fetched, so a run where every upstream
API is down goes red instead of storing a placeholder row that looks like a real
day of data.

## What it captures

Roughly 28 fields per day, sourced from CoinPaprika, Kraken, mempool.space,
alternative.me and BGeometrics:

- **Price & market** — price, 24h volume, market cap, 24h change, ATH and
  distance from it, BTC dominance
- **Cycle indicators** — 200-day MA, Mayer Multiple, Power Law fair value, MVRV
- **Fees** — fastest / 30m / 1h / economy, in sats per vbyte
- **Network** — block height, difficulty change, remaining blocks, hash rate and
  its 30-day trend
- **Mempool** — transaction count, vsize
- **Lightning** — capacity, channels, nodes
- **Sentiment** — Fear & Greed value and label

Individual sources failing is tolerated — those fields land as `null` and the
run logs which ones. Only a missing price aborts the write.
