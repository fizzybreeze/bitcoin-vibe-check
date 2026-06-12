import CardTooltip from './CardTooltip.jsx'

const LABEL = 'text-xs font-semibold uppercase tracking-widest text-gray-500'
const VALUE = 'text-3xl font-bold text-orange-400 mt-1'
const SUB   = 'mt-1 text-sm text-gray-400'

const TOOLTIP_TEXT = 'US spot ETFs collectively hold over 1 million BTC, making them the dominant institutional vehicle. The 7-day change in total holdings signals whether institutions are net buyers or sellers. Sustained accumulation has historically coincided with price appreciation.'

function formatBtc(n) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function accumulationSignal(btcHeld, btcHeld7dAgo) {
  if (btcHeld == null || btcHeld7dAgo == null) return null
  const changePct = ((btcHeld - btcHeld7dAgo) / btcHeld7dAgo) * 100
  if (changePct > 0.1)  return { label: 'Accumulating', cls: 'text-green-400',  arrow: '▲' }
  if (changePct < -0.1) return { label: 'Distributing', cls: 'text-red-400',    arrow: '▼' }
  return                       { label: 'Neutral',       cls: 'text-yellow-400', arrow: '—' }
}

export default function InstitutionalPulseCard({ btcHeld, btcHeld7dAgo, dataDate, isLoading, error }) {
  const signal = accumulationSignal(btcHeld, btcHeld7dAgo)
  const change = btcHeld != null && btcHeld7dAgo != null ? btcHeld - btcHeld7dAgo : null

  // 1. Loading — always show skeleton while fetch is in flight
  if (isLoading) {
    return (
      <div className="rounded-2xl bg-gray-900 p-4 md:p-6 flex flex-col gap-3 h-full">
        <p className={`${LABEL} flex items-center`}>Institutional Pulse<CardTooltip text={TOOLTIP_TEXT} /></p>
        <p className="text-xs text-gray-600">US Spot ETF Holdings</p>
        <div className="animate-pulse space-y-2">
          <div className="h-8 w-32 rounded bg-gray-800" />
          <div className="h-4 w-24 rounded bg-gray-800" />
        </div>
      </div>
    )
  }

  // 2. Confirmed fetch error — hide card entirely
  if (error) return null

  // 3. No data but no error — keep skeleton (data may still be absent from API response)
  if (btcHeld == null) {
    return (
      <div className="rounded-2xl bg-gray-900 p-4 md:p-6 flex flex-col gap-3 h-full">
        <p className={`${LABEL} flex items-center`}>Institutional Pulse<CardTooltip text={TOOLTIP_TEXT} /></p>
        <p className="text-xs text-gray-600">US Spot ETF Holdings</p>
        <div className="animate-pulse space-y-2">
          <div className="h-8 w-32 rounded bg-gray-800" />
          <div className="h-4 w-24 rounded bg-gray-800" />
        </div>
      </div>
    )
  }

  // 4. Data present — render normally
  return (
    <div className="rounded-2xl bg-gray-900 p-4 md:p-6 flex flex-col gap-3 h-full">
      <p className={`${LABEL} flex items-center`}>Institutional Pulse<CardTooltip text={TOOLTIP_TEXT} /></p>
      <p className="text-xs text-gray-600">US Spot ETF Holdings</p>
      <div>
        <p className={VALUE}>{formatBtc(btcHeld)}</p>
        <p className={SUB}>BTC held</p>
      </div>
      {signal && (
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${signal.cls}`}>
            {signal.arrow} {signal.label}
          </span>
          {change != null && (
            <span className="text-xs text-gray-500">
              ({change >= 0 ? '+' : ''}{formatBtc(change)} BTC over 7d)
            </span>
          )}
        </div>
      )}
      {dataDate && (
        <p className="text-xs text-gray-600">As of {dataDate}</p>
      )}
    </div>
  )
}
