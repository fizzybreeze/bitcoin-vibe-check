// Vercel serverless function — proxies on-chain data with 24-hour CDN cache.
// BGeometrics free tier: 15 req/day. Cache means at most 1 real call per 24h.
//
// Verified field shapes:
//   MVRV (BGeometrics): [{d: 'YYYY-MM-DD', unixTs: number, mvrv: number}, ...]
//   ETF (SoSoValue):    [{time: 'YYYY-MM-DD', totalBtcHolding: number}, ...]
//     SoSoValue may return items newest-first; sorted ascending for safety.
//
// CoinGlass fallback (requires COINGLASS_API_KEY env var, if SoSoValue unavailable):
//   https://open-api.coinglass.com/api/public/v2/spot_etf/bitcoin
//   Headers: { 'CG-API-KEY': process.env.COINGLASS_API_KEY }
//   Shape: { data: { list: [{ date: 'YYYY-MM-DD', btcAmount: number }, ...] } }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  // CDN cache 24h; serve stale for up to 1h while revalidating
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600')

  const token = process.env.BGEOMETRICS_API_KEY
  const bgeomHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  const [mvrvResult, etfResult] = await Promise.allSettled([
    fetch('https://api.bgeometrics.com/v1/mvrv', { headers: bgeomHeaders })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`MVRV HTTP ${r.status}`)))),
    fetch('https://sosovalue.com/api/etf/btc/spot-etf-total-holding-list')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`ETF HTTP ${r.status}`)))),
  ])

  // MVRV (unchanged)
  let mvrv = null
  if (mvrvResult.status === 'fulfilled' && Array.isArray(mvrvResult.value) && mvrvResult.value.length > 0) {
    const sorted = [...mvrvResult.value].sort((a, b) => new Date(a.d) - new Date(b.d))
    const latest = sorted[sorted.length - 1]
    mvrv = {
      value: latest.mvrv,
      date: latest.d,
    }
  }

  // ETF (SoSoValue — replaces BGeometrics)
  let etf = null
  if (etfResult.status === 'fulfilled') {
    const raw = etfResult.value
    // Handle both raw array and { code, data: [...] } envelope
    const items = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : null)
    if (items && items.length > 0) {
      const sorted = [...items].sort((a, b) => new Date(a.time) - new Date(b.time))
      const latest = sorted[sorted.length - 1]
      const sevenDaysAgo = sorted[sorted.length - 8] ?? sorted[0]
      etf = {
        btcHeld: latest.totalBtcHolding,
        btcHeld7dAgo: sevenDaysAgo?.totalBtcHolding ?? null,
        date: latest.time,
      }
    }
  }

  if (!mvrv && !etf) {
    return res.status(503).json({ error: 'All data sources unavailable' })
  }

  res.status(200).json({ mvrv, etf })
}
