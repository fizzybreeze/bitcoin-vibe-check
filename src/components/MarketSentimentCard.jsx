import { ResponsiveContainer, LineChart, Line } from 'recharts'
import { describeTrend } from './seriesLabel.js'
import CardTooltip from './CardTooltip.jsx'
import Skeleton from './Skeleton.jsx'
import { fngLabelClass } from '../lib/scales.js'
import { PALETTE } from '../lib/palette.js'
import useTheme from '../hooks/useTheme.js'

const FNG_TOOLTIP = 'A composite sentiment score from 0 (extreme fear) to 100 (extreme greed). Values below 25 have historically preceded recoveries; above 75 have preceded corrections. Measures crowd psychology, not fundamentals.'

export default function MarketSentimentCard({ fng, fngHistory, loading }) {
  // recharts takes a colour as a prop, not a class, so the hex is read from the
  // palette for the theme that is on.
  const { theme } = useTheme()
  const fngScore = fng?.value != null ? parseInt(fng.value, 10) : null
  const fngClass = fng?.value_classification ?? null

  return (
    <div data-testid="card-market-sentiment" className="rounded-2xl bg-surface p-6 h-full">
      <p className="text-xs font-semibold uppercase tracking-widest text-quiet">Market Sentiment</p>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-quiet flex items-center">Fear &amp; Greed<CardTooltip text={FNG_TOOLTIP} /></p>
        <div className="mt-2">
          {loading || fngScore == null
            ? <Skeleton className="h-8 w-10" />
            : <p className="text-2xl font-bold text-accent">{fngScore}</p>
          }
          <p className={`mt-1 text-sm ${fngLabelClass(fngClass)}`}>
            {fngClass ?? (loading ? ' ' : '—')}
          </p>
        </div>
      </div>

      {fngHistory && (
        <div className="mt-3">
          <div
            className="h-20"
            role="img"
            aria-label={describeTrend('Fear and Greed', fngHistory.map(d => d.v), { period: '30 days' })}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fngHistory} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
                <Line type="monotone" dataKey="v" stroke={PALETTE[theme].accent} dot={false} activeDot={false} strokeWidth={1.5} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-quiet">SENTIMENT TREND (30D)</p>
        </div>
      )}
    </div>
  )
}
