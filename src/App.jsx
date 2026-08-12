import { useState, useEffect, useRef } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { usePersistedState } from './hooks/usePersistedState.js'
import Icon from './components/Icon.jsx'
import { ICON_BUTTON } from './lib/icons.js'
import ShareButton from './components/ShareButton.jsx'
import ShareModal from './components/ShareModal.jsx'
import PriceAlertsButton from './components/PriceAlertsButton.jsx'
import PriceAlertsPanel from './components/PriceAlertsPanel.jsx'
import { useMetricAlerts } from './hooks/useMetricAlerts.js'
import { usePushSubscription, PUSH_ON } from './hooks/usePushSubscription.js'
import { syncableRules } from './lib/pushRules.js'
import useVibeHistory from './hooks/useVibeHistory.js'
import useTheme from './hooks/useTheme.js'
import ThemeToggle from './components/ThemeToggle.jsx'
import { supabase } from './lib/supabase.js'
import { createChartCache, chartCacheKey } from './lib/chartCache.js'
import { mergeMarketData, krakenTickerUpdates } from './lib/marketData.js'
import {
  CURRENCY_META, fmtCurrency, computeChartChange,
} from './utils.js'
import {
  computeAthDistance, computeHashRateTrend, computeVibeScore, computePriceChange30d,
  computeVibeDimensions, computeVibeSummary, vibeDimensionValues,
} from './lib/calculations.js'
import { calc200DMA, calcMayerMultiple } from './utils/cycleCalculations.js'
import { KRAKEN_INTERVAL, fetchKrakenCandles } from './lib/ohlc.js'
import { fetchChartSeries } from './lib/chartSeries.js'
import CycleIndicatorsCard from './components/CycleIndicatorsCard.jsx'
import BtcPriceCard from './components/BtcPriceCard.jsx'
import NetworkPulseCard from './components/NetworkPulseCard.jsx'
import RecentBlocksCard from './components/RecentBlocksCard.jsx'
import NetworkHeartbeatCard from './components/NetworkHeartbeatCard.jsx'
import HalvingCountdown from './components/HalvingCountdown.jsx'
import VolumeCard from './components/VolumeCard.jsx'
import MarketSentimentCard from './components/MarketSentimentCard.jsx'
import NetworkFeesCard from './components/NetworkFeesCard.jsx'
import SupplyIssuedCard from './components/SupplyIssuedCard.jsx'
import SupporterTickerCard from './components/SupporterTickerCard.jsx'
import MobileSupportersCard from './components/MobileSupportersCard.jsx'
import DonationCard from './components/DonationCard.jsx'
import NewsletterCard from './components/NewsletterCard.jsx'
import NewsletterModal from './components/NewsletterModal.jsx'
import SatoshiQuote from './components/SatoshiQuote.jsx'
import PriceChartCard from './components/PriceChartCard.jsx'
import Wordmark from './components/Wordmark.jsx'
import { WORDMARK_TEXT } from './lib/wordmark.js'

const CACHE_KEY = 'btc-cache'
const VOL_HISTORY_KEY = 'btc-vol-history'
const SOUND_KEY = 'btc-vibe-sound-enabled'

const RANGES = [
  { label: '1D', days: 1   },
  { label: '7D', days: 7   },
  { label: '1M', days: 30  },
  { label: '1Y', days: 365 },
]

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

  // Unwrap only. Every decision about what a missing body means — and which
  // source can stand in for which — lives in `mergeMarketData`, where it is
  // testable without a network.
  const body = (settled) => (settled.status === 'fulfilled' ? settled.value ?? null : null)

  return mergeMarketData({
    paprikaTicker: body(paprikaTickerRes),
    paprikaGlobal: body(paprikaGlobalRes),
    krakenTicker:  body(krakenTickerRes),
    fng:           body(fngRes),
    fees:          body(feesRes),
    blockHeight:   body(heightRes),
    difficulty:    body(diffRes),
    mempool:       body(mempoolRes),
    blocks:        body(blocksRes),
    lightning:     body(lightningRes),
  })
}

/**
 * Chart data for a `range:currency` key — the fetch sitting behind the store.
 *
 * Resolves to `{ points, currency }`, where the currency is what the candles are
 * actually in; `fetchChartSeries` owns that distinction and the fallback that
 * makes it necessary. It throws on everything but a missing market, which is
 * what the effect's retry path below is for. Sharing a request in flight for the
 * same URL happens a layer down in `fetchKrakenCandles`, which is what stops 1M
 * and 1Y — identical URLs since Kraken dropped `limit` — being fetched twice in
 * the same prefetch burst (#24).
 */
function fetchChartForKey(key) {
  const [label, currency] = key.split(':')
  return fetchChartSeries(RANGES.find(r => r.label === label)?.days ?? 7, currency)
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
  // Deliberately never caches the derived market cap. The cache is a
  // repeat-visit fallback with no provenance attached, so a stored estimate
  // would resurface later with nothing to label it — and it needs no caching
  // anyway, being recomputed from a live price and block height every load.
  if (data.marketCapUsd != null && !data.marketCapEstimated) patch.marketCapUsd = data.marketCapUsd
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
  // What the candles on screen are denominated in, which is the selected
  // currency unless Kraken had no market for it. Separate state rather than
  // derived from `currency`, because the whole point is that the two can differ.
  const [chartCurrency, setChartCurrency] = useState('usd')
  const [chartLoading, setChartLoading] = useState(true)
  const [chartChange, setChartChange] = useState(null)
  const [chartNonce, setChartNonce]   = useState(0)
  const [chartError, setChartError]   = useState(null) // null | 'temp' | 'permanent'
  const [wsLive, setWsLive]           = useState(false)
  const [volHistory, setVolHistory]   = useState(() => readVolumeHistory())
  const [donors, setDonors]           = useState([])
  // Lazily initialised: `useRef(createChartCache(…))` would build and discard a
  // fresh store on every render, and this component re-renders on every price
  // tick.
  const chartCache       = useRef(null)
  if (chartCache.current == null) { chartCache.current = createChartCache(fetchChartForKey) }
  // The currency at mount, for the prefetch below. `usePersistedState` reads
  // localStorage synchronously, so the first render already holds the real one.
  const initialCurrency  = useRef(currency)
  const debounceRef      = useRef(null)
  const retryRef         = useRef(null)
  const fetchIdRef       = useRef(0)
  const prevCacheKeyRef  = useRef(null)
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
  // The theme the page is painted in. Owned here rather than by the toggle,
  // because `ShareCanvas` rasterises outside the stylesheet and has to be told
  // which palette to draw with.
  const { theme, toggleTheme } = useTheme()
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

  // Warm all four chart ranges on mount so a toggle is instant. The chart effect
  // below joins whichever of these covers the active range rather than racing it
  // — the store dedupes both against the cache and against a request in flight,
  // which is what stops the active range being fetched twice (#41). That same
  // dedupe absorbs StrictMode's second invocation.
  //
  // Deliberately the mount currency rather than the live one: re-running this on
  // every currency change would fire four loads per switch with no debounce in
  // front of them, so arrowing through the selector would burst at Kraken. A
  // switch is warmed by `startBackgroundPrefetch` instead, which runs after the
  // active range has landed and is therefore already behind the 400ms debounce.
  useEffect(() => {
    const currencyAtMount = initialCurrency.current
    RANGES.forEach(({ label }) => {
      chartCache.current.load(chartCacheKey(label, currencyAtMount)).catch(() => {})
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
        // Paired: a refresh that recovers CoinPaprika must clear the estimate
        // label at the same moment it replaces the estimated number.
        if (result.marketCapUsd   != null) {
          patch.marketCapUsd       = result.marketCapUsd
          patch.marketCapEstimated = result.marketCapEstimated
        }
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
        // Every decision about which fields a frame may overwrite — and what
        // counts as a usable value — lives in `krakenTickerUpdates`, where a
        // zero or non-numeric tick is a unit test rather than a blank page.
        const updates = krakenTickerUpdates(JSON.parse(data), WS_SYMBOL_MAP)
        if (updates) setData(prev => prev ? { ...prev, ...updates } : prev)
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
    const cacheKey = chartCacheKey(range, currency)
    const prevCacheKey = prevCacheKeyRef.current
    prevCacheKeyRef.current = cacheKey

    // One place to apply a result, because the currency the candles came back in
    // has to be adopted at exactly the same moment as the candles themselves —
    // set apart, a slow render could pair one range's points with another's
    // label, which is the class of bug this whole change is about.
    function showSeries(series) {
      setChart(series.points)
      setChartCurrency(series.currency)
      setChartChange(computeChartChange(series.points))
    }

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
      showSeries(chartCache.current.get(cacheKey))
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
    // Fire-and-forget: errors are swallowed, and the store skips anything the
    // mount prefetch already holds or still has in flight. On a healthy cold
    // load that is all three — this is the recovery path for a mount prefetch
    // that failed, not the normal one.
    function startBackgroundPrefetch() {
      RANGES
        .filter(r => r.label !== range)
        .forEach(({ label }) => { chartCache.current.load(chartCacheKey(label, currency)).catch(() => {}) })
    }

    async function doFetch() {
      try {
        // `load` re-reads the cache and joins a request in flight. The check in
        // the effect body above happened 400ms ago — long enough for the mount
        // prefetch to have landed this very range (#41).
        const result = await chartCache.current.load(cacheKey)
        if (fetchIdRef.current !== myId) return
        showSeries(result)
        setChartLoading(false)
        startBackgroundPrefetch()
      } catch {
        if (fetchIdRef.current !== myId) return
        // Keep existing chart visible; show temp warning then auto-retry once
        setChartLoading(false)
        setChartError('temp')
        retryRef.current = setTimeout(async () => {
          try {
            const result = await chartCache.current.load(cacheKey)
            if (fetchIdRef.current !== myId) return
            showSeries(result)
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
  }, [range, currency, chartNonce])

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
    // Disowns a request for this range still in flight as well as the stored
    // candles — otherwise Refresh could be answered by the very fetch it was
    // pressed to replace.
    chartCache.current.invalidate(chartCacheKey(range, currency))
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
          marketCapUsd, marketCapEstimated, lightning, athUsd } = data ?? {}
  const price  = { usd: priceUsd,  gbp: priceGbp,  eur: priceEur,  cad: priceCad,  chf: priceChf  }[currency] ?? null
  const volume = { usd: volumeUsd, gbp: volumeGbp, eur: volumeEur, cad: volumeCad, chf: volumeChf }[currency] ?? null
  const athPct = computeAthDistance(priceUsd, athUsd)
  const ma200  = ohlcData200?.length ? calc200DMA(ohlcData200) : null

  const currencySym = CURRENCY_META[currency]?.sym ?? '$'

  const fngScore   = fng?.value != null ? parseInt(fng.value, 10) : null

  // Mayer must be computed in USD — ma200 comes from Kraken's XBTUSD candles,
  // so pairing it with a converted price would be nonsense. Which is also why
  // the alert registry leaves it un-scoped: there is only ever one of it.
  const mayerMultiple = calcMayerMultiple(priceUsd, ma200)

  // Every reading a rule may be written against. All four are values this
  // component already holds for the cards below — an alert costs no fetch.
  const {
    alerts,
    addAlert,
    removeAlert,
    clearTriggered,
    notificationPermission,
    requestPermission,
  } = useMetricAlerts({
    currency,
    price,
    fee:   fees?.fastestFee ?? null,
    fng:   fngScore,
    mayer: mayerMultiple,
  })

  const { pushStatus, pushBusy, pushFailReason, subscribePush, unsubscribePush, syncPushRules } =
    usePushSubscription()

  // Keep the stored rules in step with the panel while push is on. Keyed by the
  // rules' own content rather than by `alerts` identity, so this fires when a
  // rule is added, removed or triggered — not on every render. The hook itself
  // no-ops unless push is on, so switching it on is what performs the first
  // sync, and switching it off leaves the last set in place until the sender
  // reaps the endpoint.
  const syncedRulesKey = JSON.stringify(syncableRules(alerts))
  useEffect(() => {
    if (pushStatus !== PUSH_ON) return
    syncPushRules(alerts)
  // `alerts` is intentionally omitted: the key above already changes whenever
  // anything the server cares about changes, and depending on the array would
  // re-sync on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncedRulesKey, pushStatus, syncPushRules])

  // Permission is requested here, through the one deduped request the alerts
  // hook owns, and only then handed to `subscribePush`. Chromium leaves a
  // *concurrent* `Notification.requestPermission()` unsettled for good
  // (v1.7.4), and `pushManager.subscribe()` prompts on its own when permission
  // is still 'default' — so letting it do that beside the panel's own request
  // would reintroduce that race from the other side. Awaiting is safe
  // precisely because every request now funnels through one in-flight promise:
  // there is never a second native call to be concurrent with.
  async function enablePush() {
    await requestPermission()
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    await subscribePush()
  }

  // Vibe Score.
  const vibeInputs = {
    fngScore,
    mayerMultiple,
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
  // Deliberately not folded into vibeLoading: the score is live data and the
  // history is not, so a slow Supabase read must not put the number behind a
  // skeleton — and an absent history is a normal state, not a pending one.
  const vibeHistory = useVibeHistory()

  return (
    <div className="min-h-screen bg-ground p-4 md:p-8 text-ink">

      {/* Header */}
      {/* Mobile: 3 stacked rows (title / subtitle / controls). Desktop (md+): single flex row. */}
      <header className="mb-8 flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-0">
        <div>
          {/* The mark is the picture; the heading's name is the `sr-only` text
              beside it. Both are needed — a drawn wordmark with no text leaves
              the page's only `<h1>` unnamed. */}
          <h1>
            <span className="sr-only">{WORDMARK_TEXT}</span>
            <Wordmark />
          </h1>
          <p className="mt-1.5 text-xs text-quiet">{vibeSummary ?? 'Read the room.'}</p>
        </div>
        <div className="flex items-center gap-4 self-end md:self-auto">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button
            onClick={handleSoundToggle}
            aria-label={soundEnabled ? 'Disable sound' : 'Enable sound'}
            className={`${ICON_BUTTON} ${soundEnabled ? 'text-accent' : 'text-quiet hover:text-muted'}`}
          >
            <Icon name={soundEnabled ? 'volume-on' : 'volume-off'} size="lg" />
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
              aria-label="Display currency"
              className="appearance-none cursor-pointer rounded-full bg-raised pl-3 pr-7 py-1 text-xs font-semibold uppercase text-accent"
            >
              {['usd', 'gbp', 'eur', 'cad', 'chf'].map(c => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 flex text-accent" aria-hidden="true">
              <Icon name="chevron-down" size="sm" />
            </span>
          </div>
          <p className="flex items-center gap-1.5 text-sm text-quiet">
            {wsLive ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-up animate-pulse" />
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
            vibeHistory={vibeHistory}
          />
        </div>
        <div className="md:col-span-2 h-full">
          <PriceChartCard
            chart={chart}
            chartLoading={chartLoading}
            chartError={chartError}
            chartChange={chartChange}
            range={range}
            setRange={setRange}
            refreshChart={refreshChart}
            ranges={RANGES}
            currency={currency}
            chartCurrency={chartCurrency}
          />
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
          marketCapEstimated={marketCapEstimated}
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
        <NetworkFeesCard
          fees={fees}
          mempool={mempool}
          lightning={lightning}
          loading={loading}
          price={price}
          currencySym={currencySym}
        />
      </div>

      {/* Row 6: Supply / Epoch */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
        <SupplyIssuedCard blockHeight={blockHeight} />
        <div className="lg:col-span-3">
          <HalvingCountdown blockHeight={blockHeight} />
        </div>
      </div>

      {/* Supporters ticker. The breakpoint lives here rather than inside the two
          cards: a card that hides itself cannot be reused at another width, and
          both roots carried their own `mt-4` besides. */}
      <div className="mt-4 hidden md:block">
        <SupporterTickerCard donors={donors} />
      </div>
      <div className="mt-4 md:hidden">
        <MobileSupportersCard donors={donors} />
      </div>

      {/* Newsletter signup */}
      <div className="mt-4">
        <NewsletterCard />
      </div>

      {/* Privacy note */}
      <p className="mt-2 text-center text-xs text-quiet">
        By subscribing you agree to our{' '}
        <a
          href="https://www.beehiiv.com/privacy?utm_source=satoshi%27s_weekly_brief"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:text-accent-hover"
        >
          Privacy Policy
        </a>
      </p>

      {/* Donation card */}
      <div className="mt-4">
        <DonationCard />
      </div>

      <SatoshiQuote />

      <p className="py-4 text-center text-xs text-quiet">© 2026 Bitcoin Vibe Check · MIT Licence</p>

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
          pushStatus={pushStatus}
          pushBusy={pushBusy}
          pushFailReason={pushFailReason}
          onEnablePush={enablePush}
          onDisablePush={unsubscribePush}
          onClose={() => setIsPriceAlertsOpen(false)}
        />
      )}

      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        cardData={{ ...(data ?? {}), chainData, ma200, vibe }}
        sentimentSummary={vibeSummary}
        currency={currency}
        theme={theme}
      />

      <Analytics />

    </div>
  )
}
