import { useState, useEffect, useRef } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import './App.css'

const ORANGE = '#fb923c'
const CACHE_KEY = 'btc-cache'

const RANGES = [
  { label: '1D',  days: 1     },
  { label: '7D',  days: 7     },
  { label: '1M',  days: 30    },
  { label: '1Y',  days: 365   },
  { label: '5Y',  days: 1825  },
  { label: 'All', days: 'max' },
]

function parseChartData(json, days) {
  if (!json?.prices?.length) return null
  if (days === 1) {
    return json.prices.map(([ts, p]) => ({
      date: new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      price: Math.round(p),
    }))
  }
  const dayMap = new Map()
  json.prices.forEach(([ts, p]) => {
    const d = new Date(ts)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    dayMap.set(key, { ts, price: Math.round(p) })
  })
  return Array.from(dayMap.values()).map(({ ts, price }) => ({
    date: new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    price,
  }))
}

async function loadData() {
  const [priceRes, feesRes, heightRes, fngRes] = await Promise.allSettled([
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_vol=true').then(r => r.json()),
    fetch('https://mempool.space/api/v1/fees/recommended').then(r => r.json()),
    fetch('https://mempool.space/api/blocks/tip/height').then(r => r.json()),
    fetch('https://api.alternative.me/fng/').then(r => r.json()),
  ])

  const btc = priceRes.status === 'fulfilled' ? (priceRes.value.bitcoin ?? {}) : {}
  return {
    price:       btc.usd          ?? null,
    volume24h:   btc.usd_24h_vol  ?? null,
    fees:        feesRes.status   === 'fulfilled' ? feesRes.value              : null,
    blockHeight: heightRes.status === 'fulfilled' ? heightRes.value            : null,
    fng:         fngRes.status    === 'fulfilled' ? (fngRes.value.data?.[0] ?? null) : null,
  }
}

async function fetchChart(days) {
  const json = await fetch(
    `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}`
  ).then(r => r.json())
  return parseChartData(json, days)
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null }
}

function writeCache(data) {
  const prev = readCache() ?? {}
  const patch = {}
  if (data.price     != null) patch.price     = data.price
  if (data.volume24h != null) patch.volume24h = data.volume24h
  if (data.fng       != null) patch.fng       = data.fng
  if (data.fees      != null) patch.fees      = data.fees
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ...prev, ...patch }))
}

const fmtUsd = n =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtVolume = n => {
  if (n == null) return null
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return fmtUsd(n)
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-gray-800 ${className}`} />
}

function KpiCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl bg-gray-900 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</p>
      <div className="mt-3">
        {value == null
          ? <Skeleton className="h-9 w-32" />
          : <p className="text-3xl font-bold text-orange-400">{value}</p>
        }
        {sub && value != null && (
          <p className="mt-1.5 text-sm text-gray-400">{sub}</p>
        )}
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#111827', border: '1px solid #374151',
      borderRadius: 8, padding: '8px 12px', fontSize: 13,
      boxShadow: '0 4px 12px rgb(0 0 0 / 0.4)',
    }}>
      <p style={{ color: '#6b7280', marginBottom: 2, fontSize: 11 }}>{label}</p>
      <p style={{ color: ORANGE, fontWeight: 600 }}>{fmtUsd(payload[0].value)}</p>
    </div>
  )
}

export default function App() {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [range, setRange]         = useState('7D')
  const [chart, setChart]         = useState(null)
  const [chartLoading, setChartLoading] = useState(true)
  const chartCache = useRef(new Map())

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
        price:     result.price     ?? cache.price     ?? null,
        volume24h: result.volume24h ?? cache.volume24h ?? null,
        fng:       result.fng       ?? cache.fng       ?? null,
        fees:      result.fees      ?? cache.fees      ?? null,
      })
      setLastUpdated(new Date())
      setLoading(false)
    }
    run()
    return () => { active = false }
  }, [])

  // Load chart whenever range changes; use session cache to avoid re-fetching
  useEffect(() => {
    let active = true
    const days = RANGES.find(r => r.label === range)?.days ?? 7

    if (chartCache.current.has(range)) {
      setChart(chartCache.current.get(range))
      setChartLoading(false)
      return
    }

    setChartLoading(true)
    async function run() {
      const result = await fetchChart(days)
      if (!active) return
      chartCache.current.set(range, result)
      setChart(result)
      setChartLoading(false)
    }
    run()
    return () => { active = false }
  }, [range])

  const { price, volume24h, fees, blockHeight, fng } = data ?? {}

  const chartPrices = chart?.map(d => d.price) ?? []
  const lo  = chartPrices.length ? Math.min(...chartPrices) : 0
  const hi  = chartPrices.length ? Math.max(...chartPrices) : 0
  const pad = (hi - lo) * 0.08

  // Show roughly 7–8 x-axis ticks regardless of data length
  const xInterval = chart?.length ? Math.max(0, Math.floor(chart.length / 7) - 1) : 0

  return (
    <div className="min-h-screen bg-gray-950 p-8 text-white">

      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Bitcoin Dashboard</h1>
        <p className="text-sm text-gray-500">
          {lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
            : loading ? 'Loading…' : ''
          }
        </p>
      </header>

      {/* KPI row */}
      <div className="mb-4 grid grid-cols-4 gap-4">
        <KpiCard
          label="BTC Price"
          value={price != null ? fmtUsd(price) : null}
        />
        <KpiCard
          label="Fear & Greed"
          value={fng?.value ?? null}
          sub={fng?.value_classification}
        />
        <KpiCard
          label="Block Height"
          value={blockHeight != null ? blockHeight.toLocaleString('en-US') : null}
        />
        <KpiCard
          label="24h Volume"
          value={fmtVolume(volume24h)}
        />
      </div>

      {/* Chart + Fees */}
      <div className="grid grid-cols-3 gap-4">

        {/* Price chart */}
        <div className="col-span-2 rounded-2xl bg-gray-900 p-6">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Price · USD
            </p>
            <div className="flex gap-1">
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
                  <AreaChart data={chart ?? []} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
                      domain={[lo - pad, hi + pad]}
                      tick={{ fill: '#6b7280', fontSize: 11 }}
                      axisLine={false} tickLine={false}
                      tickFormatter={v => `$${Math.round(v / 1000)}k`}
                      width={52}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone" dataKey="price"
                      stroke={ORANGE} strokeWidth={2}
                      fill="url(#priceGrad)" dot={false}
                      activeDot={{ r: 4, fill: ORANGE, strokeWidth: 0 }}
                    />
                  </AreaChart>
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
          <div className="flex flex-1 flex-col gap-3">
            {loading || !fees
              ? [0, 1, 2].map(i => <Skeleton key={i} className="flex-1" />)
              : [
                  { label: 'Slow',   time: '~1 hour',  value: fees.hourFee     },
                  { label: 'Medium', time: '~30 min',  value: fees.halfHourFee },
                  { label: 'Fast',   time: '~10 min',  value: fees.fastestFee  },
                ].map(({ label, time, value }) => (
                  <div key={label} className="flex flex-1 flex-col justify-center rounded-2xl bg-gray-900 px-6 py-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</p>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-orange-400">{value}</span>
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
        CoinGecko · mempool.space · alternative.me
      </p>

    </div>
  )
}
