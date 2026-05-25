import { useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts'
import './App.css'

const BTC_COLOR = '#f7931a'

async function loadData() {
  const [priceRes, chartGbpRes, chartUsdRes, feesRes, heightRes, fngRes] = await Promise.allSettled([
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=gbp,usd').then(r => r.json()),
    fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=gbp&days=7').then(r => r.json()),
    fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7').then(r => r.json()),
    fetch('https://mempool.space/api/v1/fees/recommended').then(r => r.json()),
    fetch('https://mempool.space/api/blocks/tip/height').then(r => r.json()),
    fetch('https://api.alternative.me/fng/').then(r => r.json()),
  ])

  function parseChart(res) {
    if (res.status !== 'fulfilled') return null
    const dayMap = new Map()
    res.value.prices?.forEach(([ts, p]) => {
      const d = new Date(ts)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      dayMap.set(key, { ts, price: Math.round(p) })
    })
    return Array.from(dayMap.values()).map(({ ts, price }) => ({
      date: new Date(ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      price,
    }))
  }

  const prices = priceRes.status === 'fulfilled' ? (priceRes.value.bitcoin ?? {}) : {}

  return {
    priceGbp: prices.gbp ?? null,
    priceUsd: prices.usd ?? null,
    chartGbp: parseChart(chartGbpRes),
    chartUsd: parseChart(chartUsdRes),
    fees: feesRes.status === 'fulfilled' ? feesRes.value : null,
    blockHeight: heightRes.status === 'fulfilled' ? heightRes.value : null,
    fng: fngRes.status === 'fulfilled' ? (fngRes.value.data?.[0] ?? null) : null,
  }
}

const CACHE_KEY = 'btc-cache'

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null }
}

function writeCache(data) {
  const prev = readCache() ?? {}
  const patch = {}
  if (data.priceGbp != null) patch.priceGbp = data.priceGbp
  if (data.priceUsd != null) patch.priceUsd = data.priceUsd
  if (data.fng != null) patch.fng = data.fng
  if (data.fees != null) patch.fees = data.fees
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ...prev, ...patch }))
}

const fmtPrice = (n, currency) =>
  new Intl.NumberFormat(currency === 'gbp' ? 'en-GB' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(n)

function fngColor(v) {
  const n = Number(v)
  if (n <= 25) return '#ef4444'
  if (n <= 45) return '#f97316'
  if (n <= 55) return '#eab308'
  if (n <= 75) return '#22c55e'
  return '#16a34a'
}

// Colors for Recharts inline props (can't use Tailwind classes there)
function getChartTheme(isDark) {
  return {
    grid: isDark ? '#27272a' : '#e4e4e7',
    tick: isDark ? '#71717a' : '#9ca3af',
    gaugeTrack: isDark ? '#27272a' : '#e4e4e7',
    tooltipBg: isDark ? '#18181b' : '#ffffff',
    tooltipBorder: isDark ? '#3f3f46' : '#e4e4e7',
    tooltipText: isDark ? '#ffffff' : '#09090b',
    tooltipSub: isDark ? '#a1a1aa' : '#71717a',
  }
}

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
      {children}
    </p>
  )
}

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800 ${className}`} />
}

function CurrencyToggle({ value, onChange }) {
  return (
    <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
      {['usd', 'gbp'].map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`rounded-md px-3 py-1 font-semibold uppercase transition-colors ${
            value === c
              ? 'bg-white text-zinc-800 shadow-sm dark:bg-zinc-600 dark:text-white'
              : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

function FearGreedGauge({ value, classification, trackColor }) {
  const score = Number(value)
  const color = fngColor(score)

  return (
    <div>
      <ResponsiveContainer width="100%" height={110}>
        <PieChart>
          <Pie
            data={[{ value: score }, { value: 100 - score }]}
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius={72}
            outerRadius={100}
            dataKey="value"
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill={color} />
            <Cell fill={trackColor} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 text-center">
        <p className="text-3xl font-bold leading-none" style={{ color }}>{score}</p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{classification}</p>
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label, currency, tooltipBg, tooltipBorder, tooltipText, tooltipSub }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: tooltipBg,
      border: `1px solid ${tooltipBorder}`,
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 14,
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    }}>
      <p style={{ color: tooltipSub, marginBottom: 2 }}>{label}</p>
      <p style={{ color: tooltipText, fontWeight: 600 }}>{fmtPrice(payload[0].value, currency)}</p>
    </div>
  )
}

export default function App() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('btc-theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // Keep in sync with html class (initial class is set in index.html script)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  // Track system preference changes when user hasn't overridden
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => {
      if (!localStorage.getItem('btc-theme')) setIsDark(e.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    localStorage.setItem('btc-theme', next ? 'dark' : 'light')
    setIsDark(next)
  }

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [currency, setCurrency] = useState('usd')

  useEffect(() => {
    let active = true

    async function run() {
      const result = await loadData()
      if (!active) return
      writeCache(result)
      const cache = readCache() ?? {}
      setData({
        ...result,
        priceGbp: result.priceGbp ?? cache.priceGbp ?? null,
        priceUsd: result.priceUsd ?? cache.priceUsd ?? null,
        fng: result.fng ?? cache.fng ?? null,
        fees: result.fees ?? cache.fees ?? null,
      })
      setLastUpdated(new Date())
      setLoading(false)
    }

    run()
    return () => { active = false }
  }, [])

  const { priceGbp, priceUsd, chartGbp, chartUsd, fees, blockHeight, fng } = data ?? {}

  const price = currency === 'gbp' ? priceGbp : priceUsd
  const chart = currency === 'gbp' ? chartGbp : chartUsd

  const chartPrices = chart?.map(d => d.price) ?? []
  const lo = chartPrices.length ? Math.min(...chartPrices) : 0
  const hi = chartPrices.length ? Math.max(...chartPrices) : 0
  const pad = (hi - lo) * 0.08
  const currencySymbol = currency === 'gbp' ? '£' : '$'
  const ct = getChartTheme(isDark)

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 dark:bg-zinc-950 dark:text-white">
      <div className="mx-auto max-w-4xl">

        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold" style={{ color: BTC_COLOR }}>₿</span>
            <h1 className="text-lg font-semibold">Bitcoin Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                Updated {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>

        {/* Stat cards */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">

          <Card>
            <SectionLabel>BTC / {currency.toUpperCase()}</SectionLabel>
            {loading
              ? <Skeleton className="h-10 w-40" />
              : <p className="text-4xl font-bold tracking-tight">
                  {price != null ? fmtPrice(price, currency) : '—'}
                </p>
            }
          </Card>

          <Card>
            <SectionLabel>Fear &amp; Greed</SectionLabel>
            {loading
              ? <Skeleton className="h-36 w-full" />
              : fng
                ? <FearGreedGauge
                    value={fng.value}
                    classification={fng.value_classification}
                    trackColor={ct.gaugeTrack}
                  />
                : <span className="text-4xl font-bold text-zinc-300 dark:text-zinc-600">—</span>
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
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              7-Day Price
            </p>
            <CurrencyToggle value={currency} onChange={setCurrency} />
          </div>
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
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: ct.tick, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[lo - pad, hi + pad]}
                    tick={{ fill: ct.tick, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${currencySymbol}${Math.round(v / 1000)}k`}
                    width={48}
                  />
                  <Tooltip
                    content={props => (
                      <ChartTooltip
                        {...props}
                        currency={currency}
                        tooltipBg={ct.tooltipBg}
                        tooltipBorder={ct.tooltipBorder}
                        tooltipText={ct.tooltipText}
                        tooltipSub={ct.tooltipSub}
                      />
                    )}
                  />
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
                    <div key={label} className="rounded-lg bg-zinc-100 p-4 text-center dark:bg-zinc-800/60">
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</p>
                      <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-600">{sub}</p>
                      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">sat/vB</p>
                    </div>
                  ))}
                </div>
              )
              : <p className="text-zinc-400 dark:text-zinc-600">—</p>
          }
        </Card>

        <p className="mt-6 text-center text-xs text-zinc-300 dark:text-zinc-700">
          Data: CoinGecko · mempool.space · alternative.me
        </p>

      </div>
    </div>
  )
}
