import { ResponsiveContainer, LineChart, Line } from 'recharts'
import CardTooltip from './CardTooltip.jsx'
import Skeleton from './Skeleton.jsx'

// Keyed by the classification alternative.me sends, not by the number. Their
// bands are theirs to move, and the label is what the reader sees — the same
// rule `vibePalette.js` applies to the link-preview card.
const FNG_COLOR = {
  'Extreme Fear': 'text-red-400',
  'Fear':         'text-amber-400',
  'Neutral':      'text-yellow-400',
  'Greed':        'text-lime-400',
  'Extreme Greed':'text-green-400',
}

const FNG_TOOLTIP = 'A composite sentiment score from 0 (extreme fear) to 100 (extreme greed). Values below 25 have historically preceded recoveries; above 75 have preceded corrections. Measures crowd psychology, not fundamentals.'

export default function MarketSentimentCard({ fng, fngHistory, loading }) {
  const fngScore = fng?.value != null ? parseInt(fng.value, 10) : null
  const fngClass = fng?.value_classification ?? null

  return (
    <div data-testid="card-market-sentiment" className="rounded-2xl bg-gray-900 p-6 h-full">
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
