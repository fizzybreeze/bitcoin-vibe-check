import { LineChart, Line, ResponsiveContainer } from 'recharts'
import CardTooltip from './CardTooltip.jsx'
import Skeleton from './Skeleton.jsx'
import { hasEnoughVibeHistory, vibeHistoryLabel } from '../lib/vibeHistory.js'
import { describeTrend } from './seriesLabel.js'
import { vibeLabelClass } from '../lib/scales.js'
import { PALETTE } from '../lib/palette.js'
import useTheme from '../hooks/useTheme.js'

const BTC_PRICE_TOOLTIP = 'Spot price sourced from Kraken WebSocket, updated in real time. The price chart shows closing price across your selected time range.'

// The formula is published here on purpose. A composite index that hides its
// arithmetic deserves the "made-up number" criticism it will get.
const VIBE_TOOLTIP = 'A 0–100 read on how hot the market is running, composed from data already on this page: sentiment 30% (Fear & Greed), valuation 30% (Mayer Multiple and MVRV), momentum 25% (30-day price change), congestion 10% (fee tier and mempool), network 5% (30-day hash-rate trend). Each input is scaled to 0–100 where higher means hotter, then the weights are renormalised over whatever inputs are available. 100 is euphoric, 0 is frozen. A summary of public metrics, not advice.'

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
            <span className="text-[10px] uppercase tracking-wider text-quiet">{label}</span>
            <span className={`text-xs font-semibold tabular-nums ${value == null ? 'text-quiet' : 'text-ink-dim'}`}>
              {value == null ? '—' : Math.round(value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// The score's own history, replayed from the daily snapshot rows. Rendered only
// once there are enough points to be a line rather than a rumour — see
// MIN_HISTORY_POINTS. No placeholder below that: an empty slot reading "not
// enough history" under the number is more prominent than the history would be,
// and the card already says everything it can honestly say.
function VibeHistorySparkline({ points }) {
  // recharts takes a colour as a prop, not a class, so it cannot read the
  // stylesheet — the hex comes from the palette for the theme that is on.
  const { theme } = useTheme()

  if (!hasEnoughVibeHistory(points)) return null

  return (
    <div data-testid="vibe-sparkline" className="mt-3">
      <div
        className="h-10"
        role="img"
        aria-label={describeTrend('Vibe Score', points.map(p => p.score), { period: vibeHistoryLabel(points) })}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
            <Line
              type="monotone"
              dataKey="score"
              stroke={PALETTE[theme].accent}
              dot={false}
              activeDot={false}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Labelled by what the line actually covers, never by the window it was
          asked for. Until 30 points exist this names the first day on it. */}
      <p className="mt-1 text-[10px] uppercase tracking-wider text-quiet">
        Vibe trend ({vibeHistoryLabel(points)})
      </p>
    </div>
  )
}

function VibeScoreSection({ vibe, loading, history }) {
  return (
    // md:mt-auto pins this to the bottom of the card on desktop, where the row
    // height is set by the taller chart card beside it. That space was empty.
    <div className="mt-4 border-t border-line-soft pt-4 md:mt-auto md:pt-5">
      {/* h3, not h2 — this is a titled section *inside* the BTC Price card
          rather than a card of its own, and skipping a level is the one way a
          heading outline is worse than no headings at all. */}
      <h3 className="text-xs font-semibold uppercase tracking-widest text-quiet flex items-center">
        Vibe Score<CardTooltip text={VIBE_TOOLTIP} />
      </h3>

      {vibe == null ? (
        loading
          ? <Skeleton className="mt-2 h-10 w-28" />
          : (
            <>
              <p className="mt-2 text-3xl font-bold text-quiet md:text-4xl">—</p>
              <p className="mt-1.5 text-xs text-quiet">Not enough live data to score</p>
            </>
          )
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2.5">
            <p data-testid="vibe-score" className="text-3xl font-bold text-accent tabular-nums md:text-4xl">
              {vibe.score}
            </p>
            <p
              data-testid="vibe-label"
              className={`text-sm font-semibold md:text-base ${vibeLabelClass(vibe.label)}`}
            >
              {vibe.label}
            </p>
          </div>
          <VibeBreakdown dimensions={vibe.dimensions} />
          {/* Counts raw inputs, not dimensions — valuation reporting a number
              off Mayer alone is still a degraded reading, and MVRV is the input
              that actually goes missing. */}
          {vibe.inputsUsed < vibe.inputsTotal && (
            <p className="mt-2 text-[10px] text-quiet">
              Scored on {vibe.inputsUsed} of {vibe.inputsTotal} inputs
            </p>
          )}
          <VibeHistorySparkline points={history} />
        </>
      )}
    </div>
  )
}

export default function BtcPriceCard({ value, change, sub, athPct, vibe = null, vibeLoading = false, vibeHistory = [] }) {
  const changePositive = change != null && change >= 0
  const isAtATH = athPct != null && athPct >= -0.1
  return (
    <div data-testid="card-btc-price" className="rounded-2xl bg-surface p-6 h-full flex flex-col">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-quiet flex items-center">BTC Price<CardTooltip text={BTC_PRICE_TOOLTIP} /></h2>
      {/* Mobile: price left, change+sub right on same row. Desktop: stacked. */}
      <div className="mt-3 md:mt-[30px] flex items-start justify-between md:block">
        <div>
          {value == null
            ? <Skeleton className="h-9 w-32" />
            : <p className="text-2xl font-bold text-accent tabular-nums md:text-3xl">{value}</p>
          }
          {/* ATH distance — left column, all breakpoints */}
          {athPct != null && value != null && (
            isAtATH
              ? <p className="mt-1 text-xs font-medium text-up md:mt-1.5 md:text-sm">AT ATH</p>
              : <p className="mt-1 text-xs text-quiet tabular-nums md:mt-1.5 md:text-sm">{athPct.toFixed(1)}% from ATH</p>
          )}
          {/* Desktop-only stacked change */}
          {change != null && value != null && (
            <p className={`hidden md:block mt-1.5 text-sm font-medium tabular-nums ${changePositive ? 'text-up' : 'text-down'}`}>
              {changePositive ? '▲' : '▼'}&nbsp;{changePositive ? '+' : ''}{change.toFixed(2)}%
            </p>
          )}
          {/* Desktop-only stacked sub */}
          {sub && value != null && (
            <p className="hidden md:block mt-1.5 text-sm text-muted">{sub}</p>
          )}
        </div>
        {/* Mobile-only: change + sub on right */}
        {change != null && value != null && (
          <div className="md:hidden text-right shrink-0 ml-3">
            <p className={`text-sm font-medium tabular-nums ${changePositive ? 'text-up' : 'text-down'}`}>
              {changePositive ? '▲' : '▼'}&nbsp;{changePositive ? '+' : ''}{change.toFixed(2)}%
            </p>
            {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
          </div>
        )}
      </div>

      <VibeScoreSection vibe={vibe} loading={vibeLoading} history={vibeHistory} />
    </div>
  )
}
