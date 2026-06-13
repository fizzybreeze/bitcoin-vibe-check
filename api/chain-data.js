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
  // CDN cache 24h; serve stale for up to 1h while revalidating
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600')

  const token = process.env.BGEOMETRICS_API_KEY
  const bgeomHeaders = token ? { Authorization: `Bearer ${token}` } : {}
  const cgKey = process.env.COINGLASS_API_KEY

  const [mvrvResult, etfResult] = await Promise.allSettled([
    fetch('https://api.bgeometrics.com/v1/mvrv', { headers: bgeomHeaders })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`MVRV HTTP ${r.status}`)))),
    cgKey
      ? fetch('https://open-api-v3.coinglass.com/api/bitcoin/etf/flow-history', {
          headers: { 'CG-API-KEY': cgKey, accept: 'application/json' },
        }).then(r => (r.ok ? r.json() : Promise.reject(new Error(`ETF HTTP ${r.status}`))))
      : Promise.reject(new Error('COINGLASS_API_KEY not set')),
  ])

  // MVRV (unchanged)
  let mvrv = null
  if (mvrvResult.status === 'fulfilled' && Array.isArray(mvrvResult.value) && mvrvResult.value.length > 0) {
    const sorted = [...mvrvResult.value].sort((a, b) => new Date(a.d) - new Date(b.d))
    const latest = sorted[sorted.length - 1]
    mvrv = { value: latest.mvrv, date: latest.d }
  }

  // ETF (CoinGlass v3 — /api/bitcoin/etf/flow-history)
  let etf = null
  if (etfResult.status === 'fulfilled') {
    const raw = etfResult.value
    // Log first call so we can verify actual field names in Vercel function logs
    console.log('[chain-data] CoinGlass ETF sample:', JSON.stringify(raw).slice(0, 400))
    const items = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : null)
    if (items && items.length > 0) {
      // Sort ascending by timestamp (CoinGlass returns newest-first)
      const sorted = [...items].sort((a, b) => {
        const da = a.date ?? a.time ?? a.ts ?? 0
        const db = b.date ?? b.time ?? b.ts ?? 0
        return da - db
      })
      const latest = sorted[sorted.length - 1]
      const sevenAgo = sorted[sorted.length - 8] ?? sorted[0]

      // Try likely field names for total BTC held (confirmed from logs after first run)
      const btcHeld = latest.totalBtcAmount ?? latest.btcAmount ?? latest.holdingAmount ?? latest.total ?? null
      const btcHeld7dAgo = sevenAgo?.totalBtcAmount ?? sevenAgo?.btcAmount ?? sevenAgo?.holdingAmount ?? sevenAgo?.total ?? null

      if (btcHeld != null) {
        // CoinGlass date is Unix ms timestamp — convert to YYYY-MM-DD
        const dateVal = latest.date ?? latest.time ?? latest.ts
        const dateStr = typeof dateVal === 'number'
          ? new Date(dateVal).toISOString().slice(0, 10)
          : String(dateVal).slice(0, 10)
        etf = { btcHeld, btcHeld7dAgo, date: dateStr }
      }
    }
  } else {
    console.error('[chain-data] ETF fetch failed:', etfResult.reason?.message)
  }

  if (!mvrv && !etf) {
    return res.status(503).json({ error: 'All data sources unavailable' })
  }

  res.status(200).json({ mvrv, etf })
}
