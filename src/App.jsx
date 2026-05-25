import { useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import './App.css'

const REFRESH = 90
const BTC_COLOR = '#f7931a'

async function loadData() {
  const [priceRes, chartRes, feesRes, heightRes, fngRes] = await Promise.allSettled([
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=gbp').then(r => r.json()),
    fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=gbp&days=7').then(r => r.json()),
    fetch('https://mempool.space/api/v1/fees/recommended').then(r => r.json()),
    fetch('https://mempool.space/api/blocks/tip/height').then(r => r.json()),
    fetch('https://api.alternative.me/fng/').then(r => r.json()),
  ])

  // Sample hourly chart data to one point per calendar day
  const chart = (() => {
    if (chartRes.status !== 'fulfilled') return null
    const dayMap = new Map()
    chartRes.value.prices?.forEach(([ts, p]) => {
      const d = new Date(ts)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      dayMap.set(key, { ts, price: Math.round(p) })
    })
    return Array.from(dayMap.values()).map(({ ts, price }) => ({
      date: new Date(ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      price,
    }))
  })()

  return {
    price: priceRes.status === 'fulfilled' ? (priceRes.value.bitcoin?.gbp ?? null) : null,
    chart,
    fees: feesRes.status === 'fulfilled' ? feesRes.value : null,
    blockHeight: heightRes.status === 'fulfilled' ? heightRes.value : null,
    fng: fngRes.status === 'fulfilled' ? (fngRes.value.data?.[0] ?? null) : null,
  }
}

const gbp = n =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)

function fngColor(v) {
  const n = Number(v)
  if (n <= 25) return '#ef4444'
  if (n <= 45) return '#f97316'
  if (n <= 55) return '#eab308'
  if (n <= 75) return '#22c55e'
  return '#16a34a'
}

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900 p-5 ${className}`}>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
      {children}
    </p>
  )
}

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-800 ${className}`} />
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm shadow-xl">
      <p className="mb-0.5 text-zinc-400">{label}</p>
      <p className="font-semibold text-white">{gbp(payload[0].value)}</p>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [countdown, setCountdown] = useState(REFRESH)

  useEffect(() => {
    let active = true

    async function run() {
      const result = await loadData()
      if (!active) return
      setData(result)
      setLastUpdated(new Date())
      setCountdown(REFRESH)
      setLoading(false)
    }

    run()
    const id = setInterval(run, REFRESH * 1000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setCountdown(c => (c > 0 ? c - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [])

  const { price, chart, fees, blockHeight, fng } = data ?? {}

  const chartPrices = chart?.map(d => d.price) ?? []
  const lo = chartPrices.length ? Math.min(...chartPrices) : 0
  const hi = chartPrices.length ? Math.max(...chartPrices) : 0
  const pad = (hi - lo) * 0.08

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl">

        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold" style={{ color: BTC_COLOR }}>₿</span>
            <h1 className="text-lg font-semibold text-white">Bitcoin Dashboard</h1>
          </div>
          <div className="text-right text-sm text-zinc-500">
            {lastUpdated && (
              <p>Updated {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
            )}
            <p>Refreshing in {countdown}s</p>
          </div>
        </header>

        {/* Stat cards */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">

          <Card>
            <SectionLabel>BTC / GBP</SectionLabel>
            {loading
              ? <Skeleton className="h-10 w-40" />
              : <p className="text-4xl font-bold tracking-tight">
                  {price != null ? gbp(price) : '—'}
                </p>
            }
          </Card>

          <Card>
            <SectionLabel>Fear &amp; Greed</SectionLabel>
            {loading
              ? <Skeleton className="h-10 w-28" />
              : fng
                ? (
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-bold" style={{ color: fngColor(fng.value) }}>
                      {fng.value}
                    </span>
                    <span className="mb-1 text-base text-zinc-400">{fng.value_classification}</span>
                  </div>
                )
                : <span className="text-4xl font-bold text-zinc-600">—</span>
            }
          </Card>

          <Card>
            <SectionLabel>Block Height</SectionLabel>
            {loading
              ? <Skeleton className="h-10 w-36" />
              : <p className="text-4xl font-bold tracking-tight">
                  {blockHeight != null ? blockHeight.toLocaleString('en-GB') : '—'}
                </p>
            }
          </Card>

        </div>

        {/* Price chart */}
        <Card className="mb-4">
          <SectionLabel>7-Day Price (GBP)</SectionLabel>
          {loading
            ? <Skeleton className="h-56 w-full" />
            : (
              <ResponsiveContainer width="100%" height={224}>
                <AreaChart data={chart ?? []} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="btcFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BTC_COLOR} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={BTC_COLOR} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[lo - pad, hi + pad]}
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `£${Math.round(v / 1000)}k`}
                    width={48}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke={BTC_COLOR}
                    strokeWidth={2}
                    fill="url(#btcFill)"
                    dot={false}
                    activeDot={{ r: 4, fill: BTC_COLOR, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )
          }
        </Card>

        {/* Mempool fees */}
        <Card>
          <SectionLabel>Mempool Fees</SectionLabel>
          {loading
            ? (
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-20" />)}
              </div>
            )
            : fees
              ? (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Slow', sub: '~1 hour', value: fees.hourFee, color: '#71717a' },
                    { label: 'Medium', sub: '~30 min', value: fees.halfHourFee, color: BTC_COLOR },
                    { label: 'Fast', sub: '~10 min', value: fees.fastestFee, color: '#22c55e' },
                  ].map(({ label, sub, value, color }) => (
                    <div key={label} className="rounded-lg bg-zinc-800/60 p-4 text-center">
                      <p className="text-sm font-medium text-zinc-300">{label}</p>
                      <p className="mb-2 text-xs text-zinc-600">{sub}</p>
                      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                      <p className="mt-1 text-xs text-zinc-600">sat/vB</p>
                    </div>
                  ))}
                </div>
              )
              : <p className="text-zinc-600">—</p>
          }
        </Card>

        <p className="mt-6 text-center text-xs text-zinc-700">
          Data: CoinGecko · mempool.space · alternative.me
        </p>

      </div>
    </div>
  )
}
