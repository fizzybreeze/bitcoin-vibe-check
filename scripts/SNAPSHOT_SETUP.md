# Daily Metrics Snapshot — Setup Guide

Runs `scripts/snapshot.js` once a day on a dedicated Proxmox LXC container.
Appends one row of Bitcoin metrics to a SQLite database at `~/btcvc/metrics.db`.

---

## Step 1 — Create the LXC container in Proxmox

In the Proxmox web UI:

1. Click **Create CT** (top right)
2. Fill in the wizard:
   - **Hostname**: `btcvc-snapshot`
   - **Template**: Debian 12 (download it from the template list if you haven't already)
   - **Disk**: 8 GB
   - **CPU**: 1 core
   - **RAM**: 512 MB (no swap needed)
   - **Network**: DHCP on your LAN bridge
3. Click **Finish**, then **Start**
4. Click **Console** to get a shell, or SSH in once it boots

---

## Step 2 — Install Node.js

Inside the container:

```bash
apt update && apt upgrade -y

# Install Node.js 22 LTS via NodeSource
apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Verify
node -v   # should print v22.x.x
npm -v
```

---

## Step 3 — Get the snapshot script onto the container

You have two options:

**Option A — clone the repo (recommended if you want easy updates)**

```bash
apt install -y git
git clone https://github.com/fizzybreeze/bitcoin-vibe-check.git /opt/btcvc
cd /opt/btcvc
npm install --omit=dev
npm install better-sqlite3
```

**Option B — copy just the script**

```bash
mkdir -p /opt/btcvc/scripts
# SCP from your Mac:
# scp /Users/oliryan/Documents/Projects/bitcoin-vibe-check/scripts/snapshot.js root@<container-ip>:/opt/btcvc/scripts/

cd /opt/btcvc
npm init -y
npm install better-sqlite3
```

> **Note:** `better-sqlite3` is a native module — it compiles on install.
> If you see build errors, run `apt install -y python3 make g++` first, then retry `npm install better-sqlite3`.

---

## Step 4 — Add your BGeometrics API key

The MVRV data requires a free API key from [bgeometrics.com](https://bgeometrics.com).

Create an environment file:

```bash
nano /opt/btcvc/.env
```

Add this line (replace with your actual key):

```
BGEOMETRICS_API_KEY=your_key_here
```

Save and exit (`Ctrl+X`, then `Y`).

---

## Step 5 — Test the script manually

```bash
cd /opt/btcvc
# Load the env var for this test run
export $(cat .env | xargs)
node scripts/snapshot.js
```

You should see output like:

```
[snapshot] Starting — 2026-06-20T01:00:00.000Z
[snapshot] Done — wrote snapshot to /root/btcvc/metrics.db
[snapshot] BTC/USD: $105,432 | F&G: 72 (Greed) | MVRV: 2.14
```

If you see `Null fields` warnings for some metrics, that's fine — it means one API was temporarily slow. The row still writes with whatever data was available.

---

## Step 6 — Set up the cron job

```bash
crontab -e
```

Add this line (runs at 1am UTC daily):

```
0 1 * * * export $(cat /opt/btcvc/.env | xargs) && /usr/bin/node /opt/btcvc/scripts/snapshot.js >> /var/log/btcvc-snapshot.log 2>&1
```

Save and exit. Verify it was saved:

```bash
crontab -l
```

---

## Step 7 — View your data

**From the command line (on the container):**

```bash
sqlite3 ~/btcvc/metrics.db

# Most recent snapshot
SELECT captured_at, json_extract(metrics, '$.price_usd'), json_extract(metrics, '$.fear_greed_value') FROM snapshots ORDER BY id DESC LIMIT 1;

# All snapshots, date and price
SELECT captured_at, json_extract(metrics, '$.price_usd') FROM snapshots ORDER BY id;

# Exit
.quit
```

**From your Mac (GUI — recommended):**

1. Download [DB Browser for SQLite](https://sqlitebrowser.org) — free
2. On the container, check its IP: `hostname -I`
3. Mount the container's filesystem via SFTP:
   - In Finder: **Go > Connect to Server** > `sftp://root@<container-ip>`
   - Or use [Cyberduck](https://cyberduck.io) / [Transmit](https://panic.com/transmit/)
4. Navigate to `/root/btcvc/metrics.db`, copy it to your Mac
5. Open with DB Browser — you can browse rows, run SQL queries, and export to CSV

> For ongoing access, set up a daily `scp` from the container to your file server,
> or just re-copy the file whenever you want to analyse.

---

## Troubleshooting

**Check the log:**
```bash
tail -f /var/log/btcvc-snapshot.log
```

**Run manually to debug:**
```bash
export $(cat /opt/btcvc/.env | xargs)
node /opt/btcvc/scripts/snapshot.js
```

**`better-sqlite3` fails to install:**
```bash
apt install -y python3 make g++
npm install better-sqlite3
```

**BGeometrics returns null every day:**
The free tier allows 15 requests/day. The cron runs once daily, so you're well within limits.
Check your key is correct in `/opt/btcvc/.env`.

---

## Useful SQL queries once you have data

```sql
-- Price on each date
SELECT date(captured_at), json_extract(metrics, '$.price_usd') AS price
FROM snapshots ORDER BY captured_at;

-- Fear & Greed over time
SELECT date(captured_at), json_extract(metrics, '$.fear_greed_value') AS fng, json_extract(metrics, '$.fear_greed_label') AS label
FROM snapshots ORDER BY captured_at;

-- MVRV trend
SELECT date(captured_at), json_extract(metrics, '$.mvrv_value') AS mvrv
FROM snapshots WHERE json_extract(metrics, '$.mvrv_value') IS NOT NULL ORDER BY captured_at;

-- Days where F&G was extreme greed
SELECT date(captured_at), json_extract(metrics, '$.price_usd'), json_extract(metrics, '$.fear_greed_value')
FROM snapshots WHERE json_extract(metrics, '$.fear_greed_label') = 'Extreme Greed' ORDER BY captured_at;

-- Fee environment over time
SELECT date(captured_at), json_extract(metrics, '$.fee_fastest_sv') AS fast, json_extract(metrics, '$.fee_economy_sv') AS economy
FROM snapshots ORDER BY captured_at;
```
