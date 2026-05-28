import { useState, useEffect, useRef } from 'react'
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import './App.css'
import {
  CURRENCY_META, fmtCurrency, fmtVolume, computeChartChange,
  blocksToNextHalving, epochPercentage, btcDominanceLabel,
} from './utils.js'

const ORANGE = '#fb923c'
const CACHE_KEY = 'btc-cache'
const VOL_HISTORY_KEY = 'btc-vol-history'

const RANGES = [
  { label: '1D', days: 1   },
  { label: '7D', days: 7   },
  { label: '1M', days: 30  },
  { label: '1Y', days: 365 },
]

const FNG_COLOR = {
  'Extreme Fear': 'text-red-400',
  'Fear':         'text-amber-400',
  'Neutral':      'text-yellow-400',
  'Greed':        'text-lime-400',
  'Extreme Greed':'text-green-400',
}

const FNG_DOT_COLOR = {
  'Extreme Fear': '#f87171',
  'Fear':         '#fbbf24',
  'Neutral':      '#facc15',
  'Greed':        '#a3e635',
  'Extreme Greed':'#4ade80',
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
  const [priceRes, feesRes, heightRes, fngRes, diffRes, globalRes, mempoolRes, blocksRes] = await Promise.allSettled([
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,gbp,eur,cad,chf&include_24hr_vol=true&include_24hr_change=true').then(r => r.json()),
    fetch('https://mempool.space/api/v1/fees/recommended').then(r => r.json()),
    fetch('https://mempool.space/api/blocks/tip/height').then(r => r.json()),
    fetch('https://api.alternative.me/fng/').then(r => r.json()),
    fetch('https://mempool.space/api/v1/difficulty-adjustment').then(r => r.json()),
    fetch('https://api.coingecko.com/api/v3/global').then(r => r.json()),
    fetch('https://mempool.space/api/mempool').then(r => r.json()),
    fetch('https://mempool.space/api/v1/blocks').then(r => r.json()),
  ])

  const btc        = priceRes.status  === 'fulfilled' ? (priceRes.value.bitcoin     ?? {}) : {}
  const globalData = globalRes.status === 'fulfilled' ? (globalRes.value?.data      ?? null) : null
  return {
    priceUsd:       btc.usd              ?? null,
    priceGbp:       btc.gbp              ?? null,
    priceEur:       btc.eur              ?? null,
    priceCad:       btc.cad              ?? null,
    priceChf:       btc.chf              ?? null,
    volumeUsd:      btc.usd_24h_vol      ?? null,
    volumeGbp:      btc.gbp_24h_vol      ?? null,
    volumeEur:      btc.eur_24h_vol      ?? null,
    volumeCad:      btc.cad_24h_vol      ?? null,
    volumeChf:      btc.chf_24h_vol      ?? null,
    priceChange24h: btc.usd_24h_change   ?? null,
    fees:           feesRes.status    === 'fulfilled' ? feesRes.value              : null,
    blockHeight:    heightRes.status  === 'fulfilled' ? heightRes.value            : null,
    fng:            fngRes.status     === 'fulfilled' ? (fngRes.value.data?.[0]   ?? null) : null,
    difficulty:     diffRes.status    === 'fulfilled' ? diffRes.value             : null,
    btcDominance:   globalData?.market_cap_percentage?.btc ?? null,
    mempool:        mempoolRes.status  === 'fulfilled' ? mempoolRes.value           : null,
    lastBlockTs:    blocksRes.status   === 'fulfilled' && Array.isArray(blocksRes.value) && blocksRes.value.length > 0
                      ? (blocksRes.value[0].timestamp ?? null)
                      : null,
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
  if (data.difficulty     != null) patch.difficulty     = data.difficulty
  if (data.fees           != null) patch.fees           = data.fees
  if (data.btcDominance   != null) patch.btcDominance   = data.btcDominance
  if (data.mempool        != null) patch.mempool        = data.mempool
  if (data.lastBlockTs    != null) patch.lastBlockTs    = data.lastBlockTs
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ...prev, ...patch }))
}

function readVolumeHistory() {
  try { return JSON.parse(localStorage.getItem(VOL_HISTORY_KEY) || '[]') } catch { return [] }
}

function updateVolumeHistory(volumeUsd) {
  if (volumeUsd == null) return readVolumeHistory()
  const today   = new Date().toISOString().slice(0, 10)
  const history = readVolumeHistory()
  const last    = history[history.length - 1]
  if (last?.date === today) {
    history[history.length - 1] = { date: today, volume: volumeUsd }
  } else {
    history.push({ date: today, volume: volumeUsd })
  }
  const trimmed = history.slice(-7)
  localStorage.setItem(VOL_HISTORY_KEY, JSON.stringify(trimmed))
  return trimmed
}

function computeVol7dAvg(history) {
  if (!history || history.length < 2) return null
  return history.reduce((sum, h) => sum + h.volume, 0) / history.length
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-gray-800 ${className}`} />
}

function FngArc({ score, classification }) {
  const angle    = score != null ? (180 - (score / 100) * 180) * Math.PI / 180 : null
  const dotX     = angle != null ? 60 + 50 * Math.cos(angle) : null
  const dotY     = angle != null ? 60 - 50 * Math.sin(angle) : null
  const dotColor = FNG_DOT_COLOR[classification] ?? ORANGE
  return (
    <svg width="120" height="65" viewBox="0 0 120 65" className="mt-5">
      <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="#1f2937" strokeWidth="5" strokeLinecap="round" />
      {dotX != null && <circle cx={dotX} cy={dotY} r={5} fill={dotColor} />}
    </svg>
  )
}

function DifficultyBar({ change }) {
  const capped = change != null ? Math.max(-10, Math.min(10, change)) : 0
  const pct    = Math.abs(capped) / 10 * 50
  const isPositive = capped >= 0
  return (
    <div className="mt-3">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
        {change != null && (
          <div
            className={`absolute top-0 h-full ${isPositive ? 'left-1/2' : 'right-1/2'} bg-orange-400`}
            style={{ width: `${pct}%` }}
          />
        )}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-px bg-gray-600" />
      </div>
      <div className="mt-1 flex justify-between">
        <span className="text-xs text-gray-700">Slower</span>
        <span className="text-xs text-gray-700">Faster</span>
      </div>
    </div>
  )
}

function diffInterpretation(change) {
  if (change == null) return null
  if (change < -4)  return { text: 'Miners Slowing Fast',   cls: 'text-gray-500' }
  if (change < -1)  return { text: 'Miners Slowing',        cls: 'text-gray-500' }
  if (change <= 1)  return { text: 'Stable',                cls: 'text-gray-500' }
  if (change <= 4)  return { text: 'Miners Speeding Up',    cls: 'text-gray-500' }
  return                   { text: 'Miners Speeding Up Fast', cls: 'text-gray-500' }
}

function NetworkPulseCard({ fng, difficulty, loading }) {
  const fngScore       = fng?.value != null ? parseInt(fng.value, 10) : null
  const fngClass       = fng?.value_classification ?? null
  const diffChange     = difficulty?.difficultyChange ?? null
  const remainingBlocks = difficulty?.remainingBlocks ?? null
  const diffDays       = remainingBlocks != null
    ? Math.round(remainingBlocks * 10 / 60 / 24)
    : null
  const diffInterp     = diffInterpretation(diffChange)
  return (
    <div className="rounded-2xl bg-gray-900 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Network Pulse</p>
      <div className="mt-3 flex gap-4">

        {/* Fear & Greed column */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Fear &amp; Greed</p>
          <div className="mt-2">
            {loading || fngScore == null
              ? <Skeleton className="h-8 w-10" />
              : <p className="text-2xl font-bold text-orange-400">{fngScore}</p>
            }
            <p className={`mt-1 text-sm ${FNG_COLOR[fngClass] ?? 'text-gray-500'}`}>
              {fngClass ?? (loading ? ' ' : '—')}
            </p>
            <FngArc score={loading ? null : fngScore} classification={fngClass} />
          </div>
        </div>

        <div className="w-px self-stretch bg-gray-800" />

        {/* Difficulty column */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Difficulty</p>
          <div className="mt-2">
            {loading
              ? <Skeleton className="h-8 w-16" />
              : diffChange == null
                ? <p className="text-2xl font-bold text-gray-600">—</p>
                : <p className="text-2xl font-bold text-orange-400">
                    {diffChange >= 0 ? '+' : ''}{diffChange.toFixed(1)}%
                  </p>
            }
            <p className={`mt-1 text-sm ${diffInterp ? diffInterp.cls : 'text-gray-500'}`}>
              {loading ? ' ' : diffInterp ? diffInterp.text : (diffChange == null ? 'Unavailable' : ' ')}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {loading
                ? ' '
                : remainingBlocks != null
                  ? `in ${remainingBlocks.toLocaleString('en-US')} blocks (~${diffDays}d)`
                  : ' '
              }
            </p>
            <DifficultyBar change={loading ? null : diffChange} />
          </div>
        </div>

      </div>
    </div>
  )
}

export function BtcPriceCard({ value, change, sub }) {
  const changePositive = change != null && change >= 0
  return (
    <div className="rounded-2xl bg-gray-900 p-6 h-full">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">BTC Price</p>
      {/* Mobile: price left, change+sub right on same row. Desktop: stacked. */}
      <div className="mt-3 md:mt-[30px] flex items-center justify-between md:block">
        <div>
          {value == null
            ? <Skeleton className="h-9 w-32" />
            : <p className="text-2xl font-bold text-orange-400 md:text-3xl">{value}</p>
          }
          {/* Desktop-only stacked change */}
          {change != null && value != null && (
            <p className={`hidden md:block mt-1.5 text-sm font-medium ${changePositive ? 'text-green-400' : 'text-red-400'}`}>
              {changePositive ? '▲' : '▼'}&nbsp;{changePositive ? '+' : ''}{change.toFixed(2)}%
            </p>
          )}
          {/* Desktop-only stacked sub */}
          {sub && value != null && (
            <p className="hidden md:block mt-1.5 text-sm text-gray-400">{sub}</p>
          )}
        </div>
        {/* Mobile-only: change + sub on right, vertically centred via parent items-center */}
        {change != null && value != null && (
          <div className="md:hidden text-right shrink-0 ml-3">
            <p className={`text-sm font-medium ${changePositive ? 'text-green-400' : 'text-red-400'}`}>
              {changePositive ? '▲' : '▼'}&nbsp;{changePositive ? '+' : ''}{change.toFixed(2)}%
            </p>
            {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

function HalvingCountdown({ blockHeight }) {
  const [secsLeft, setSecsLeft] = useState(null)

  useEffect(() => {
    if (blockHeight == null) return
    setSecsLeft(Math.max(0, blocksToNextHalving(blockHeight)) * 10 * 60)
  }, [blockHeight])

  useEffect(() => {
    const id = setInterval(() => {
      setSecsLeft(prev => prev != null ? Math.max(0, prev - 1) : prev)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const blocksRemaining = blockHeight != null ? Math.max(0, blocksToNextHalving(blockHeight)) : null
  const epochPct        = blockHeight != null ? epochPercentage(blockHeight) : null
  const days  = secsLeft != null ? Math.floor(secsLeft / 86400) : null
  const hours = secsLeft != null ? Math.floor((secsLeft % 86400) / 3600) : null
  const mins  = secsLeft != null ? Math.floor((secsLeft % 3600) / 60) : null
  const estStr = secsLeft != null
    ? new Date(Date.now() + secsLeft * 1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null

  return (
    <div className="rounded-2xl bg-gray-900 p-6 mb-4">
      <div className="flex flex-col gap-6 md:flex-row md:gap-0">

        {/* Blocks remaining */}
        <div className="flex-1 md:pr-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Blocks to Halving</p>
          {blocksRemaining != null
            ? <p className="mt-2 text-3xl font-bold text-orange-400 md:text-5xl tabular-nums">
                {blocksRemaining.toLocaleString('en-US')}
              </p>
            : <Skeleton className="mt-2 h-10 w-32" />
          }
        </div>

        <div className="hidden md:block w-px self-stretch bg-gray-800" />

        {/* Time remaining */}
        <div className="flex-1 md:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Estimated Time</p>
          {secsLeft != null
            ? (
              <>
                <p className="mt-2 text-3xl font-bold text-white md:text-5xl tabular-nums">
                  {days}d {hours}h {mins}m
                </p>
                {estStr && (
                  <p className="mt-1.5 text-sm text-gray-500">est. {estStr}</p>
                )}
              </>
            )
            : <Skeleton className="mt-2 h-10 w-48" />
          }
        </div>

        <div className="hidden md:block w-px self-stretch bg-gray-800" />

        {/* Epoch progress */}
        <div className="flex-1 md:pl-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Epoch Progress</p>
          {epochPct != null
            ? (
              <div className="mt-3">
                <div className="h-3 w-full overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-full rounded-full bg-orange-400"
                    style={{ width: `${epochPct}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  <span className="font-semibold text-white">{epochPct.toFixed(1)}%</span>
                  <span className="ml-1 text-gray-500">of current epoch complete</span>
                </p>
              </div>
            )
            : <Skeleton className="mt-3 h-3 w-full" />
          }
        </div>

      </div>
    </div>
  )
}

function blockTimeColors(mins) {
  if (mins == null || (mins >= 9 && mins <= 11)) return { text: 'text-orange-400', bg: 'bg-orange-400' }
  if (mins < 9) return { text: 'text-green-400', bg: 'bg-green-400' }
  return              { text: 'text-red-400',    bg: 'bg-red-400'   }
}

function NetworkHeartbeatCard({ blockHeight, difficulty, lastBlockTs, loading }) {
  const avgBlockMins = difficulty?.timeAvg != null ? difficulty.timeAvg / 60000 : null
  const colors = blockTimeColors(avgBlockMins)
  const lastBlockMinsAgo = lastBlockTs != null
    ? Math.max(0, Math.floor((Date.now() / 1000 - lastBlockTs) / 60))
    : null

  return (
    <div className="rounded-2xl bg-gray-900 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Network Heartbeat</p>

      {/* Two-column interior */}
      <div className="mt-3 flex gap-3">

        {/* Block height */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Block Height</p>
          <div className="mt-1">
            {loading || blockHeight == null
              ? <Skeleton className="h-7 w-16" />
              : <p className="text-sm font-bold text-orange-400 tabular-nums md:text-2xl">
                  {blockHeight.toLocaleString('en-US')}
                </p>
            }
          </div>
        </div>

        {/* Avg block time */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Avg Block Time</p>
          <div className="mt-1">
            {loading || avgBlockMins == null
              ? <Skeleton className="h-7 w-12" />
              : <p className={`text-sm font-bold tabular-nums md:text-2xl ${colors.text}`}>
                  {avgBlockMins.toFixed(1)} min
                </p>
            }
          </div>
        </div>

      </div>

      {/* Last block line with breathing dot */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {!loading && (
          <span key={blockHeight ?? 'init'} className="relative inline-flex h-2 w-2 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${colors.bg}`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${colors.bg}`} />
          </span>
        )}
        <p className="text-xs text-gray-500">
          {lastBlockMinsAgo != null
            ? `Last block: ${lastBlockMinsAgo} min ago`
            : 'Last block: unknown'
          }
        </p>
      </div>
    </div>
  )
}

function VolumeCard({ volumeUsd, volume, currency, btcDominance, volHistory }) {
  const vol7dAvg = computeVol7dAvg(volHistory)
  const volVs7d  = vol7dAvg != null && volumeUsd != null
    ? ((volumeUsd - vol7dAvg) / vol7dAvg) * 100
    : null
  const domLabel = btcDominanceLabel(btcDominance)
  return (
    <div className="rounded-2xl bg-gray-900 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">24h Volume</p>
      <div className="mt-3">
        {volume == null
          ? <Skeleton className="h-9 w-32" />
          : <p className="text-2xl font-bold text-orange-400 md:text-3xl">{fmtVolume(volume, currency)}</p>
        }
        {volume != null && (
          <>
            {/* Line 1: vol vs 7d avg — desktop only, skipped when history is insufficient */}
            {volVs7d != null && (
              <p className={`hidden md:block mt-1.5 text-xs ${volVs7d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {volVs7d >= 0 ? '+' : ''}{Math.abs(volVs7d).toFixed(0)}%&nbsp;{volVs7d >= 0 ? 'above' : 'below'} 7d avg
              </p>
            )}
            {/* Line 2: BTC dominance — always visible (the mobile-visible line) */}
            {btcDominance != null && (
              <p className="mt-1.5 text-xs text-gray-400">
                BTC dominance {btcDominance.toFixed(1)}%
              </p>
            )}
            {/* Line 3: season interpretation — desktop only */}
            {domLabel && (
              <p className={`hidden md:block mt-0.5 text-xs ${domLabel.cls}`}>
                {domLabel.text}
              </p>
            )}
          </>
        )}
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


function mempoolCongestion(vsize) {
  if (vsize == null) return null
  if (vsize < 5_000_000)  return { label: 'Low',      cls: 'text-green-400',  bar: 'bg-green-400'  }
  if (vsize <= 50_000_000) return { label: 'Moderate', cls: 'text-orange-400', bar: 'bg-orange-400' }
  return                           { label: 'High',     cls: 'text-red-400',    bar: 'bg-red-400'    }
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
  const [volHistory, setVolHistory]   = useState(() => readVolumeHistory())
  const chartCache   = useRef(new Map())
  const wsRef        = useRef(null)
  const reconnectRef = useRef(null)

  // Load KPI data on mount
  useEffect(() => {
    let active = true
    async function run() {
      const result = await loadData()
      if (!active) return
      writeCache(result)
      const history = updateVolumeHistory(result.volumeUsd)
      setVolHistory(history)
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
        difficulty:     result.difficulty     ?? cache.difficulty     ?? null,
        fees:           result.fees           ?? cache.fees           ?? null,
        btcDominance:   result.btcDominance   ?? cache.btcDominance   ?? null,
        mempool:        result.mempool        ?? cache.mempool        ?? null,
        lastBlockTs:    result.lastBlockTs    ?? cache.lastBlockTs    ?? null,
      })
      setLastUpdated(new Date())
      setLoading(false)
    }
    run()
    return () => { active = false }
  }, [])

  // 60-second refresh cycle for KPI data (prices handled by WebSocket)
  useEffect(() => {
    const id = setInterval(async () => {
      const result = await loadData()
      writeCache(result)
      const history = updateVolumeHistory(result.volumeUsd)
      setVolHistory(history)
      setData(prev => {
        if (!prev) return prev
        const patch = {}
        if (result.fng           != null) patch.fng           = result.fng
        if (result.difficulty    != null) patch.difficulty    = result.difficulty
        if (result.fees          != null) patch.fees          = result.fees
        if (result.blockHeight   != null) patch.blockHeight   = result.blockHeight
        if (result.priceChange24h != null) patch.priceChange24h = result.priceChange24h
        if (result.btcDominance  != null) patch.btcDominance  = result.btcDominance
        if (result.mempool       != null) patch.mempool       = result.mempool
        if (result.lastBlockTs   != null) patch.lastBlockTs   = result.lastBlockTs
        return { ...prev, ...patch }
      })
      setLastUpdated(new Date())
    }, 60000)
    return () => clearInterval(id)
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
          priceChange24h, fees, blockHeight, fng, difficulty, btcDominance, mempool, lastBlockTs } = data ?? {}
  const price  = { usd: priceUsd,  gbp: priceGbp,  eur: priceEur,  cad: priceCad,  chf: priceChf  }[currency] ?? null
  const volume = { usd: volumeUsd, gbp: volumeGbp, eur: volumeEur, cad: volumeCad, chf: volumeChf }[currency] ?? null

  const chartPrices = chart?.map(d => d.price) ?? []
  const lo  = chartPrices.length ? Math.min(...chartPrices) : 0
  const hi  = chartPrices.length ? Math.max(...chartPrices) : 0
  const pad = (hi - lo) * 0.08

  const xInterval   = chart?.length ? Math.max(0, Math.floor(chart.length / 7) - 1) : 0
  const currencySym = CURRENCY_META[currency]?.sym ?? '$'

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-8 text-white">

      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-3xl">Bitcoin Vibe Check</h1>
          <p className="mt-0.5 text-xs text-gray-500">Read the room.</p>
        </div>
        <div className="flex items-center gap-4">
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
        {/* BTC Price: full-width on mobile, one col on desktop */}
        <div className="col-span-2 md:col-span-1">
          <BtcPriceCard
            value={price != null ? fmtCurrency(price, currency) : null}
            change={priceChange24h}
            sub={priceChange24h != null ? '24h change' : null}
          />
        </div>
        {/* Network Pulse: full-width on mobile, one col on desktop */}
        <div className="col-span-2 md:col-span-1">
          <NetworkPulseCard fng={fng} difficulty={difficulty} loading={loading} />
        </div>
        <NetworkHeartbeatCard
          blockHeight={blockHeight}
          difficulty={difficulty}
          lastBlockTs={lastBlockTs}
          loading={loading}
        />
        <VolumeCard
          volumeUsd={volumeUsd}
          volume={volume}
          currency={currency}
          btcDominance={btcDominance}
          volHistory={volHistory}
        />
      </div>

      {/* Halving countdown */}
      <HalvingCountdown blockHeight={blockHeight} />

      {/* Chart + Fees */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

        {/* Price chart */}
        <div className="rounded-2xl bg-gray-900 p-6 md:col-span-2">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Price · {currency.toUpperCase()}
              </p>
              {chartChange != null && !chartLoading && (
                <span
                  data-testid="chart-range-change"
                  className={`text-xs font-semibold ${chartChange >= 0 ? 'text-green-400' : 'text-red-400'}`}
                >
                  {chartChange >= 0 ? '▲' : '▼'}&nbsp;{chartChange >= 0 ? '+' : ''}{chartChange.toFixed(2)}%
                </span>
              )}
            </div>
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
                    {chartPrices.length > 0 && (
                      <>
                        <ReferenceLine
                          yAxisId="price"
                          y={hi}
                          stroke="#4ade80"
                          strokeDasharray="3 3"
                          strokeWidth={1}
                          label={{ value: `H: ${currencySym}${Math.round(hi).toLocaleString('en-US')}`, position: 'insideTopRight', fill: '#4ade80', fontSize: 10 }}
                        />
                        <ReferenceLine
                          yAxisId="price"
                          y={lo}
                          stroke="#f87171"
                          strokeDasharray="3 3"
                          strokeWidth={1}
                          label={{ value: `L: ${currencySym}${Math.round(lo).toLocaleString('en-US')}`, position: 'insideBottomRight', fill: '#f87171', fontSize: 10 }}
                        />
                      </>
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )
          }
        </div>

        {/* Mempool + Network fees */}
        <div className="rounded-2xl bg-gray-900 p-4 md:p-6 flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Network Fees</p>

          {/* Congestion indicator — hidden gracefully if mempool fetch failed */}
          {mempool != null && (() => {
            const cg = mempoolCongestion(mempool.vsize)
            const pct = Math.min(100, (mempool.vsize / 100_000_000) * 100)
            return (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Mempool Congestion</p>
                  <span className={`text-xs font-semibold ${cg.cls}`}>{cg.label}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                  <div className={`h-full rounded-full ${cg.bar}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  {mempool.count.toLocaleString('en-US')} unconfirmed transactions
                </p>
              </div>
            )
          })()}

          {/* Fee tiers */}
          <div className="grid grid-cols-3 gap-2">
            {loading || !fees
              ? [0, 1, 2].map(i => <Skeleton key={i} className="h-20" />)
              : [
                  { label: 'Slow',   time: '~1 hour',  value: fees.hourFee     },
                  { label: 'Medium', time: '~30 min',  value: fees.halfHourFee },
                  { label: 'Fast',   time: '~10 min',  value: fees.fastestFee  },
                ].map(({ label, time, value }) => (
                  <div key={label} className="flex flex-col justify-center rounded-xl bg-gray-800 px-2 py-3 md:px-3 md:py-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</p>
                    <div className="mt-1.5 flex items-baseline gap-0.5 md:gap-1">
                      <span className="text-lg font-bold text-orange-400 md:text-2xl">{value}</span>
                      <span className="text-xs text-gray-500">sat/vB</span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-600">{time}</p>
                  </div>
                ))
            }
          </div>
        </div>

      </div>

    </div>
  )
}
