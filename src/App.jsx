import { useState, useEffect, useRef } from 'react'
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import './App.css'
import { CURRENCY_META, fmtCurrency, fmtVolume, computeChartChange } from './utils.js'

const ORANGE = '#fb923c'
const CACHE_KEY = 'btc-cache'

const RANGES = [
  { label: '1D', days: 1   },
  { label: '7D', days: 7   },
  { label: '1M', days: 30  },
  { label: '1Y', days: 365 },
]

const RANGE_CHANGE_LABEL = {
  '1D': '24h change',
  '7D': '7d change',
  '1M': '30d change',
  '1Y': '1y change',
}

const FNG_COLOR = {
  'Extreme Fear': 'text-red-400',
  'Fear':         'text-amber-400',
  'Neutral':      'text-yellow-400',
  'Greed':        'text-lime-400',
  'Extreme Greed':'text-green-400',
}

const WS_SYMBOL_MAP = {
  'BTC/USD': 'priceUsd',
  'BTC/GBP': 'priceGbp',
  'BTC/EUR': 'priceEur',
  'BTC/CAD': 'priceCad',
  'BTC/CHF': 'priceChf',
}

function parseChartData(json, days) {
  if (!json?.prices?.length) return null
  if (days === 1) {
    return json.prices.map(([ts, p], i) => ({
      date: new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      price: Math.round(p),
      volume: json.total_volumes?.[i]?.[1] ?? 0,
    }))
  }
  const bucketMap = new Map()
  json.prices.forEach(([ts, p], i) => {
    const d = new Date(ts)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    bucketMap.set(key, { ts, price: Math.round(p), volume: json.total_volumes?.[i]?.[1] ?? 0 })
  })
  return Array.from(bucketMap.values()).map(({ ts, price, volume }) => ({
    date: new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    price,
    volume,
  }))
}

async function loadData() {
  const [priceRes, feesRes, heightRes, fngRes, sentiRes] = await Promise.allSettled([
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,gbp,eur,cad,chf&include_24hr_vol=true&include_24hr_change=true').then(r => r.json()),
    fetch('https://mempool.space/api/v1/fees/recommended').then(r => r.json()),
    fetch('https://mempool.space/api/blocks/tip/height').then(r => r.json()),
    fetch('https://api.alternative.me/fng/').then(r => r.json()),
    fetch('https://api.senticrypt.com/v2/all.json').then(r => r.json()),
  ])

  const btc = priceRes.status === 'fulfilled' ? (priceRes.value.bitcoin ?? {}) : {}
  let sentiCrypt = null
  if (sentiRes.status === 'fulfilled' && Array.isArray(sentiRes.value) && sentiRes.value.length > 0) {
    const latest = sentiRes.value[sentiRes.value.length - 1]
    if (latest?.mean != null) sentiCrypt = { mean: latest.mean }
  }
  return {
    priceUsd:      btc.usd          ?? null,
    priceGbp:      btc.gbp          ?? null,
    priceEur:      btc.eur          ?? null,
    priceCad:      btc.cad          ?? null,
    priceChf:      btc.chf          ?? null,
    volumeUsd:     btc.usd_24h_vol  ?? null,
    volumeGbp:     btc.gbp_24h_vol  ?? null,
    volumeEur:     btc.eur_24h_vol  ?? null,
    volumeCad:     btc.cad_24h_vol  ?? null,
    volumeChf:     btc.chf_24h_vol  ?? null,
    priceChange24h: btc.usd_24h_change ?? null,
    fees:        feesRes.status   === 'fulfilled' ? feesRes.value              : null,
    blockHeight: heightRes.status === 'fulfilled' ? heightRes.value            : null,
    fng:         fngRes.status    === 'fulfilled' ? (fngRes.value.data?.[0] ?? null) : null,
    sentiCrypt,
  }
}

async function fetchChart(days, currency) {
  const json = await fetch(
    `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=${currency}&days=${days}`
  ).then(r => r.json())
  return parseChartData(json, days)
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null }
}

function writeCache(data) {
  const prev = readCache() ?? {}
  const patch = {}
  if (data.priceUsd       != null) patch.priceUsd       = data.priceUsd
  if (data.priceGbp       != null) patch.priceGbp       = data.priceGbp
  if (data.priceEur       != null) patch.priceEur       = data.priceEur
  if (data.priceCad       != null) patch.priceCad       = data.priceCad
  if (data.priceChf       != null) patch.priceChf       = data.priceChf
  if (data.volumeUsd      != null) patch.volumeUsd      = data.volumeUsd
  if (data.volumeGbp      != null) patch.volumeGbp      = data.volumeGbp
  if (data.volumeEur      != null) patch.volumeEur      = data.volumeEur
  if (data.volumeCad      != null) patch.volumeCad      = data.volumeCad
  if (data.volumeChf      != null) patch.volumeChf      = data.volumeChf
  if (data.priceChange24h != null) patch.priceChange24h = data.priceChange24h
  if (data.fng            != null) patch.fng            = data.fng
  if (data.sentiCrypt     != null) patch.sentiCrypt     = data.sentiCrypt
  if (data.fees           != null) patch.fees           = data.fees
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ...prev, ...patch }))
}

const FNG_DOT_COLOR = {
  'Extreme Fear': '#f87171',
  'Fear':         '#fbbf24',
  'Neutral':      '#facc15',
  'Greed':        '#a3e635',
  'Extreme Greed':'#4ade80',
}

const SENTI_COLOR = {
  Bullish: 'text-green-400',
  Neutral: 'text-yellow-400',
  Bearish: 'text-red-400',
}

function sentiCryptLabel(mean) {
  if (mean == null) return null
  if (mean > 0.2) return 'Bullish'
  if (mean < -0.2) return 'Bearish'
  return 'Neutral'
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-gray-800 ${className}`} />
}

function FngArc({ score, classification }) {
  const angle    = score != null ? (180 - (score / 100) * 180) * Math.PI / 180 : null
  const dotX     = angle != null ? 40 + 32 * Math.cos(angle) : null
  const dotY     = angle != null ? 40 - 32 * Math.sin(angle) : null
  const dotColor = FNG_DOT_COLOR[classification] ?? ORANGE
  return (
    <svg width="80" height="45" viewBox="0 0 80 45" className="mt-3">
      <path d="M 8 40 A 32 32 0 0 1 72 40" fill="none" stroke="#1f2937" strokeWidth="4" strokeLinecap="round" />
      {dotX != null && <circle cx={dotX} cy={dotY} r={4} fill={dotColor} />}
    </svg>
  )
}

function SentiBar({ mean }) {
  const halfW     = 40
  const fillW     = mean != null ? Math.abs(mean) * halfW : 0
  const fillX     = mean != null && mean < 0 ? halfW - fillW : halfW
  const fillColor = mean != null && mean >= 0 ? '#4ade80' : '#f87171'
  return (
    <div className="mt-3">
      <svg width="80" height="6" viewBox="0 0 80 6">
        <rect x={0} y={0} width={80} height={6} rx={3} fill="#1f2937" />
        {mean != null && <rect x={fillX} y={0} width={fillW} height={6} fill={fillColor} />}
        <rect x={39} y={0} width={2} height={6} fill="#374151" />
      </svg>
      <div className="mt-1 flex justify-between">
        <span className="text-xs text-gray-700">-1</span>
        <span className="text-xs text-gray-700">+1</span>
      </div>
    </div>
  )
}

function SentimentCard({ fng, sentiCrypt, loading }) {
  const fngScore  = fng?.value != null ? parseInt(fng.value, 10) : null
  const fngClass  = fng?.value_classification ?? null
  const sentiMean = sentiCrypt?.mean ?? null
  const sentiLbl  = sentiCryptLabel(sentiMean)
  return (
    <div className="rounded-2xl bg-gray-900 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Market Sentiment</p>
      <div className="mt-3 flex gap-4">
        {/* Fear & Greed */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Fear & Greed</p>
          <div className="mt-2">
            {loading || fngScore == null
              ? <Skeleton className="h-8 w-10" />
              : <p className="text-2xl font-bold text-orange-400">{fngScore}</p>
            }
            <p className={`mt-1 text-sm ${FNG_COLOR[fngClass] ?? 'text-gray-500'}`}>
              {fngClass ?? (loading ? ' ' : '—')}
            </p>
            <FngArc score={loading ? null : fngScore} classification={fngClass} />
          </div>
        </div>

        <div className="w-px self-stretch bg-gray-800" />

        {/* SentiCrypt */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">SentiCrypt</p>
          <div className="mt-2">
            {loading
              ? <Skeleton className="h-8 w-14" />
              : sentiMean == null
                ? <p className="text-2xl font-bold text-gray-600">—</p>
                : <p className="text-2xl font-bold text-orange-400">
                    {sentiMean >= 0 ? '+' : ''}{sentiMean.toFixed(2)}
                  </p>
            }
            <p className={`mt-1 text-sm ${loading ? 'text-gray-600' : sentiMean == null ? 'text-gray-600' : (SENTI_COLOR[sentiLbl] ?? 'text-gray-400')}`}>
              {loading ? ' ' : sentiMean == null ? 'Unavailable' : sentiLbl}
            </p>
            {!loading && <SentiBar mean={sentiMean} />}
            {loading && <div className="mt-3 h-[45px]" />}
          </div>
        </div>
      </div>
    </div>
  )
}

export function KpiCard({ label, value, sub, subClassName, change }) {
  const changePositive = change != null && change >= 0
  return (
    <div className="rounded-2xl bg-gray-900 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</p>
      <div className="mt-3">
        {value == null
          ? <Skeleton className="h-9 w-32" />
          : <p className="text-2xl font-bold text-orange-400 md:text-3xl">{value}</p>
        }
        {change != null && value != null && (
          <p className={`mt-1.5 text-sm font-medium ${changePositive ? 'text-green-400' : 'text-red-400'}`}>
            {changePositive ? '▲' : '▼'}&nbsp;{changePositive ? '+' : ''}{change.toFixed(2)}%
          </p>
        )}
        {sub && value != null && (
          <p className={`mt-1.5 text-sm ${subClassName ?? 'text-gray-400'}`}>{sub}</p>
        )}
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null
  const priceEntry  = payload.find(p => p.dataKey === 'price')
  const volumeEntry = payload.find(p => p.dataKey === 'volume')
  if (!priceEntry) return null
  return (
    <div style={{
      background: '#111827', border: '1px solid #374151',
      borderRadius: 8, padding: '8px 12px', fontSize: 13,
      boxShadow: '0 4px 12px rgb(0 0 0 / 0.4)',
    }}>
      <p style={{ color: '#6b7280', marginBottom: 4, fontSize: 11 }}>{label}</p>
      <p style={{ color: ORANGE, fontWeight: 600 }}>{fmtCurrency(priceEntry.value, currency)}</p>
      {volumeEntry && (
        <p style={{ color: '#6b7280', marginTop: 4, fontSize: 11 }}>
          Vol&nbsp;{fmtVolume(volumeEntry.value, currency)}
        </p>
      )}
    </div>
  )
}

export default function App() {
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [range, setRange]             = useState('7D')
  const [currency, setCurrency]       = useState('usd')
  const [chart, setChart]             = useState(null)
  const [chartLoading, setChartLoading] = useState(true)
  const [chartChange, setChartChange] = useState(null)
  const [wsLive, setWsLive]           = useState(false)
  const chartCache   = useRef(new Map())
  const wsRef        = useRef(null)
  const reconnectRef = useRef(null)

  // Load KPI data once on mount
  useEffect(() => {
    let active = true
    async function run() {
      const result = await loadData()
      if (!active) return
      writeCache(result)
      const cache = readCache() ?? {}
      setData({
        ...result,
        priceUsd:       result.priceUsd       ?? cache.priceUsd       ?? null,
        priceGbp:       result.priceGbp       ?? cache.priceGbp       ?? null,
        priceEur:       result.priceEur       ?? cache.priceEur       ?? null,
        priceCad:       result.priceCad       ?? cache.priceCad       ?? null,
        priceChf:       result.priceChf       ?? cache.priceChf       ?? null,
        volumeUsd:      result.volumeUsd      ?? cache.volumeUsd      ?? null,
        volumeGbp:      result.volumeGbp      ?? cache.volumeGbp      ?? null,
        volumeEur:      result.volumeEur      ?? cache.volumeEur      ?? null,
        volumeCad:      result.volumeCad      ?? cache.volumeCad      ?? null,
        volumeChf:      result.volumeChf      ?? cache.volumeChf      ?? null,
        priceChange24h: result.priceChange24h ?? cache.priceChange24h ?? null,
        fng:            result.fng            ?? cache.fng            ?? null,
        sentiCrypt:     result.sentiCrypt     ?? cache.sentiCrypt     ?? null,
        fees:           result.fees           ?? cache.fees           ?? null,
      })
      setLastUpdated(new Date())
      setLoading(false)
    }
    run()
    return () => { active = false }
  }, [])

  // Real-time price feed via Kraken WebSocket v2
  useEffect(() => {
    let retryDelay = 1000

    function connect() {
      const ws = new WebSocket('wss://ws.kraken.com/v2')
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({
          method: 'subscribe',
          params: { channel: 'ticker', symbol: Object.keys(WS_SYMBOL_MAP) },
        }))
        setWsLive(true)
        retryDelay = 1000
      }

      ws.onmessage = ({ data }) => {
        const msg = JSON.parse(data)
        if (msg.channel !== 'ticker' || !msg.data?.length) return
        const updates = {}
        for (const ticker of msg.data) {
          const key = WS_SYMBOL_MAP[ticker.symbol]
          if (key && ticker.last != null) updates[key] = Math.round(ticker.last)
        }
        const usdTicker = msg.data.find(t => t.symbol === 'BTC/USD')
        if (usdTicker?.change_pct != null) updates.priceChange24h = usdTicker.change_pct
        if (Object.keys(updates).length) setData(prev => prev ? { ...prev, ...updates } : prev)
      }

      ws.onclose = () => {
        setWsLive(false)
        reconnectRef.current = setTimeout(connect, retryDelay)
        retryDelay = Math.min(retryDelay * 2, 30000)
      }

      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [])

  // Load chart whenever range or currency changes; cache by "range-currency"
  useEffect(() => {
    let active = true
    const days = RANGES.find(r => r.label === range)?.days ?? 7
    const cacheKey = `${range}-${currency}`

    if (chartCache.current.has(cacheKey)) {
      const cached = chartCache.current.get(cacheKey)
      setChart(cached)
      setChartChange(computeChartChange(cached))
      setChartLoading(false)
      return
    }

    setChartLoading(true)
    setChartChange(null)
    async function run() {
      const result = await fetchChart(days, currency)
      if (!active) return
      if (result !== null) chartCache.current.set(cacheKey, result)
      setChart(result)
      setChartChange(computeChartChange(result))
      setChartLoading(false)
    }
    run()
    return () => { active = false }
  }, [range, currency])

  const { priceUsd, priceGbp, priceEur, priceCad, priceChf,
          volumeUsd, volumeGbp, volumeEur, volumeCad, volumeChf,
          priceChange24h, fees, blockHeight, fng, sentiCrypt } = data ?? {}
  const price  = { usd: priceUsd,  gbp: priceGbp,  eur: priceEur,  cad: priceCad,  chf: priceChf  }[currency] ?? null
  const volume = { usd: volumeUsd, gbp: volumeGbp, eur: volumeEur, cad: volumeCad, chf: volumeChf }[currency] ?? null

  const displayedChange = range === '1D' ? (priceChange24h ?? null) : chartChange
  const changeLabel = RANGE_CHANGE_LABEL[range]

  const chartPrices = chart?.map(d => d.price) ?? []
  const lo  = chartPrices.length ? Math.min(...chartPrices) : 0
  const hi  = chartPrices.length ? Math.max(...chartPrices) : 0
  const pad = (hi - lo) * 0.08

  const xInterval  = chart?.length ? Math.max(0, Math.floor(chart.length / 7) - 1) : 0
  const currencySym = CURRENCY_META[currency]?.sym ?? '$'

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-8 text-white">

      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight md:text-3xl">Bitcoin Dashboard</h1>
        <div className="flex items-center gap-4">
          {/* Currency toggle */}
          <div className="relative">
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="appearance-none cursor-pointer rounded-full bg-gray-800 pl-3 pr-7 py-1 text-xs font-semibold uppercase text-orange-400 outline-none"
            >
              {['usd', 'gbp', 'eur', 'cad', 'chf'].map(c => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-orange-400 text-xs">▾</span>
          </div>
          <p className="flex items-center gap-1.5 text-sm text-gray-500">
            {wsLive ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                Live
              </>
            ) : lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
              : loading ? 'Loading…' : ''
            }
          </p>
        </div>
      </header>

      {/* KPI row */}
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="BTC Price"
          value={price != null ? fmtCurrency(price, currency) : null}
          change={displayedChange}
          sub={displayedChange != null ? changeLabel : null}
        />
        <SentimentCard fng={fng} sentiCrypt={sentiCrypt} loading={loading} />
        <KpiCard
          label="Block Height"
          value={blockHeight != null ? blockHeight.toLocaleString('en-US') : null}
        />
        <KpiCard
          label="24h Volume"
          value={fmtVolume(volume, currency)}
        />
      </div>

      {/* Chart + Fees */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

        {/* Price chart */}
        <div className="rounded-2xl bg-gray-900 p-6 md:col-span-2">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Price · {currency.toUpperCase()}
            </p>
            <div className="flex gap-1 overflow-x-auto">
              {RANGES.map(({ label }) => (
                <button
                  key={label}
                  onClick={() => setRange(label)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    range === label
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading && !chart
            ? <Skeleton className="h-64" />
            : (
              <div className={`transition-opacity duration-200 ${chartLoading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                <ResponsiveContainer width="100%" height={264}>
                  <ComposedChart data={chart ?? []} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={ORANGE} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={ORANGE} stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                    <XAxis
                      dataKey="date"
                      interval={xInterval}
                      tick={{ fill: '#6b7280', fontSize: 11 }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      yAxisId="price"
                      domain={[lo - pad, hi + pad]}
                      tick={{ fill: '#6b7280', fontSize: 11 }}
                      axisLine={false} tickLine={false}
                      tickFormatter={v => `${currencySym}${Math.round(v / 1000)}k`}
                      width={52}
                    />
                    <YAxis yAxisId="volume" hide />
                    <Tooltip content={<ChartTooltip currency={currency} />} />
                    <Bar
                      yAxisId="volume" dataKey="volume"
                      fill={ORANGE} fillOpacity={0.15}
                      strokeWidth={0} legendType="none"
                      isAnimationActive={false}
                    />
                    <Area
                      yAxisId="price"
                      type="monotone" dataKey="price"
                      stroke={ORANGE} strokeWidth={2}
                      fill="url(#priceGrad)" dot={false}
                      activeDot={{ r: 4, fill: ORANGE, strokeWidth: 0 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )
          }
        </div>

        {/* Network fees */}
        <div className="flex flex-col">
          <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
            Network Fees
          </p>
          <div className="flex flex-1 flex-row gap-3 md:flex-col">
            {loading || !fees
              ? [0, 1, 2].map(i => <Skeleton key={i} className="flex-1" />)
              : [
                  { label: 'Slow',   time: '~1 hour',  value: fees.hourFee     },
                  { label: 'Medium', time: '~30 min',  value: fees.halfHourFee },
                  { label: 'Fast',   time: '~10 min',  value: fees.fastestFee  },
                ].map(({ label, time, value }) => (
                  <div key={label} className="flex flex-1 flex-col justify-center rounded-2xl bg-gray-900 px-3 py-4 md:px-6 md:py-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</p>
                    <div className="mt-2 flex items-baseline gap-1 md:gap-2">
                      <span className="text-xl font-bold text-orange-400 md:text-3xl">{value}</span>
                      <span className="text-sm text-gray-500">sat/vB</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">{time}</p>
                  </div>
                ))
            }
          </div>
        </div>

      </div>

      <p className="mt-8 text-center text-xs text-gray-700">
        CoinGecko · mempool.space · alternative.me · senticrypt.com
      </p>

    </div>
  )
}
