import CardTooltip from './CardTooltip.jsx'
import Skeleton from './Skeleton.jsx'

const BTC_PRICE_TOOLTIP = 'Spot price sourced from Kraken WebSocket, updated in real time. The price chart shows closing price across your selected time range.'

// The formula is published here on purpose. A composite index that hides its
// arithmetic deserves the "made-up number" criticism it will get.
const VIBE_TOOLTIP = 'A 0–100 read on how hot the market is running, composed from data already on this page: sentiment 30% (Fear & Greed), valuation 30% (Mayer Multiple and MVRV), momentum 25% (30-day price change), congestion 10% (fee tier and mempool), network 5% (30-day hash-rate trend). Each input is scaled to 0–100 where higher means hotter, then the weights are renormalised over whatever inputs are available. 100 is euphoric, 0 is frozen. A summary of public metrics, not advice.'

const VIBE_LABEL_COLOR = {
  'Ice Cold':   'text-sky-400',
  'Cold':       'text-cyan-400',
  'Cool':       'text-teal-400',
  'Warm':       'text-amber-400',
  'Hot':        'text-orange-400',
  'Overheated': 'text-red-400',
}

// Short labels for the breakdown. The header already carries the sentence, so
// the card shows the components themselves — which is also what makes the
// weights arguable rather than asserted.
const VIBE_DIMENSIONS = [
  ['sentiment',  'Sentiment'],
  ['valuation',  'Valuation'],
  ['momentum',   'Momentum'],
  ['congestion', 'Mempool'],
  ['network',    'Network'],
]

function VibeBreakdown({ dimensions }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-7 gap-y-1">
      {VIBE_DIMENSIONS.map(([key, label]) => {
        const value = dimensions?.[key]
        return (
          <div key={key} className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-600">{label}</span>
            <span className={`text-xs font-semibold tabular-nums ${value == null ? 'text-gray-700' : 'text-gray-300'}`}>
              {value == null ? '—' : Math.round(value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function VibeScoreSection({ vibe, loading }) {
  return (
    // md:mt-auto pins this to the bottom of the card on desktop, where the row
    // height is set by the taller chart card beside it. That space was empty.
    <div className="mt-4 border-t border-gray-800 pt-4 md:mt-auto md:pt-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 flex items-center">
        Vibe Score<CardTooltip text={VIBE_TOOLTIP} />
      </p>

      {vibe == null ? (
        loading
          ? <Skeleton className="mt-2 h-10 w-28" />
          : (
            <>
              <p className="mt-2 text-3xl font-bold text-gray-600 md:text-4xl">—</p>
              <p className="mt-1.5 text-xs text-gray-500">Not enough live data to score</p>
            </>
          )
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2.5">
            <p data-testid="vibe-score" className="text-3xl font-bold text-orange-400 md:text-4xl">
              {vibe.score}
            </p>
            <p
              data-testid="vibe-label"
              className={`text-sm font-semibold md:text-base ${VIBE_LABEL_COLOR[vibe.label] ?? 'text-gray-400'}`}
            >
              {vibe.label}
            </p>
          </div>
          <VibeBreakdown dimensions={vibe.dimensions} />
          {/* Counts raw inputs, not dimensions — valuation reporting a number
              off Mayer alone is still a degraded reading, and MVRV is the input
              that actually goes missing. */}
          {vibe.inputsUsed < vibe.inputsTotal && (
            <p className="mt-2 text-[10px] text-gray-600">
              Scored on {vibe.inputsUsed} of {vibe.inputsTotal} inputs
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default function BtcPriceCard({ value, change, sub, athPct, vibe = null, vibeLoading = false }) {
  const changePositive = change != null && change >= 0
  const isAtATH = athPct != null && athPct >= -0.1
  return (
    <div data-testid="card-btc-price" className="rounded-2xl bg-gray-900 p-6 h-full flex flex-col">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 flex items-center">BTC Price<CardTooltip text={BTC_PRICE_TOOLTIP} /></p>
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

      <VibeScoreSection vibe={vibe} loading={vibeLoading} />
    </div>
  )
}
