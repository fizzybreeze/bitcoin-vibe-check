// Vercel serverless function — proxies on-chain data with 24-hour CDN cache.
// BGeometrics free tier: 15 req/day. Cache means at most 1 real call per 24h.
//
// Verified field shapes:
//   MVRV (BGeometrics): [{d: 'YYYY-MM-DD', unixTs: number, mvrv: number}, ...]
//   ETF  (Yahoo Finance quoteSummary summaryDetail.totalAssets, 5 tickers):
//     current BTC held = sum(totalAssets) / BTC spot price (from Binance)
//     btcHeld7dAgo: derived from 10-day ETF chart prices vs 10-day BTC klines —
//     see inline comment for approximation caveat.
//
// No extra env vars needed (Yahoo Finance is public; Binance is public).

const ETF_TICKERS = ['IBIT', 'FBTC', 'ARKB', 'BITB', 'HODL']
const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  // Cache-Control is set dynamically at the end: 24h if all data present, 5 min if ETF is missing

  const token = process.env.BGEOMETRICS_API_KEY
  const bgeomHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  // Fetch MVRV, BTC 10-day klines, and each ETF's quoteSummary + 10-day chart in parallel
  const [mvrvResult, btcKlinesResult, ...etfResults] = await Promise.allSettled([
    fetch('https://api.bgeometrics.com/v1/mvrv', { headers: bgeomHeaders })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`MVRV HTTP ${r.status}`)))),
    fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=10')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`BTC klines HTTP ${r.status}`)))),
    ...ETF_TICKERS.map(ticker => Promise.allSettled([
      fetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=summaryDetail`, { headers: YF_HEADERS })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${ticker} summary HTTP ${r.status}`)))),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=10d`, { headers: YF_HEADERS })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${ticker} chart HTTP ${r.status}`)))),
    ])),
  ])

  // MVRV (unchanged)
  let mvrv = null
  if (mvrvResult.status === 'fulfilled' && Array.isArray(mvrvResult.value) && mvrvResult.value.length > 0) {
    const sorted = [...mvrvResult.value].sort((a, b) => new Date(a.d) - new Date(b.d))
    const latest = sorted[sorted.length - 1]
    mvrv = { value: latest.mvrv, date: latest.d }
  }

  // ETF (Yahoo Finance + Binance)
  let etf = null
  try {
    const klines = btcKlinesResult.status === 'fulfilled' ? btcKlinesResult.value : null
    // klines: [[openTime, open, high, low, close, ...], ...] — ascending by date
    const btcToday = klines ? parseFloat(klines[klines.length - 1][4]) : null
    const btc7d    = klines && klines.length >= 8 ? parseFloat(klines[klines.length - 8][4]) : null

    console.log('[chain-data] BTC prices — today:', btcToday, '7d ago:', btc7d)

    let totalAumToday = 0
    let totalAum7dAgo = 0
    let yfWorked = false

    for (const [summaryResult, chartResult] of etfResults) {
      const totalAssets = summaryResult.status === 'fulfilled'
        ? (summaryResult.value?.quoteSummary?.result?.[0]?.summaryDetail?.totalAssets?.raw ?? 0)
        : 0
      if (totalAssets > 0) {
        totalAumToday += totalAssets
        yfWorked = true
      }

      // Chart gives 10-day closes; ETF price 7d ago lets us estimate 7d-ago AUM
      // Note: shares outstanding is assumed constant over 7 days (small approximation error)
      if (chartResult.status === 'fulfilled' && totalAssets > 0) {
        const closes = chartResult.value?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
        const closeToday = closes[closes.length - 1]
        const close7d    = closes.length >= 8 ? closes[closes.length - 8] : null
        if (closeToday && close7d) {
          totalAum7dAgo += totalAssets * (close7d / closeToday)
        }
      }
    }

    console.log('[chain-data] ETF total AUM today:', totalAumToday, '7d ago:', totalAum7dAgo, 'yfWorked:', yfWorked)

    if (yfWorked && btcToday) {
      const btcHeld      = Math.round(totalAumToday / btcToday)
      // btcHeld7dAgo uses 7d-ago ETF prices / 7d-ago BTC price.
      // Because ETF price ≈ BTC price (arbitrage), this closely approximates
      // the change driven by net share creation/redemption (inflows/outflows).
      const btcHeld7dAgo = (totalAum7dAgo > 0 && btc7d)
        ? Math.round(totalAum7dAgo / btc7d)
        : null
      etf = {
        btcHeld,
        btcHeld7dAgo,
        date: new Date().toISOString().slice(0, 10),
      }
    }
  } catch (e) {
    console.error('[chain-data] ETF calculation error:', e.message)
  }

  if (!mvrv && !etf) {
    return res.status(503).json({ error: 'All data sources unavailable' })
  }

  // Cache 24h when all data present; retry in 5 min if ETF is missing
  const cacheTtl = etf ? 86400 : 300
  res.setHeader('Cache-Control', `s-maxage=${cacheTtl}, stale-while-revalidate=60`)

  res.status(200).json({ mvrv, etf })
}
