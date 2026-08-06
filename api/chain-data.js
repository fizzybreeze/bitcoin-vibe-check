// Vercel serverless function — proxies BGeometrics MVRV data with 24-hour CDN cache.
// BGeometrics free tier: 15 req/day. Cache means at most 1 real call per 24h.
//
// When BGeometrics does not answer, the route serves the most recent MVRV the
// daily snapshot job stored in `metric_snapshots` instead of a 503 (roadmap
// §3.2b). Yesterday's MVRV is a far better answer than a blank card, and it
// takes the only hard rate limit in the stack off the critical path.
//
// The fallback is served from here rather than from the browser on purpose: it
// keeps the client's single fetch path, adds no per-visitor Supabase read (and
// so no new `runtimeCaching` rule), and the edge cache collapses the snapshot
// read to one per cache window for every visitor at once. Whether the budget is
// exhausted is a server-side fact; this is where it is known.
//
// Verified field shapes:
//   MVRV (BGeometrics): [{d: 'YYYY-MM-DD', unixTs: number, mvrv: number}, ...]

import { pickSnapshotMvrv, snapshotQuery } from './lib/mvrvFallback.js'

// A live answer holds for a day, which is what keeps the route inside 15
// requests. A fallback answer must not: it would outlive the outage that caused
// it and keep the stale number on the card long after BGeometrics recovered.
// An hour is short enough that the live value returns the same morning, and long
// enough that retrying against an exhausted budget stays ~24 attempts a day.
const LIVE_CACHE_SECONDS     = 86400
const FALLBACK_CACHE_SECONDS = 3600

// Only our own origins may call this route. It was previously `*`, which let any
// site proxy through this function and consume the BGeometrics quota — 15
// requests/day on the free tier, so a handful of third-party pages could have
// exhausted it. Vercel preview deployments get generated subdomains, hence the
// suffix match rather than a fixed list.
const ALLOWED_ORIGINS = [
  'https://bitcoinvibecheck.com',
  'https://www.bitcoinvibecheck.com',
  'https://bitcoin-dashboard-neon.vercel.app',
]

// Scoped to this team's namespace, not bare '.vercel.app'. Every preview URL
// for this project looks like
// bitcoin-vibe-check-<build>-fizzybreeze-projects.vercel.app, and anyone can
// deploy to vercel.app for free — so a bare suffix match would have re-opened
// the hole this allowlist exists to close.
const ALLOWED_ORIGIN_SUFFIX = '-fizzybreeze-projects.vercel.app'

// Exported for unit tests; the handler is the only production caller.
export function resolveAllowedOrigin(origin) {
  if (!origin) return null
  if (ALLOWED_ORIGINS.includes(origin)) return origin
  try {
    const { hostname, protocol } = new URL(origin)
    if (protocol === 'https:' && hostname.endsWith(ALLOWED_ORIGIN_SUFFIX)) return origin
  } catch {
    return null
  }
  return null
}

async function fetchLiveMvrv() {
  const token = process.env.BGEOMETRICS_API_KEY
  const bgeomHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  try {
    const r = await fetch('https://api.bgeometrics.com/v1/mvrv', { headers: bgeomHeaders })
    if (!r.ok) return null
    const data = await r.json()
    if (!Array.isArray(data) || data.length === 0) return null
    const sorted = [...data].sort((a, b) => new Date(a.d) - new Date(b.d))
    const latest = sorted[sorted.length - 1]
    return { value: latest.mvrv, date: latest.d, source: 'live' }
  } catch (e) {
    console.error('[chain-data] MVRV fetch error:', e.message)
    return null
  }
}

// The anon key, not the service role: `metric_snapshots` grants SELECT to
// public, so this route needs no privilege the client bundle does not already
// carry. The unprefixed names are read first so the function can be given its
// own vars; the VITE_ ones are the same project's and are already set.
async function fetchSnapshotMvrv() {
  const query = snapshotQuery({
    url: process.env.SUPABASE_URL      ?? process.env.VITE_SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
  })
  if (!query) return null

  try {
    const r = await fetch(query.url, { headers: query.headers })
    if (!r.ok) return null
    return pickSnapshotMvrv(await r.json())
  } catch (e) {
    console.error('[chain-data] snapshot fallback error:', e.message)
    return null
  }
}

export default async function handler(req, res) {
  const allowedOrigin = resolveAllowedOrigin(req.headers.origin)
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Vary', 'Origin')
  }

  let mvrv = await fetchLiveMvrv()
  if (!mvrv) mvrv = await fetchSnapshotMvrv()

  const maxAge = mvrv?.source === 'live' ? LIVE_CACHE_SECONDS : FALLBACK_CACHE_SECONDS
  res.setHeader('Cache-Control', `s-maxage=${maxAge}, stale-while-revalidate=3600`)

  if (!mvrv) {
    return res.status(503).json({ error: 'MVRV data unavailable' })
  }

  res.status(200).json({ mvrv })
}
