// Vercel serverless function — proxies BGeometrics MVRV data with 24-hour CDN cache.
// BGeometrics free tier: 15 req/day. Cache means at most 1 real call per 24h.
//
// Verified field shapes:
//   MVRV (BGeometrics): [{d: 'YYYY-MM-DD', unixTs: number, mvrv: number}, ...]

// Only our own origins may call this route. It was previously `*`, which let any
// site proxy through this function and consume the BGeometrics quota — 15
// requests/day on the free tier, so a handful of third-party pages could have
// exhausted it. Vercel preview deployments get generated subdomains, hence the
// suffix match rather than a fixed list.
const ALLOWED_ORIGINS = [
  'https://bitcoinvibecheck.com',
  'https://www.bitcoinvibecheck.com',
]
const ALLOWED_ORIGIN_SUFFIX = '.vercel.app'

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

export default async function handler(req, res) {
  const allowedOrigin = resolveAllowedOrigin(req.headers.origin)
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600')

  const token = process.env.BGEOMETRICS_API_KEY
  const bgeomHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  let mvrv = null
  try {
    const r = await fetch('https://api.bgeometrics.com/v1/mvrv', { headers: bgeomHeaders })
    if (r.ok) {
      const data = await r.json()
      if (Array.isArray(data) && data.length > 0) {
        const sorted = [...data].sort((a, b) => new Date(a.d) - new Date(b.d))
        const latest = sorted[sorted.length - 1]
        mvrv = { value: latest.mvrv, date: latest.d }
      }
    }
  } catch (e) {
    console.error('[chain-data] MVRV fetch error:', e.message)
  }

  if (!mvrv) {
    return res.status(503).json({ error: 'MVRV data unavailable' })
  }

  res.status(200).json({ mvrv })
}
