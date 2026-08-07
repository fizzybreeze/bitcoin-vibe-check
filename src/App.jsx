import { useState, useEffect, useRef } from 'react'
import { Analytics } from '@vercel/analytics/react'
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
  LineChart, Line,
} from 'recharts'
import './App.css'
import BeehiivEmbed from './components/BeehiivEmbed.jsx'
import { usePersistedState } from './hooks/usePersistedState.js'
import ShareButton from './components/ShareButton.jsx'
import ShareModal from './components/ShareModal.jsx'
import PriceAlertsButton from './components/PriceAlertsButton.jsx'
import PriceAlertsPanel from './components/PriceAlertsPanel.jsx'
import { usePriceAlerts } from './hooks/usePriceAlerts.js'
import { supabase } from './lib/supabase.js'
import {
  CURRENCY_META, fmtCurrency, fmtVolume, computeChartChange,
} from './utils.js'
import {
  computeAthDistance, computeIssuedSupply,
  computeHashRateTrend, calcFiatFee, computeVibeScore, computePriceChange30d,
  computeVibeDimensions, computeVibeSummary, vibeDimensionValues,
} from './lib/calculations.js'
import { calc200DMA, calcMayerMultiple } from './utils/cycleCalculations.js'
import {
  KRAKEN_INTERVAL, krakenParamsForDays,
  fetchKrakenCandles, parseKrakenOhlc,
} from './lib/ohlc.js'
import CycleIndicatorsCard from './components/CycleIndicatorsCard.jsx'
import CardTooltip from './components/CardTooltip.jsx'
import BtcPriceCard from './components/BtcPriceCard.jsx'
import Skeleton from './components/Skeleton.jsx'
import NetworkPulseCard from './components/NetworkPulseCard.jsx'
import RecentBlocksCard from './components/RecentBlocksCard.jsx'
import NetworkHeartbeatCard from './components/NetworkHeartbeatCard.jsx'
import HalvingCountdown from './components/HalvingCountdown.jsx'
import VolumeCard from './components/VolumeCard.jsx'

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

const WS_SYMBOL_MAP = {
  'BTC/USD': 'priceUsd',
  'BTC/GBP': 'priceGbp',
  'BTC/EUR': 'priceEur',
  'BTC/CAD': 'priceCad',
  'BTC/CHF': 'priceChf',
}

async function loadData() {
  const [paprikaTickerRes, feesRes, heightRes, fngRes, diffRes, paprikaGlobalRes, mempoolRes, blocksRes, lightningRes, krakenTickerRes] = await Promise.allSettled([
    fetch('https://api.coinpaprika.com/v1/tickers/btc-bitcoin').then(r => r.json()),
    fetch('https://mempool.space/api/v1/fees/recommended').then(r => r.json()),
    fetch('https://mempool.space/api/blocks/tip/height').then(r => r.json()),
    fetch('https://api.alternative.me/fng/?limit=30').then(r => r.json()),
    fetch('https://mempool.space/api/v1/difficulty-adjustment').then(r => r.json()),
    fetch('https://api.coinpaprika.com/v1/global').then(r => r.json()),
    fetch('https://mempool.space/api/mempool').then(r => r.json()),
    fetch('https://mempool.space/api/v1/blocks').then(r => r.json()),
    fetch('https://mempool.space/api/v1/lightning/statistics/latest').then(r => r.json()),
    fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD,XBTGBP,XBTEUR,XBTCAD,XBTCHF').then(r => r.json()),
  ])

  const paprika      = paprikaTickerRes.status  === 'fulfilled' ? (paprikaTickerRes.value?.quotes?.USD  ?? {}) : {}
  const paprikaGlobal = paprikaGlobalRes.status === 'fulfilled' ? (paprikaGlobalRes.value               ?? {}) : {}
  const krakenResult = krakenTickerRes.status   === 'fulfilled' ? (krakenTickerRes.value?.result         ?? {}) : {}
  const fngData      = fngRes.status            === 'fulfilled' ? fngRes.value                                  : null

  const findKrakenPrice = (suffix) => {
    const key = Object.keys(krakenResult).find(k => k.endsWith(suffix))
    return key ? parseFloat(krakenResult[key].c[0]) : null
  }

  const priceUsd = parseFloat(paprika.price) || null
  const priceGbp = findKrakenPrice('GBP')
  const priceEur = findKrakenPrice('EUR')
  const priceCad = findKrakenPrice('CAD')
  const priceChf = findKrakenPrice('CHF')
  const volumeUsd = paprika.volume_24h ?? null

  return {
    priceUsd,
    priceGbp,
    priceEur,
    priceCad,
    priceChf,
    volumeUsd,
    volumeGbp:      (volumeUsd != null && priceUsd && priceGbp) ? volumeUsd * priceGbp / priceUsd : null,
    volumeEur:      (volumeUsd != null && priceUsd && priceEur) ? volumeUsd * priceEur / priceUsd : null,
    volumeCad:      (volumeUsd != null && priceUsd && priceCad) ? volumeUsd * priceCad / priceUsd : null,
    volumeChf:      (volumeUsd != null && priceUsd && priceChf) ? volumeUsd * priceChf / priceUsd : null,
    priceChange24h: paprika.percent_change_24h ?? null,
    marketCapUsd:   paprika.market_cap         ?? null,
    fees:           feesRes.status      === 'fulfilled' ? feesRes.value                                           : null,
    blockHeight:    heightRes.status    === 'fulfilled' ? heightRes.value                                         : null,
    fng:            fngData?.data?.[0]  ?? null,
    fngHistory:     Array.isArray(fngData?.data) && fngData.data.length
                      ? [...fngData.data].reverse().map(d => ({ v: parseInt(d.value, 10) }))
                      : null,
    difficulty:     diffRes.status      === 'fulfilled' ? diffRes.value                                           : null,
    btcDominance:   paprikaGlobal.bitcoin_dominance_percentage ?? null,
    mempool:        mempoolRes.status   === 'fulfilled' ? mempoolRes.value                                        : null,
    lastBlockTs:    blocksRes.status    === 'fulfilled' && Array.isArray(blocksRes.value) && blocksRes.value.length > 0
                      ? (blocksRes.value[0].timestamp ?? null)
                      : null,
    lightning:      lightningRes.status === 'fulfilled' ? lightningRes.value                                      : null,
    athUsd:         parseFloat(paprika.ath_price) || null,
  }
}

async function fetchChart(days) {
  const { interval, count } = krakenParamsForDays(days)
  // fetchKrakenCandles throws on a transport failure, on a Kraken error (which
  // arrives inside a 200, so res.ok sails past it) and on a body with no
  // candles. The caller already retries. It also shares a request in flight for
  // the same URL, which is what stops 1M and 1Y — identical URLs since Kraken
  // dropped `limit` — being fetched twice in the same prefetch burst (#24).
  const candles = await fetchKrakenCandles(interval)
  return parseKrakenOhlc(candles, days, count)
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

const FNG_TOOLTIP        = 'A composite sentiment score from 0 (extreme fear) to 100 (extreme greed). Values below 25 have historically preceded recoveries; above 75 have preceded corrections. Measures crowd psychology, not fundamentals.'

function MarketSentimentCard({ fng, fngHistory, loading }) {
  const fngScore = fng?.value != null ? parseInt(fng.value, 10) : null
  const fngClass = fng?.value_classification ?? null

  return (
    <div className="rounded-2xl bg-gray-900 p-6 h-full">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Market Sentiment</p>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 flex items-center">Fear &amp; Greed<CardTooltip text={FNG_TOOLTIP} /></p>
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


const CHART_VOLUME_TOOLTIP = "Volume bars show trading activity on Kraken's BTC/USD pair only. The 24H Volume card shows global volume aggregated across all exchanges by CoinPaprika — the two figures are not directly comparable."

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
            className="mt-3 block font-mono text-xs text-gray-600 hover:text-gray-400 transition-colors max-w-full px-4 break-all overflow-x-auto"
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
    <div className="hidden md:block rounded-2xl bg-gray-900 px-4 pt-4 pb-3 mt-4">
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
    <div className="md:hidden rounded-2xl bg-gray-900 px-4 pt-4 pb-3 mt-4">
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
        <p className="text-sm text-gray-600">We'll add you to the list once we see your payment come through.</p>
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
  const [range, setRange]             = usePersistedState('btc-vibe-chart-timeframe', '7D')
  const [currency, setCurrency]       = usePersistedState('btc-vibe-currency', 'usd')
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

  // 30-day hash-rate trend. Lifted out of NetworkPulseCard because the Vibe
  // Score needs it too. Deliberately a one-shot fetch rather than part of
  // loadData's 60-second cycle — it is a 30-day metric, so refetching it every
  // minute would add request volume for a number that cannot have moved.
  const [hashRateTrend, setHashRateTrend]     = useState(null)
  useEffect(() => {
    fetch('https://mempool.space/api/v1/mining/hashrate/1m')
      .then(r => r.json())
      .then(json => {
        const trend = computeHashRateTrend(json?.hashrates)
        if (trend != null) setHashRateTrend(trend)
      })
      .catch(() => {})
  }, [])

  const [chainData, setChainData]             = useState(null)
  const [chainDataLoading, setChainDataLoading] = useState(true)
  const [chainDataError, setChainDataError]   = useState(false)
  const [ohlcData200, setOhlcData200]         = useState(null)
  const [ohlcLoading, setOhlcLoading]         = useState(true)
  const [ohlcError, setOhlcError]             = useState(null)

  const [isShareOpen, setIsShareOpen] = useState(false)
  const [isPriceAlertsOpen, setIsPriceAlertsOpen] = useState(false)
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

  // Fetch BGeometrics chain data (MVRV + ETF) via serverless proxy; refresh every 6 hours
  useEffect(() => {
    let active = true
    async function fetchChainData() {
      setChainDataLoading(true)
      setChainDataError(false)
      try {
        const res = await fetch('/api/chain-data')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (active) setChainData(json)
      } catch {
        if (active) setChainDataError(true)
      } finally {
        if (active) setChainDataLoading(false)
      }
    }
    fetchChainData()
    const id = setInterval(fetchChainData, 6 * 60 * 60 * 1000)
    return () => { active = false; clearInterval(id) }
  }, [])

  // Fetch 200 daily candles for 200DMA and Mayer Multiple; refresh every 6 hours.
  // calc200DMA reads index 4 (close), the same index in Kraken's shape as in
  // Binance's, so it consumes these candles unchanged.
  useEffect(() => {
    let active = true
    async function fetchOhlc200() {
      setOhlcLoading(true)
      setOhlcError(null)
      try {
        // Same URL as the 1M and 1Y chart ranges, so this shares their request
        // whenever the two overlap (#24). `slice` copies, which it must — the
        // resolved array is shared with those callers.
        const candles = await fetchKrakenCandles(KRAKEN_INTERVAL.DAY)
        if (active) setOhlcData200(candles.slice(-200))
      } catch (err) {
        if (active) setOhlcError(err.message)
      } finally {
        if (active) setOhlcLoading(false)
      }
    }
    fetchOhlc200()
    const id = setInterval(fetchOhlc200, 6 * 60 * 60 * 1000)
    return () => { active = false; clearInterval(id) }
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
    // Clear any stale fetch error as a new fetch begins. This effect
    // synchronises with an external system (the chart API), and the reset has
    // to apply on every path below, so it cannot move into the cache-hit or
    // success branches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const athPct = computeAthDistance(priceUsd, athUsd)
  const ma200  = ohlcData200?.length ? calc200DMA(ohlcData200) : null

  const {
    alerts,
    addAlert,
    removeAlert,
    clearTriggered,
    notificationPermission,
    requestPermission,
  } = usePriceAlerts(price, currency)

  const chartPrices = chart?.map(d => d.price) ?? []
  const lo  = chartPrices.length ? Math.min(...chartPrices) : 0
  const hi  = chartPrices.length ? Math.max(...chartPrices) : 0
  const pad = (hi - lo) * 0.08

  const xInterval   = chart?.length ? Math.max(0, Math.floor(chart.length / 7) - 1) : 0
  const currencySym = CURRENCY_META[currency]?.sym ?? '$'

  const fngScore   = fng?.value != null ? parseInt(fng.value, 10) : null

  // Vibe Score. Mayer must be computed in USD — ma200 comes from Kraken's
  // XBTUSD candles, so pairing it with a converted price would be nonsense.
  const vibeInputs = {
    fngScore,
    mayerMultiple:       calcMayerMultiple(priceUsd, ma200),
    mvrv:                chainData?.mvrv?.value ?? null,
    priceChange30dPct:   computePriceChange30d(ohlcData200),
    hashRateTrendPct:    hashRateTrend,
    fastestFeeSatsPerVb: fees?.fastestFee ?? null,
    mempoolTxCount:      mempool?.count ?? null,
  }
  const vibe = computeVibeScore(vibeInputs)
  // The header sentence is derived from the same dimension values as the score
  // below it, so the words and the number cannot contradict each other. It is
  // deliberately *not* gated on the score: if MVRV is rate-limited and the OHLC
  // fetch fails, coverage falls below the floor and there is no number — but
  // Fear & Greed, fees and hash rate are still live, and a sentence about them
  // makes no numeric claim. Falling back to the static tagline there would hide
  // data the page already has.
  const vibeSummary = computeVibeSummary(vibeDimensionValues(computeVibeDimensions(vibeInputs)))
  const vibeLoading = loading || ohlcLoading || chainDataLoading

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-8 text-white">

      {/* Header */}
      {/* Mobile: 3 stacked rows (title / subtitle / controls). Desktop (md+): single flex row. */}
      <header className="mb-8 flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-3xl">Bitcoin Vibe Check</h1>
          <p className="mt-0.5 text-xs text-gray-500">{vibeSummary ?? 'Read the room.'}</p>
        </div>
        <div className="flex items-center gap-4 self-end md:self-auto">
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
          <ShareButton onClick={() => setIsShareOpen(true)} />
          <PriceAlertsButton
            onClick={() => setIsPriceAlertsOpen(prev => !prev)}
            hasActiveAlerts={alerts.some(a => !a.triggered)}
          />
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

      {/* Row 1: Price + Chart */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <BtcPriceCard
            value={price != null ? fmtCurrency(price, currency) : null}
            change={priceChange24h}
            sub={priceChange24h != null ? '24h change' : null}
            athPct={athPct}
            vibe={vibe}
            vibeLoading={vibeLoading}
          />
        </div>
        <div className="md:col-span-2 h-full">
          <div className="rounded-2xl bg-gray-900 p-6 h-full">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 flex items-center">
                  Price · {currency.toUpperCase()}<CardTooltip text={CHART_VOLUME_TOOLTIP} />
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
        </div>
      </div>

      {/* Row 2+3: Market Stats + Sentiment */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <VolumeCard
          volumeUsd={volumeUsd}
          volume={volume}
          currency={currency}
          btcDominance={btcDominance}
          volHistory={volHistory}
          marketCapUsd={marketCapUsd}
          price={price}
        />
        <MarketSentimentCard fng={fng} fngHistory={fngHistory} loading={loading} />
      </div>

      {/* Row 4: Valuation / Cycle Indicators */}
      <div className="mb-4">
        <CycleIndicatorsCard
          currentPrice={priceUsd}
          ma200={ma200}
          ohlcLoading={ohlcLoading}
          ohlcError={ohlcError}
          currency={currency}
          fxRate={(price != null && priceUsd) ? price / priceUsd : 1}
          mvrv={chainData?.mvrv?.value}
          dataDate={chainData?.mvrv?.date}
          mvrvSource={chainData?.mvrv?.source}
          mvrvLoading={chainDataLoading}
          mvrvError={chainDataError}
        />
      </div>

      {/* Row 5: Network Health + Recent Blocks + Network Fees */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <NetworkPulseCard difficulty={difficulty} loading={loading} hashRateTrend={hashRateTrend} />
        <div className="flex flex-col gap-4">
          {/* Mobile-only: NetworkHeartbeatCard (desktop merges this data into RecentBlocksCard) */}
          <div className="lg:hidden">
            <NetworkHeartbeatCard
              blockHeight={blockHeight}
              difficulty={difficulty}
              lastBlockTs={lastBlockTs}
              loading={loading}
            />
          </div>
          <RecentBlocksCard
            blockHeight={blockHeight}
            difficulty={difficulty}
            lastBlockTs={lastBlockTs}
            loading={loading}
          />
        </div>
        <div className="rounded-2xl bg-gray-900 p-4 md:p-6 flex flex-col gap-4 justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 flex items-center">Network Fees<CardTooltip text="Fee rates in sat/vbyte across slow, medium, and fast confirmation tiers. Fiat estimates assume a standard 250-vbyte transaction -- a typical single-input transfer. Fees rise during congestion and fall when the mempool is clear." /></p>

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
                ].map(({ label, time, value }) => {
                  const fiatFee = price > 0 ? calcFiatFee(value, price) : null
                  const fiatStr = fiatFee != null
                    ? `≈ ${currencySym}${fiatFee >= 0.10 ? fiatFee.toFixed(2) : fiatFee.toFixed(4)}`
                    : null
                  return (
                    <div key={label} className="flex flex-col justify-center rounded-xl bg-gray-800 px-2 py-3 md:px-3 md:py-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</p>
                      <div className="mt-1.5 flex items-baseline gap-0.5 md:gap-1">
                        <span className="text-lg font-bold text-orange-400 md:text-2xl">{value}</span>
                        <span className="text-xs text-gray-500">sat/vB</span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-600">{time}</p>
                      {fiatStr && <p className="mt-0.5 text-xs text-gray-500">{fiatStr}</p>}
                    </div>
                  )
                })
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

      {/* Row 6: Supply / Epoch */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl bg-gray-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Supply Issued</p>
          {blockHeight != null ? (
            <>
              <p className="mt-2 text-lg font-bold text-white">
                {computeIssuedSupply(blockHeight).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}&nbsp;BTC
              </p>
              <p className="mt-0.5 text-xs text-gray-500">of 21,000,000 maximum</p>
            </>
          ) : (
            <Skeleton className="mt-2 h-7 w-36" />
          )}
        </div>
        <div className="lg:col-span-3">
          <HalvingCountdown blockHeight={blockHeight} />
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

      {isPriceAlertsOpen && (
        <PriceAlertsPanel
          alerts={alerts}
          currency={currency}
          onAdd={addAlert}
          onRemove={removeAlert}
          onClearTriggered={clearTriggered}
          notificationPermission={notificationPermission}
          onRequestPermission={requestPermission}
          onClose={() => setIsPriceAlertsOpen(false)}
        />
      )}

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        cardData={{ ...(data ?? {}), chainData, ma200, vibe }}
        sentimentSummary={vibeSummary}
        currency={currency}
      />

      <Analytics />

    </div>
  )
}
