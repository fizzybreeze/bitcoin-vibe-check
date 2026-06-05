import { useState, useEffect, useRef } from 'react'
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
  LineChart, Line,
} from 'recharts'
import './App.css'
import BeehiivEmbed from './components/BeehiivEmbed.jsx'
import { supabase } from './lib/supabase.js'
import {
  CURRENCY_META, fmtCurrency, fmtVolume, computeChartChange,
  blocksToNextHalving, epochPercentage, btcDominanceLabel,
} from './utils.js'

const ORANGE = '#fb923c'
const CACHE_KEY = 'btc-cache'
const VOL_HISTORY_KEY = 'btc-vol-history'
const SOUND_KEY = 'btc-vibe-sound-enabled'

const RANGES = [
  { label: '1D', days: 1   },
  { label: '7D', days: 7   },
  { label: '1M', days: 30  },
  { label: '1Y', days: 365 },
]

const QUOTES = [
  { text: "If you don't believe it or don't get it, I don't have the time to try to convince you, sorry.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "The root problem with conventional currency is all the trust that's required to make it work.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "It might make sense just to get some in case it catches on.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "Lost coins only make everyone else's coins worth slightly more. Think of it as a donation to everyone.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "Writing a description for this thing for general audiences is bloody hard. There's nothing to relate it to.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "In a few decades when the reward gets too small, the transaction fee will become the main compensation for nodes.", attribution: 'Satoshi Nakamoto, Bitcoin Whitepaper' },
  { text: "The nature of Bitcoin is such that once version 0.1 was released, the core design was set in stone for the rest of its lifetime.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "Governments are good at cutting off the heads of centrally controlled networks like Napster, but pure P2P networks like Gnutella and Tor seem to be holding their own.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
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

const CG_KEY = import.meta.env.VITE_COINGECKO_API_KEY
function cgFetch(url, init) {
  return fetch(url, CG_KEY
    ? { ...init, headers: { 'x-cg-demo-api-key': CG_KEY, ...init?.headers } }
    : init
  )
}

async function loadData() {
  const [priceRes, feesRes, heightRes, fngRes, diffRes, globalRes, mempoolRes, blocksRes, lightningRes, marketsRes] = await Promise.allSettled([
    cgFetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,gbp,eur,cad,chf&include_24hr_vol=true&include_24hr_change=true&include_market_cap=true').then(r => r.json()),
    fetch('https://mempool.space/api/v1/fees/recommended').then(r => r.json()),
    fetch('https://mempool.space/api/blocks/tip/height').then(r => r.json()),
    fetch('https://api.alternative.me/fng/?limit=30').then(r => r.json()),
    fetch('https://mempool.space/api/v1/difficulty-adjustment').then(r => r.json()),
    cgFetch('https://api.coingecko.com/api/v3/global').then(r => r.json()),
    fetch('https://mempool.space/api/mempool').then(r => r.json()),
    fetch('https://mempool.space/api/v1/blocks').then(r => r.json()),
    fetch('https://mempool.space/api/v1/lightning/statistics/latest').then(r => r.json()),
    cgFetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin').then(r => r.json()),
  ])

  const btc        = priceRes.status   === 'fulfilled' ? (priceRes.value.bitcoin     ?? {}) : {}
  const globalData = globalRes.status  === 'fulfilled' ? (globalRes.value?.data      ?? null) : null
  const marketsData = marketsRes.status === 'fulfilled' && Array.isArray(marketsRes.value) ? (marketsRes.value[0] ?? null) : null
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
    marketCapUsd:   btc.usd_market_cap   ?? null,
    fees:           feesRes.status    === 'fulfilled' ? feesRes.value              : null,
    blockHeight:    heightRes.status  === 'fulfilled' ? heightRes.value            : null,
    fng:            fngRes.status     === 'fulfilled' ? (fngRes.value.data?.[0]   ?? null) : null,
    fngHistory:     fngRes.status     === 'fulfilled' && Array.isArray(fngRes.value.data) && fngRes.value.data.length
                      ? [...fngRes.value.data].reverse().map(d => ({ v: parseInt(d.value, 10) }))
                      : null,
    difficulty:     diffRes.status    === 'fulfilled' ? diffRes.value             : null,
    btcDominance:   globalData?.market_cap_percentage?.btc ?? null,
    mempool:        mempoolRes.status  === 'fulfilled' ? mempoolRes.value           : null,
    lastBlockTs:    blocksRes.status    === 'fulfilled' && Array.isArray(blocksRes.value) && blocksRes.value.length > 0
                      ? (blocksRes.value[0].timestamp ?? null)
                      : null,
    lightning:      lightningRes.status === 'fulfilled' ? lightningRes.value : null,
    athUsd:         marketsData?.ath ?? null,
  }
}

async function fetchChart(days) {
  const res = await cgFetch(
    `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}`
  )
  if (!res.ok) throw Object.assign(new Error('chart fetch failed'), { status: res.status })
  const json = await res.json()
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
  if (data.marketCapUsd   != null) patch.marketCapUsd   = data.marketCapUsd
  if (data.fng            != null) patch.fng            = data.fng
  if (data.fngHistory     != null) patch.fngHistory     = data.fngHistory
  if (data.difficulty     != null) patch.difficulty     = data.difficulty
  if (data.fees           != null) patch.fees           = data.fees
  if (data.btcDominance   != null) patch.btcDominance   = data.btcDominance
  if (data.mempool        != null) patch.mempool        = data.mempool
  if (data.lastBlockTs    != null) patch.lastBlockTs    = data.lastBlockTs
  if (data.lightning      != null) patch.lightning      = data.lightning
  if (data.athUsd         != null) patch.athUsd         = data.athUsd
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

function playBlockThud(ctx) {
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(80, now)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.4, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
  osc.start(now)
  osc.stop(now + 0.3)
}

function playPriceTick(ctx, up) {
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(up ? 880 : 440, now)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.15, now + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
  osc.start(now)
  osc.stop(now + 0.08)
}

function NetworkPulseCard({ fng, fngHistory, difficulty, loading }) {
  const fngScore       = fng?.value != null ? parseInt(fng.value, 10) : null
  const fngClass       = fng?.value_classification ?? null
  const diffChange     = difficulty?.difficultyChange ?? null
  const remainingBlocks = difficulty?.remainingBlocks ?? null
  const diffDays       = remainingBlocks != null
    ? Math.round(remainingBlocks * 10 / 60 / 24)
    : null
  const diffInterp     = diffInterpretation(diffChange)

  const [hashRate, setHashRate] = useState(null)
  useEffect(() => {
    fetch('https://mempool.space/api/v1/mining/hashrate/3d')
      .then(r => r.json())
      .then(json => {
        if (json?.currentHashrate != null) {
          setHashRate((json.currentHashrate / 1e18).toFixed(1))
        }
      })
      .catch(() => {})
  }, [])

  const [hashRateTrend, setHashRateTrend] = useState(null)
  useEffect(() => {
    fetch('https://mempool.space/api/v1/mining/hashrate/1m')
      .then(r => r.json())
      .then(json => {
        const rates = json?.hashrates
        if (Array.isArray(rates) && rates.length >= 2) {
          const first = rates[0].avgHashrate
          const last  = rates[rates.length - 1].avgHashrate
          if (first > 0) {
            setHashRateTrend(((last - first) / first) * 100)
          }
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div className="rounded-2xl bg-gray-900 p-6 h-full">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Network Pulse</p>

      {/* Row 1: Fear & Greed | Difficulty */}
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Fear &amp; Greed</p>
          <div className="mt-2">
            {loading || fngScore == null
              ? <Skeleton className="h-8 w-10" />
              : <p className="text-2xl font-bold text-orange-400">{fngScore}</p>
            }
            <p className={`mt-1 text-sm ${FNG_COLOR[fngClass] ?? 'text-gray-500'}`}>
              {fngClass ?? (loading ? ' ' : '—')}
            </p>
          </div>
        </div>
        <div className="min-w-0">
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
          </div>
        </div>
      </div>

      {/* Row 2: Hash Rate | (empty) */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Hash Rate</p>
          <div className="mt-2">
            {hashRate != null
              ? <p className="text-2xl font-bold text-orange-400">{hashRate} <span className="text-base font-semibold">EH/s</span></p>
              : <Skeleton className="h-8 w-20" />
            }
            {hashRate != null && hashRateTrend != null && (
              <p className={`mt-1 text-xs font-medium ${hashRateTrend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {hashRateTrend >= 0 ? '▲' : '▼'}&nbsp;{hashRateTrend >= 0 ? '+' : ''}{hashRateTrend.toFixed(1)}% (30d)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mt-4 border-t border-gray-700" />

      {/* Row 3: Adjustment bar (full width) */}
      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Difficulty Adjustment</p>
        <DifficultyBar change={loading ? null : diffChange} />
      </div>

      {/* Row 4: F&G sparkline (full width) */}
      {fngHistory && (
        <div className="mt-3">
          <div className="h-20">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fngHistory} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
                <Line type="monotone" dataKey="v" stroke="#f97316" dot={false} activeDot={false} strokeWidth={1.5} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-gray-600">SENTIMENT TREND (30D)</p>
        </div>
      )}
    </div>
  )
}

export function BtcPriceCard({ value, change, sub, athPct }) {
  const changePositive = change != null && change >= 0
  const isAtATH = athPct != null && athPct >= -0.1
  return (
    <div className="rounded-2xl bg-gray-900 p-6 h-full">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">BTC Price</p>
      {/* Mobile: price left, change+sub right on same row. Desktop: stacked. */}
      <div className="mt-3 md:mt-[30px] flex items-start justify-between md:block">
        <div>
          {value == null
            ? <Skeleton className="h-9 w-32" />
            : <p className="text-2xl font-bold text-orange-400 md:text-3xl">{value}</p>
          }
          {/* ATH distance — left column, all breakpoints */}
          {athPct != null && value != null && (
            isAtATH
              ? <p className="mt-1 text-xs font-medium text-green-400 md:mt-1.5 md:text-sm">AT ATH</p>
              : <p className="mt-1 text-xs text-gray-500 md:mt-1.5 md:text-sm">{athPct.toFixed(1)}% from ATH</p>
          )}
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
        {/* Mobile-only: change + sub on right */}
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

function RecentBlocksCard({ blockHeight, difficulty, lastBlockTs, loading }) {
  const [blocks, setBlocks] = useState(null)
  const [now, setNow]       = useState(Date.now())

  // Fetch on mount and immediately when a new block is detected
  useEffect(() => {
    const controller = new AbortController()
    fetch('https://mempool.space/api/v1/blocks', { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { if (Array.isArray(data)) setBlocks(data.slice(0, 5)) })
      .catch(() => {})
    return () => controller.abort()
  }, [blockHeight])

  // 60-second background poll
  useEffect(() => {
    const id = setInterval(() => {
      fetch('https://mempool.space/api/v1/blocks')
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => { if (Array.isArray(data)) setBlocks(data.slice(0, 5)) })
        .catch(() => {})
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  // Live timestamps — tick every second, no re-fetch needed
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  function timeAgo(ts) {
    const secs = Math.floor(now / 1000 - ts)
    if (secs < 60)  return `${secs}s ago`
    const mins = Math.floor(secs / 60)
    if (mins < 60)  return `${mins} min ago`
    return `${Math.floor(mins / 60)}h ago`
  }

  const avgBlockMins = difficulty?.timeAvg != null ? difficulty.timeAvg / 60000 : null
  const colors = blockTimeColors(avgBlockMins)
  const lastBlockMinsAgo = lastBlockTs != null
    ? Math.max(0, Math.floor((Date.now() / 1000 - lastBlockTs) / 60))
    : null

  return (
    <div className="rounded-2xl bg-gray-900 p-6 h-full">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Recent Blocks</p>

      {/* Heartbeat header — desktop only, merged above the block list */}
      <div className="hidden lg:block">
        <div className="mt-3 flex gap-3">
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
        <div className="mt-3 border-t border-gray-700" />
      </div>

      {blocks == null ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : (
        <div className="mt-3">
          {blocks.map((block, i) => (
            <div key={block.id}>
              {i > 0 && <div className="border-t border-gray-700" />}
              <div className="flex items-start justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <a
                    href={`https://mempool.space/block/${block.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base font-bold text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    {block.height.toLocaleString('en-US')}
                  </a>
                  <p className="mt-0.5 text-xs text-gray-600 flex flex-wrap items-center gap-x-1">
                    <span>{block.tx_count.toLocaleString('en-US')} txs</span>
                    <span className="text-gray-700">·</span>
                    <span>
                      {block.extras?.totalFees != null
                        ? `${(block.extras.totalFees / 1e8).toFixed(3)} BTC in fees`
                        : '—'}
                    </span>
                    {block.extras?.avgFeeRate > 0 && (
                      <>
                        <span className="text-gray-700">·</span>
                        <span>avg {block.extras.avgFeeRate} sat/vB</span>
                      </>
                    )}
                  </p>
                </div>
                <p className="text-xs text-gray-600 shrink-0 pt-0.5">{timeAgo(block.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
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

  const epochBarContent = epochPct != null ? (
    <>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
        <div className="h-full rounded-full bg-orange-400" style={{ width: `${epochPct}%` }} />
      </div>
      <p className="mt-1 text-xs text-gray-400">
        <span className="font-semibold text-white">{epochPct.toFixed(1)}%</span>
        <span className="ml-1 text-gray-500">of current epoch complete</span>
      </p>
    </>
  ) : <Skeleton className="h-2 w-full" />

  return (
    <div className="rounded-2xl bg-gray-900 p-4 mb-4">

      {/* Mobile: two columns top row + epoch bar below */}
      <div className="flex md:hidden flex-col gap-2">
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Blocks to Halving</p>
            {blocksRemaining != null
              ? <p className="mt-1 text-xl font-bold text-orange-400 tabular-nums">
                  {blocksRemaining.toLocaleString('en-US')}
                </p>
              : <Skeleton className="mt-1 h-7 w-20" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Estimated Time</p>
            {secsLeft != null
              ? <>
                  <p className="mt-1 text-xl font-bold text-white tabular-nums">
                    {days}d {hours}h {mins}m
                  </p>
                  {estStr && <p className="text-xs text-gray-500">est. {estStr}</p>}
                </>
              : <Skeleton className="mt-1 h-7 w-28" />
            }
          </div>
        </div>
        <div>{epochBarContent}</div>
      </div>

      {/* Desktop: three columns side by side */}
      <div className="hidden md:flex gap-0">

        <div className="flex-1 pr-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Blocks to Halving</p>
          {blocksRemaining != null
            ? <p className="mt-1.5 text-2xl font-bold text-orange-400 tabular-nums">
                {blocksRemaining.toLocaleString('en-US')}
              </p>
            : <Skeleton className="mt-1.5 h-8 w-28" />
          }
        </div>

        <div className="w-px self-stretch bg-gray-800" />

        <div className="flex-1 px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Estimated Time</p>
          {secsLeft != null
            ? <>
                <p className="mt-1.5 text-2xl font-bold text-white tabular-nums">
                  {days}d {hours}h {mins}m
                </p>
                {estStr && <p className="mt-1 text-sm text-gray-500">est. {estStr}</p>}
              </>
            : <Skeleton className="mt-1.5 h-8 w-40" />
          }
        </div>

        <div className="w-px self-stretch bg-gray-800" />

        <div className="flex-1 pl-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Epoch Progress</p>
          <div className="mt-2">{epochBarContent}</div>
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
    <div className="rounded-2xl bg-gray-900 p-6 h-full">
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

function VolumeCard({ volumeUsd, volume, currency, btcDominance, volHistory, marketCapUsd, price, mempool }) {
  const vol7dAvg = computeVol7dAvg(volHistory)
  const volVs7d  = vol7dAvg != null && volumeUsd != null
    ? ((volumeUsd - vol7dAvg) / vol7dAvg) * 100
    : null
  const domLabel = btcDominanceLabel(btcDominance)
  return (
    <div className="rounded-2xl bg-gray-900 p-6 h-full">
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
            {/* Line 4: market cap — desktop only */}
            {marketCapUsd != null && (
              <p className="hidden md:block mt-0.5 text-xs text-gray-500">
                Mkt cap {fmtVolume(marketCapUsd, 'usd')}
              </p>
            )}
            {/* Sats per fiat */}
            {price != null && (
              <>
                <div className="mt-3 border-t border-gray-700" />
                <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-gray-500">Sats per fiat</p>
                <p className="mt-1 text-lg font-bold text-white">
                  {Math.round(1e8 / price).toLocaleString('en-GB')}&nbsp;sats per {CURRENCY_META[currency]?.sym ?? '$'}1
                </p>
              </>
            )}
            {/* Mempool pressure — desktop only */}
            {mempool?.count != null && (() => {
              const pct = Math.min(100, (mempool.count / 200_000) * 100)
              const [label, colour] = pct <= 33
                ? ['Low',      'text-green-400']
                : pct <= 66
                ? ['Moderate', 'text-orange-400']
                : ['High',     'text-red-400']
              const fill = pct <= 33 ? 'bg-green-400' : pct <= 66 ? 'bg-orange-400' : 'bg-red-400'
              return (
                <div className="hidden lg:block mt-4">
                  <div className="mt-3 border-t border-gray-700 mb-3" />
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Mempool pressure</p>
                    <p className={`text-xs font-semibold ${colour}`}>{label}</p>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full animate-pulse ${fill}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })()}
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


function NewsletterCard() {
  return (
    <div className="rounded-2xl bg-gray-900 p-6 mt-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Satoshi's Weekly Brief</p>
      <p className="mt-3 text-lg font-bold text-white">Bitcoin's mood, money, and mempool. Once a week. Free.</p>
      <p className="mt-1 text-xs text-gray-500">Join the newsletter. Unsubscribe any time.</p>
      <div className="mt-4">
        <BeehiivEmbed />
      </div>
    </div>
  )
}

function NewsletterModal() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('btc-vibe-newsletter-prompted')) return
    const id = setTimeout(() => setShow(true), 5000)
    return () => clearTimeout(id)
  }, [])

  function dismiss() {
    localStorage.setItem('btc-vibe-newsletter-prompted', 'true')
    setShow(false)
  }

  useEffect(() => {
    let timerId
    function handleSubscribe() {
      timerId = setTimeout(dismiss, 2500)
    }
    window.addEventListener('beehiiv:subscribe', handleSubscribe)
    return () => {
      window.removeEventListener('beehiiv:subscribe', handleSubscribe)
      clearTimeout(timerId)
    }
  }, [])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-[480px] rounded-2xl bg-gray-900 border border-orange-500/30 p-6">
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-4 right-4 text-sm text-gray-500 hover:text-gray-300"
        >
          ✕
        </button>
        <h2 className="text-2xl font-bold text-white">Satoshi's Weekly Brief</h2>
        <p className="mt-2 text-sm text-gray-400">Bitcoin's mood, money, and mempool. Once a week. Free.</p>
        <div className="mt-4">
          <BeehiivEmbed />
        </div>
        <button
          onClick={dismiss}
          className="mt-4 text-xs text-gray-500 underline hover:text-gray-400"
        >
          No thanks, I'll stick to the dashboard
        </button>
      </div>
    </div>
  )
}

const GENESIS_HASH = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'

function SatoshiQuote() {
  const timeoutRef        = useRef(null)
  const genesisTimeoutRef = useRef(null)
  const incrementRef      = useRef(0)
  const [index, setIndex]           = useState(() => Math.floor(Math.random() * QUOTES.length))
  const [visible, setVisible]       = useState(true)
  const [showGenesis, setShowGenesis] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      timeoutRef.current = setTimeout(() => {
        incrementRef.current += 1
        setIndex(i => (i + 1) % QUOTES.length)
        setVisible(true)
        if (incrementRef.current % QUOTES.length === 0) {
          setShowGenesis(true)
          genesisTimeoutRef.current = setTimeout(() => setShowGenesis(false), 12000)
        }
      }, 500)
    }, 12000)
    return () => {
      clearInterval(id)
      clearTimeout(timeoutRef.current)
      clearTimeout(genesisTimeoutRef.current)
    }
  }, [])

  const quote = QUOTES[index]
  return (
    <footer className="py-10 text-center">
      <div className={`transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-sm italic text-white">"{quote.text}"</p>
        <p className="mt-2 text-xs text-orange-400">— {quote.attribution}</p>
        {showGenesis && (
          <a
            href="https://bitcoin.org/bitcoin.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block font-mono text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            {GENESIS_HASH}
          </a>
        )}
      </div>
    </footer>
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

function SupporterTickerCard({ donors }) {
  const content = donors.length
    ? `Proudly supported by Bitcoiners: ${donors.map(d => `⚡ ${d.name}`).join(' ')} ⚡   `
    : null
  return (
    <div className="hidden md:block rounded-2xl bg-gray-900 p-4 mt-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">Supporters ⚡</p>
      {content ? (
        <div className="relative w-full overflow-hidden">
          <span
            className="inline-block whitespace-nowrap font-mono text-xs text-orange-400 py-1"
            style={{ animation: 'ticker-scroll 30s linear infinite', willChange: 'transform' }}
            onMouseEnter={e => { e.currentTarget.style.animationPlayState = 'paused' }}
            onMouseLeave={e => { e.currentTarget.style.animationPlayState = 'running' }}
          >
            {content}{content}
          </span>
        </div>
      ) : (
        <p className="font-mono text-xs text-gray-600 py-1">Be the first to support Bitcoin Vibe Check ⚡</p>
      )}
    </div>
  )
}

function MobileSupportersCard({ donors }) {
  return (
    <div className="md:hidden rounded-2xl bg-gray-900 p-4 mt-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 text-center">OUR SUPPORTERS ⚡</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {donors.length > 0
          ? donors.map(d => (
              <span key={d.id} className="font-mono text-xs text-orange-400 bg-gray-800 rounded-full px-3 py-1">
                {d.name}
              </span>
            ))
          : <p className="text-xs text-gray-600">Be the first to support Bitcoin Vibe Check ⚡</p>
        }
      </div>
    </div>
  )
}

function DonationCard() {
  const [name, setName]           = useState('')
  const [validErr, setValidErr]   = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [status, setStatus]       = useState('idle') // idle | loading | success | error

  async function handleSubmit() {
    setSubmitted(true)
    const trimmed = name.trim()
    if (trimmed.length < 2)  { setValidErr('Name must be at least 2 characters.'); return }
    if (trimmed.length > 50) { setValidErr('Name must be 50 characters or less.'); return }
    setValidErr(null)
    setStatus('loading')
    if (!supabase) { setStatus('error'); return }
    const { error } = await supabase.from('donors').insert({ name: trimmed, approved: false })
    if (error) {
      setStatus('error')
    } else {
      setStatus('success')
      setName('')
      setSubmitted(false)
    }
  }

  function handleNameChange(e) {
    setName(e.target.value)
    if (validErr) setValidErr(null)
    if (status !== 'idle') setStatus('idle')
  }

  return (
    <div className="rounded-2xl bg-gray-900 p-6 mt-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Support Bitcoin Vibe Check</p>
      <div className="mt-3 space-y-1">
        <p className="text-sm text-gray-500">
          1. Send any amount to Strike:{' '}
          <a
            href="https://strike.me/fizzybreeze"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-400 hover:text-orange-300"
          >
            Open Strike to pay ⚡₿
          </a>
        </p>
        <p className="text-sm text-gray-500">2. Enter your name or handle below and click Submit.</p>
      </div>
      <div className="mt-4">
        <input
          type="text"
          value={name}
          onChange={handleNameChange}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Your name or handle…"
          maxLength={50}
          className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-2.5 text-base text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        />
        {submitted && validErr && <p className="mt-2 text-xs text-red-400">{validErr}</p>}
      </div>
      <div className="mt-3">
        <button
          onClick={handleSubmit}
          disabled={status === 'loading'}
          className="rounded-full border border-orange-500 bg-transparent px-6 py-2 text-sm font-semibold text-orange-500 transition-colors hover:bg-orange-500 hover:text-white disabled:opacity-50"
        >
          Submit my name
        </button>
      </div>
      {status === 'success' && (
        <p className="mt-3 text-xs text-green-400">Thanks! You'll appear in the banner within 24 hours.</p>
      )}
      {status === 'error' && (
        <p className="mt-3 text-xs text-red-400">Something went wrong. Please try again.</p>
      )}
    </div>
  )
}

// Singleton: ensures loadData() fires only once on mount even under React StrictMode
// (StrictMode double-invokes effects in development; both runs share the same promise).
let _initialLoadPromise = null

export default function App() {
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [range, setRange]             = useState('7D')
  const [currency, setCurrency]       = useState('usd')
  const [chart, setChart]             = useState(null)
  const [chartLoading, setChartLoading] = useState(true)
  const [chartChange, setChartChange] = useState(null)
  const [chartNonce, setChartNonce]   = useState(0)
  const [chartError, setChartError]   = useState(null) // null | 'temp' | 'permanent'
  const [wsLive, setWsLive]           = useState(false)
  const [volHistory, setVolHistory]   = useState(() => readVolumeHistory())
  const [donors, setDonors]           = useState([])
  const chartCache       = useRef(new Map())
  const debounceRef      = useRef(null)
  const retryRef         = useRef(null)
  const fetchIdRef       = useRef(0)
  const prevCacheKeyRef  = useRef(null)
  const prefetchingRef   = useRef(new Set())
  const wsRef        = useRef(null)
  const reconnectRef = useRef(null)

  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem(SOUND_KEY) === 'true')
  const audioCtxRef       = useRef(null)
  const prevBlockHtRef    = useRef(null)
  const prevPriceUsdRef   = useRef(null)
  const lastTickRef       = useRef(0)

  // Load KPI data on mount
  useEffect(() => {
    let active = true
    async function run() {
      if (!_initialLoadPromise) _initialLoadPromise = loadData()
      const result = await _initialLoadPromise
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
        marketCapUsd:   result.marketCapUsd   ?? cache.marketCapUsd   ?? null,
        fng:            result.fng            ?? cache.fng            ?? null,
        fngHistory:     result.fngHistory     ?? cache.fngHistory     ?? null,
        difficulty:     result.difficulty     ?? cache.difficulty     ?? null,
        fees:           result.fees           ?? cache.fees           ?? null,
        btcDominance:   result.btcDominance   ?? cache.btcDominance   ?? null,
        mempool:        result.mempool        ?? cache.mempool        ?? null,
        lastBlockTs:    result.lastBlockTs    ?? cache.lastBlockTs    ?? null,
        lightning:      result.lightning      ?? cache.lightning      ?? null,
        athUsd:         result.athUsd         ?? cache.athUsd         ?? null,
      })
      setLastUpdated(new Date())
      setLoading(false)
    }
    run()
    return () => { active = false }
  }, [])

  // Prefetch all four chart ranges on mount so the main chart effect hits cache.
  // prefetchingRef deduplication prevents StrictMode run 2 from firing duplicate requests;
  // chartCache is a ref so writes from run 1 survive the mock unmount/remount.
  useEffect(() => {
    RANGES.forEach(({ label, days }) => {
      const key = label
      if (chartCache.current.has(key) || prefetchingRef.current.has(key)) return
      prefetchingRef.current.add(key)
      fetchChart(days)
        .then(r  => { chartCache.current.set(key, r) })
        .catch(() => {})
        .finally(() => { prefetchingRef.current.delete(key) })
    })
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
        if (result.fngHistory    != null) patch.fngHistory    = result.fngHistory
        if (result.difficulty    != null) patch.difficulty    = result.difficulty
        if (result.fees          != null) patch.fees          = result.fees
        if (result.blockHeight   != null) patch.blockHeight   = result.blockHeight
        if (result.priceChange24h != null) patch.priceChange24h = result.priceChange24h
        if (result.marketCapUsd   != null) patch.marketCapUsd   = result.marketCapUsd
        if (result.btcDominance  != null) patch.btcDominance  = result.btcDominance
        if (result.mempool       != null) patch.mempool       = result.mempool
        if (result.lastBlockTs   != null) patch.lastBlockTs   = result.lastBlockTs
        if (result.lightning     != null) patch.lightning     = result.lightning
        if (result.athUsd        != null) patch.athUsd        = result.athUsd
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

  // Fetch approved donors on mount; refresh every 5 minutes
  useEffect(() => {
    async function fetchDonors() {
      if (!supabase) return
      const { data } = await supabase
        .from('donors')
        .select('id, name')
        .eq('approved', true)
        .order('created_at', { ascending: true })
      if (data) setDonors(data)
    }
    fetchDonors()
    const id = setInterval(fetchDonors, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Fix 1+2+3+4: debounced fetch (400ms), in-memory cache, error handling with auto-retry, loading overlay
  useEffect(() => {
    const days = RANGES.find(r => r.label === range)?.days ?? 7
    const cacheKey = range
    const prevCacheKey = prevCacheKeyRef.current
    prevCacheKeyRef.current = cacheKey

    // Cancel any pending debounce or retry timer
    clearTimeout(debounceRef.current)
    clearTimeout(retryRef.current)
    setChartError(null)

    // Serve immediately from cache if available
    if (chartCache.current.has(cacheKey)) {
      const cached = chartCache.current.get(cacheKey)
      setChart(cached)
      setChartChange(computeChartChange(cached))
      setChartLoading(false)
      return
    }

    // Clear stale chart when switching to an uncached range so skeleton shows.
    // On refresh (same cacheKey), keep old chart visible behind the opacity overlay.
    if (prevCacheKey !== cacheKey) setChart(null)
    setChartLoading(true)
    setChartChange(null)

    // Stamp this fetch so stale responses from cancelled requests are discarded
    const myId = ++fetchIdRef.current

    // After loading the active range, silently cache the other three ranges.
    // Fire-and-forget: errors are swallowed, prefetchingRef prevents duplicate concurrent fetches.
    function startBackgroundPrefetch() {
      RANGES
        .filter(r => r.label !== range)
        .forEach(({ label, days: d }) => {
          const key = label
          if (chartCache.current.has(key) || prefetchingRef.current.has(key)) return
          prefetchingRef.current.add(key)
          fetchChart(d)
            .then(r  => { chartCache.current.set(key, r) })
            .catch(() => {})
            .finally(() => { prefetchingRef.current.delete(key) })
        })
    }

    async function doFetch() {
      try {
        const result = await fetchChart(days)
        if (fetchIdRef.current !== myId) return
        chartCache.current.set(cacheKey, result)
        setChart(result)
        setChartChange(computeChartChange(result))
        setChartLoading(false)
        startBackgroundPrefetch()
      } catch {
        if (fetchIdRef.current !== myId) return
        // Keep existing chart visible; show temp warning then auto-retry once
        setChartLoading(false)
        setChartError('temp')
        retryRef.current = setTimeout(async () => {
          try {
            const result = await fetchChart(days)
            if (fetchIdRef.current !== myId) return
            chartCache.current.set(cacheKey, result)
            setChart(result)
            setChartChange(computeChartChange(result))
            setChartError(null)
            startBackgroundPrefetch()
          } catch {
            if (fetchIdRef.current !== myId) return
            setChartError('permanent')
          }
        }, 5000)
      }
    }

    // Debounce: wait 400ms before firing so rapid toggle clicks only produce one request
    debounceRef.current = setTimeout(doFetch, 400)
    return () => {
      clearTimeout(debounceRef.current)
      clearTimeout(retryRef.current)
    }
  }, [range, chartNonce])

  // Initialise AudioContext on first user interaction when sound is enabled
  useEffect(() => {
    if (!soundEnabled || audioCtxRef.current) return
    function init() {
      if (audioCtxRef.current) return
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      document.removeEventListener('click',      init, true)
      document.removeEventListener('keydown',    init, true)
      document.removeEventListener('touchstart', init, true)
    }
    document.addEventListener('click',      init, true)
    document.addEventListener('keydown',    init, true)
    document.addEventListener('touchstart', init, true)
    return () => {
      document.removeEventListener('click',      init, true)
      document.removeEventListener('keydown',    init, true)
      document.removeEventListener('touchstart', init, true)
    }
  }, [soundEnabled])

  // New block sound
  useEffect(() => {
    const bh = data?.blockHeight ?? null
    if (bh == null) return
    if (soundEnabled && audioCtxRef.current && prevBlockHtRef.current != null && bh !== prevBlockHtRef.current) {
      playBlockThud(audioCtxRef.current)
    }
    prevBlockHtRef.current = bh
  }, [data?.blockHeight, soundEnabled])

  // Price tick sound (debounced to max 1 per second)
  useEffect(() => {
    const p = data?.priceUsd ?? null
    if (p == null) return
    if (soundEnabled && audioCtxRef.current && prevPriceUsdRef.current != null && p !== prevPriceUsdRef.current) {
      const now = Date.now()
      if (now - lastTickRef.current >= 1000) {
        lastTickRef.current = now
        playPriceTick(audioCtxRef.current, p > prevPriceUsdRef.current)
      }
    }
    prevPriceUsdRef.current = p
  }, [data?.priceUsd, soundEnabled])

  function refreshChart() {
    chartCache.current.delete(range)
    setChartNonce(n => n + 1)
  }

  function handleSoundToggle() {
    const next = !soundEnabled
    setSoundEnabled(next)
    localStorage.setItem(SOUND_KEY, next ? 'true' : 'false')
    if (next && !audioCtxRef.current) {
      // The button click is a user gesture — safe to create AudioContext immediately
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
  }

  const { priceUsd, priceGbp, priceEur, priceCad, priceChf,
          volumeUsd, volumeGbp, volumeEur, volumeCad, volumeChf,
          priceChange24h, fees, blockHeight, fng, fngHistory, difficulty, btcDominance, mempool, lastBlockTs,
          marketCapUsd, lightning, athUsd } = data ?? {}
  const price  = { usd: priceUsd,  gbp: priceGbp,  eur: priceEur,  cad: priceCad,  chf: priceChf  }[currency] ?? null
  const volume = { usd: volumeUsd, gbp: volumeGbp, eur: volumeEur, cad: volumeCad, chf: volumeChf }[currency] ?? null
  const athPct = athUsd != null && priceUsd != null ? ((priceUsd - athUsd) / athUsd) * 100 : null

  const chartPrices = chart?.map(d => d.price) ?? []
  const lo  = chartPrices.length ? Math.min(...chartPrices) : 0
  const hi  = chartPrices.length ? Math.max(...chartPrices) : 0
  const pad = (hi - lo) * 0.08

  const xInterval   = chart?.length ? Math.max(0, Math.floor(chart.length / 7) - 1) : 0
  const currencySym = CURRENCY_META[currency]?.sym ?? '$'

  const fngScore   = fng?.value != null ? parseInt(fng.value, 10) : null
  const diffChange = difficulty?.difficultyChange ?? null
  const vibeLabel  = (() => {
    if (priceChange24h == null || fngScore == null || diffChange == null) return null
    const priceStr = Math.abs(priceChange24h) <= 0.2 ? 'price is flat'
      : priceChange24h > 0 ? 'price is up' : 'price is down'
    const sentStr = fngScore <= 24 ? 'market is in extreme fear'
      : fngScore <= 44 ? 'market is fearful'
      : fngScore <= 55 ? 'market is neutral'
      : fngScore <= 74 ? 'market is greedy'
      : 'market is in extreme greed'
    const minerStr = diffChange < -3 ? 'miners are slowing'
      : diffChange > 3 ? 'miners are speeding up'
      : 'miners are steady'
    const sentence = `${sentStr}, ${priceStr}, ${minerStr}.`
    return sentence.charAt(0).toUpperCase() + sentence.slice(1)
  })()

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-8 text-white">

      {/* Header */}
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-3xl">Bitcoin Vibe Check</h1>
          <p className="mt-0.5 text-xs text-gray-500">{vibeLabel ?? 'Read the room.'}</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleSoundToggle}
            aria-label={soundEnabled ? 'Disable sound' : 'Enable sound'}
            className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors ${soundEnabled ? 'text-orange-400' : 'text-gray-600 hover:text-gray-400'}`}
          >
            {soundEnabled ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M1 5.5v5h3l4 3v-11l-4 3H1z"/>
                <path d="M11.5 5.5a4 4 0 010 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M1 5.5v5h3l4 3v-11l-4 3H1z"/>
                <line x1="10.5" y1="6" x2="14.5" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="14.5" y1="6" x2="10.5" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </button>
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

      {/* KPI grid — 1 col mobile, 3 col desktop (lg+) */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Col 1 Row 1 — BTC Price */}
        <div className="lg:col-start-1 lg:row-start-1">
          <BtcPriceCard
            value={price != null ? fmtCurrency(price, currency) : null}
            change={priceChange24h}
            sub={priceChange24h != null ? '24h change' : null}
            athPct={athPct}
          />
        </div>
        {/* Col 2 Rows 1–2 — Network Pulse (full column height) */}
        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <NetworkPulseCard fng={fng} fngHistory={fngHistory} difficulty={difficulty} loading={loading} />
        </div>
        {/* Col 3 Row 1 — Network Heartbeat (mobile only; merged into Recent Blocks on desktop) */}
        <div className="lg:hidden">
          <NetworkHeartbeatCard
            blockHeight={blockHeight}
            difficulty={difficulty}
            lastBlockTs={lastBlockTs}
            loading={loading}
          />
        </div>
        {/* Col 3 Rows 1–2 — Recent Blocks (heartbeat header merged in on desktop) */}
        <div className="lg:col-start-3 lg:row-start-1 lg:row-span-2">
          <RecentBlocksCard
            blockHeight={blockHeight}
            difficulty={difficulty}
            lastBlockTs={lastBlockTs}
            loading={loading}
          />
        </div>
        {/* Col 1 Row 2 — 24H Volume */}
        <div className="lg:col-start-1 lg:row-start-2">
          <VolumeCard
            volumeUsd={volumeUsd}
            volume={volume}
            currency={currency}
            btcDominance={btcDominance}
            volHistory={volHistory}
            marketCapUsd={marketCapUsd}
            price={price}
            mempool={mempool}
          />
        </div>
      </div>

      {/* Halving countdown */}
      <HalvingCountdown blockHeight={blockHeight} />

      {/* Chart + Fees */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

        {/* Price chart */}
        <div className="rounded-2xl bg-gray-900 p-6 md:col-span-2 h-full">
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
            <div className="flex flex-col items-start md:items-end gap-1">
            <div className="flex items-center gap-1 overflow-x-auto">
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
              <button
                onClick={refreshChart}
                disabled={chartLoading}
                aria-label="Refresh chart"
                className="ml-1 rounded-full p-1 text-gray-600 transition-colors hover:text-gray-300 disabled:opacity-30"
              >
                <svg
                  width="13" height="13" viewBox="0 0 13 13"
                  fill="none" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  className={chartLoading ? 'animate-spin' : ''}
                  aria-hidden="true"
                >
                  <path d="M11.5 6.5a5 5 0 1 1-1.33-3.35"/>
                  <polyline points="11.5 1.5 11.5 5 8 5"/>
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-500">Chart in USD</p>
            </div>
          </div>

          {/* Fix 3: error messages below toggles */}
          {chartError === 'temp' && (
            <p className="mb-4 text-xs text-red-500/70">Data temporarily unavailable. Retrying...</p>
          )}
          {chartError === 'permanent' && (
            <div className="mb-4 flex items-center gap-2">
              <p className="text-xs text-red-500/70">Unable to load chart data. Try again shortly.</p>
              <button
                onClick={refreshChart}
                aria-label="Retry chart"
                className="text-gray-600 transition-colors hover:text-gray-400"
              >
                <svg
                  width="13" height="13" viewBox="0 0 13 13"
                  fill="none" stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M11.5 6.5a5 5 0 1 1-1.33-3.35"/>
                  <polyline points="11.5 1.5 11.5 5 8 5"/>
                </svg>
              </button>
            </div>
          )}

          {/* Fix 4: skeleton when no data yet; dim + "Loading..." overlay while fetching new range */}
          {chartLoading && !chart
            ? <Skeleton className="h-64" />
            : (
              <div className="relative">
                <div className={`transition-opacity duration-200 ${chartLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
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
                        tickFormatter={v => `$${Math.round(v / 1000)}k`}
                        width={52}
                      />
                      <YAxis yAxisId="volume" hide />
                      <Tooltip content={<ChartTooltip currency="usd" />} />
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
                            label={{ value: `H: $${Math.round(hi).toLocaleString('en-US')}`, position: 'insideTopRight', fill: '#4ade80', fontSize: 10 }}
                          />
                          <ReferenceLine
                            yAxisId="price"
                            y={lo}
                            stroke="#f87171"
                            strokeDasharray="3 3"
                            strokeWidth={1}
                            label={{ value: `L: $${Math.round(lo).toLocaleString('en-US')}`, position: 'insideBottomRight', fill: '#f87171', fontSize: 10 }}
                          />
                        </>
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                {chartLoading && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <p className="text-xs text-gray-500">Loading...</p>
                  </div>
                )}
              </div>
            )
          }
        </div>

        {/* Mempool + Network fees */}
        <div className="rounded-2xl bg-gray-900 p-4 md:p-6 flex flex-col gap-4 justify-between h-full">
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

          {/* Lightning Network */}
          <div className="h-px bg-gray-800" />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Lightning Network</p>
            {loading && !lightning
              ? <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}
                </div>
              : lightning?.latest
                ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Capacity</p>
                      <div className="mt-1 flex items-baseline gap-0.5">
                        <span className="text-base font-bold text-orange-400">
                          {(lightning.latest.total_capacity / 1e8).toFixed(1)}
                        </span>
                        <span className="text-xs text-gray-500">BTC</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Nodes</p>
                      <p className="mt-1 text-base font-bold text-orange-400">
                        {lightning.latest.node_count.toLocaleString('en-US')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Channels</p>
                      <p className="mt-1 text-base font-bold text-orange-400">
                        {lightning.latest.channel_count.toLocaleString('en-US')}
                      </p>
                    </div>
                  </div>
                )
                : <p className="text-xs text-gray-500">Unavailable</p>
            }
          </div>
        </div>

      </div>

      {/* Supporters ticker */}
      <SupporterTickerCard donors={donors} />
      <MobileSupportersCard donors={donors} />

      {/* Newsletter signup */}
      <NewsletterCard />

      {/* Privacy note */}
      <p className="mt-2 text-center text-xs text-gray-600">
        By subscribing you agree to our{' '}
        <a
          href="https://www.beehiiv.com/privacy?utm_source=satoshi%27s_weekly_brief"
          target="_blank"
          rel="noopener noreferrer"
          className="text-orange-400 hover:text-orange-300"
        >
          Privacy Policy
        </a>
      </p>

      {/* Donation card */}
      <DonationCard />

      <SatoshiQuote />

      <p className="py-4 text-center text-xs text-gray-700">© 2026 Bitcoin Vibe Check · MIT Licence</p>

      {/* First-visit newsletter modal */}
      <NewsletterModal />

    </div>
  )
}
