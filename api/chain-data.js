// Vercel serverless function — proxies BGeometrics data with 24-hour CDN cache.
// BGeometrics free tier: 15 req/day. Cache means at most 1 real call per 24h.
//
// Verified field shapes (confirmed via live API test, 2026-06-11):
//   MVRV: [{d: 'YYYY-MM-DD', unixTs: number, mvrv: number}, ...]
//
// ETF endpoint: '/v1/etf-holdings-btc' confirmed via OpenAPI spec at
// /v3/api-docs (2026-06-12). Response shape (array vs HAL JSON) and exact
// data field name pending live verification — rate limit exhausted during
// probing. Dynamic field detection below handles either case.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  // CDN cache 24h; serve stale for up to 1h while revalidating
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600')

  const token = process.env.BGEOMETRICS_API_KEY
  const headers = token ? { Authorization: `Bearer ${token}` } : {}

  const [mvrvResult, etfResult] = await Promise.allSettled([
    fetch('https://api.bgeometrics.com/v1/mvrv', { headers })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`MVRV HTTP ${r.status}`)))),
    fetch('https://api.bgeometrics.com/v1/etf-holdings-btc', { headers })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`ETF HTTP ${r.status}`)))),
  ])

  let mvrv = null
  if (mvrvResult.status === 'fulfilled' && Array.isArray(mvrvResult.value) && mvrvResult.value.length > 0) {
    const sorted = [...mvrvResult.value].sort((a, b) => new Date(a.d) - new Date(b.d))
    const latest = sorted[sorted.length - 1]
    mvrv = {
      value: latest.mvrv,
      date: latest.d,
    }
  }

  let etf = null
  if (etfResult.status === 'fulfilled' && Array.isArray(etfResult.value) && etfResult.value.length > 0) {
    const sorted = [...etfResult.value].sort((a, b) => new Date(a.d) - new Date(b.d))
    const latest = sorted[sorted.length - 1]
    const sevenDaysAgo = sorted[sorted.length - 8] ?? sorted[0]
    // Derive the data field name dynamically (exclude known metadata keys)
    const dataField = Object.keys(latest).find(k => k !== 'd' && k !== 'unixTs') ?? 'value'
    etf = {
      btcHeld: latest[dataField],
      btcHeld7dAgo: sevenDaysAgo?.[dataField] ?? null,
      date: latest.d,
    }
  }

  if (!mvrv && !etf) {
    return res.status(503).json({ error: 'All data sources unavailable' })
  }

  res.status(200).json({ mvrv, etf })
}
