// Vercel serverless function — proxies on-chain data with 24-hour CDN cache.
// BGeometrics free tier: 15 req/day. Cache means at most 1 real call per 24h.
//
// Verified field shapes:
//   MVRV (BGeometrics): [{d: 'YYYY-MM-DD', unixTs: number, mvrv: number}, ...]
//   ETF  (CoinGlass v3): { code, data: [{ date: <ms>, totalBtcAmount: number, ... }, ...] }
//     — flow-history returns newest-first; sorted ascending. Field names confirmed
//       from Vercel logs on first live run (see console.log below).
//
// Required env var: COINGLASS_API_KEY (free tier from coinglass.com)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  // Cache-Control is set dynamically at the end: 24h if all data present, 5 min if ETF is missing

  const token = process.env.BGEOMETRICS_API_KEY
  const bgeomHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  const [mvrvResult, etfResult] = await Promise.allSettled([
    fetch('https://api.bgeometrics.com/v1/mvrv', { headers: bgeomHeaders })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`MVRV HTTP ${r.status}`)))),
    fetch('https://api.bgeometrics.com/v1/etf-holdings-btc', { headers: bgeomHeaders })
      .then(r => {
        console.log('[chain-data] BGeometrics ETF status:', r.status)
        return r.ok ? r.json() : Promise.reject(new Error(`ETF HTTP ${r.status}`))
      })
      .then(json => {
        console.log('[chain-data] BGeometrics ETF sample:', JSON.stringify(json).slice(0, 500))
        return json
      }),
  ])

  // MVRV (unchanged)
  let mvrv = null
  if (mvrvResult.status === 'fulfilled' && Array.isArray(mvrvResult.value) && mvrvResult.value.length > 0) {
    const sorted = [...mvrvResult.value].sort((a, b) => new Date(a.d) - new Date(b.d))
    const latest = sorted[sorted.length - 1]
    mvrv = { value: latest.mvrv, date: latest.d }
  }

  // ETF (BGeometrics /v1/etf-holdings-btc)
  // Field names are logged above on first run — update this comment once confirmed.
  let etf = null
  if (etfResult.status === 'fulfilled') {
    const raw = etfResult.value
    const items = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : null)
    if (items && items.length > 0) {
      const sorted = [...items].sort((a, b) => new Date(a.d ?? a.date ?? a.time) - new Date(b.d ?? b.date ?? b.time))
      const latest = sorted[sorted.length - 1]
      const sevenAgo = sorted[sorted.length - 8] ?? sorted[0]
      // Derive data field: skip known metadata keys
      const dataField = Object.keys(latest).find(k => !['d', 'date', 'time', 'unixTs'].includes(k)) ?? null
      if (dataField) {
        const dateVal = latest.d ?? latest.date ?? latest.time ?? ''
        etf = {
          btcHeld: latest[dataField],
          btcHeld7dAgo: sevenAgo?.[dataField] ?? null,
          date: String(dateVal).slice(0, 10),
        }
      }
    }
  } else {
    console.error('[chain-data] ETF fetch failed:', etfResult.reason?.message)
  }

  if (!mvrv && !etf) {
    return res.status(503).json({ error: 'All data sources unavailable' })
  }

  // Cache 24h when all data present; retry in 5 min if ETF is missing (key not set, fetch failed, etc.)
  const cacheTtl = etf ? 86400 : 300
  res.setHeader('Cache-Control', `s-maxage=${cacheTtl}, stale-while-revalidate=60`)

  res.status(200).json({ mvrv, etf })
}
