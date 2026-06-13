// Vercel serverless function — proxies BGeometrics MVRV data with 24-hour CDN cache.
// BGeometrics free tier: 15 req/day. Cache means at most 1 real call per 24h.
//
// Verified field shapes:
//   MVRV (BGeometrics): [{d: 'YYYY-MM-DD', unixTs: number, mvrv: number}, ...]

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
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
