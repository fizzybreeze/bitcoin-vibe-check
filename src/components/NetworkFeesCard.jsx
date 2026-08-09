import { calcFiatFee } from '../lib/calculations.js'
import CardTooltip from './CardTooltip.jsx'
import Skeleton from './Skeleton.jsx'

const FEES_TOOLTIP = 'Fee rates in sat/vbyte across slow, medium, and fast confirmation tiers. Fiat estimates assume a standard 250-vbyte transaction -- a typical single-input transfer. Fees rise during congestion and fall when the mempool is clear.'

// Mempool virtual size → a label and the Tailwind classes to draw it in.
// Private to this card, and not in `lib/calculations.js`, for the reason
// `blockTime.js` is not either: it returns class names, not numbers.
//
// Not to be confused with `computeMempoolPressurePct`, which feeds the Vibe
// Score's congestion dimension: that reads the transaction *count*, this reads
// vsize. Two different measures of the same queue, and the bar below is drawn
// from vsize too — so the percentage on screen here is not the one in the score.
function mempoolCongestion(vsize) {
  if (vsize == null) return null
  if (vsize < 5_000_000)  return { label: 'Low',      cls: 'text-green-400',  bar: 'bg-green-400'  }
  if (vsize <= 50_000_000) return { label: 'Moderate', cls: 'text-orange-400', bar: 'bg-orange-400' }
  return                           { label: 'High',     cls: 'text-red-400',    bar: 'bg-red-400'    }
}

export default function NetworkFeesCard({ fees, mempool, lightning, loading, price, currencySym }) {
  const cg  = mempool != null ? mempoolCongestion(mempool.vsize) : null
  const pct = mempool != null ? Math.min(100, (mempool.vsize / 100_000_000) * 100) : 0

  return (
    <div data-testid="card-network-fees" className="rounded-2xl bg-gray-900 p-4 md:p-6 flex flex-col gap-4 justify-between">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-450 flex items-center">Network Fees<CardTooltip text={FEES_TOOLTIP} /></p>

      {/* Congestion indicator — hidden gracefully if mempool fetch failed */}
      {mempool != null && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-450">Mempool Congestion</p>
            <span className={`text-xs font-semibold ${cg.cls}`}>{cg.label}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
            <div className={`h-full rounded-full ${cg.bar}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-gray-450">
            {mempool.count.toLocaleString('en-US')} unconfirmed transactions
          </p>
        </div>
      )}

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
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-450">{label}</p>
                  <div className="mt-1.5 flex items-baseline gap-0.5 md:gap-1">
                    <span className="text-lg font-bold text-orange-400 md:text-2xl">{value}</span>
                    <span className="text-xs text-gray-450">sat/vB</span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-450">{time}</p>
                  {fiatStr && <p className="mt-0.5 text-xs text-gray-450">{fiatStr}</p>}
                </div>
              )
            })
        }
      </div>

      {/* Lightning Network */}
      <div className="h-px bg-gray-800" />
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-450">Lightning Network</p>
        {loading && !lightning
          ? <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}
            </div>
          : lightning?.latest
            ? (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-450">Capacity</p>
                  <div className="mt-1 flex items-baseline gap-0.5">
                    <span className="text-base font-bold text-orange-400">
                      {(lightning.latest.total_capacity / 1e8).toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-450">BTC</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-450">Nodes</p>
                  <p className="mt-1 text-base font-bold text-orange-400">
                    {lightning.latest.node_count.toLocaleString('en-US')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-450">Channels</p>
                  <p className="mt-1 text-base font-bold text-orange-400">
                    {lightning.latest.channel_count.toLocaleString('en-US')}
                  </p>
                </div>
              </div>
            )
            : <p className="text-xs text-gray-450">Unavailable</p>
        }
      </div>
    </div>
  )
}
