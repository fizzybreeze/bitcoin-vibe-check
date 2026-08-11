import { calcFiatFee } from '../lib/calculations.js'
import CardTooltip from './CardTooltip.jsx'
import Skeleton from './Skeleton.jsx'
import { congestionBand } from '../lib/scales.js'
import { CARD, CARD_LABEL, CARD_VALUE } from '../lib/typography.js'

const FEES_TOOLTIP = 'Fee rates in sat/vbyte across slow, medium, and fast confirmation tiers. Fiat estimates assume a standard 250-vbyte transaction -- a typical single-input transfer. Fees rise during congestion and fall when the mempool is clear.'

export default function NetworkFeesCard({ fees, mempool, lightning, loading, price, currencySym }) {
  // Read from the mempool's virtual size — not to be confused with
  // `computeMempoolPressurePct`, which feeds the Vibe Score's congestion
  // dimension from the transaction *count*. Two measures of the same queue, and
  // the bar below is drawn from vsize too, so the percentage on screen here is
  // not the one inside the score.
  const cg  = mempool != null ? congestionBand(mempool.vsize) : null
  const pct = mempool != null ? Math.min(100, (mempool.vsize / 100_000_000) * 100) : 0

  return (
    <div data-testid="card-network-fees" className={`${CARD} flex flex-col gap-4 justify-between`}>
      <h2 className={`${CARD_LABEL} flex items-center`}>Network Fees<CardTooltip text={FEES_TOOLTIP} /></h2>

      {/* Congestion indicator — hidden gracefully if mempool fetch failed */}
      {mempool != null && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className={CARD_LABEL}>Mempool Congestion</p>
            <span className={`text-xs font-semibold ${cg.text}`}>{cg.label}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
            <div className={`h-full rounded-full ${cg.bar}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-quiet tabular-nums">
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
                <div key={label} className="flex flex-col justify-center rounded-xl bg-raised px-2 py-3 md:px-3 md:py-4">
                  <p className={CARD_LABEL}>{label}</p>
                  <div className="mt-1.5 flex items-baseline gap-0.5 md:gap-1">
                    <span className={`${CARD_VALUE.dense} text-accent tabular-nums`}>{value}</span>
                    <span className="text-xs text-quiet">sat/vB</span>
                  </div>
                  <p className="mt-0.5 text-xs text-quiet">{time}</p>
                  {fiatStr && <p className="mt-0.5 text-xs text-quiet tabular-nums">{fiatStr}</p>}
                </div>
              )
            })
        }
      </div>

      {/* Lightning Network */}
      <div className="h-px bg-raised" />
      <div>
        <p className={`${CARD_LABEL} mb-2`}>Lightning Network</p>
        {loading && !lightning
          ? <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}
            </div>
          : lightning?.latest
            ? (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className={CARD_LABEL}>Capacity</p>
                  <div className="mt-1 flex items-baseline gap-0.5">
                    <span className="text-base font-bold text-accent tabular-nums">
                      {(lightning.latest.total_capacity / 1e8).toFixed(1)}
                    </span>
                    <span className="text-xs text-quiet">BTC</span>
                  </div>
                </div>
                <div>
                  <p className={CARD_LABEL}>Nodes</p>
                  <p className="mt-1 text-base font-bold text-accent tabular-nums">
                    {lightning.latest.node_count.toLocaleString('en-US')}
                  </p>
                </div>
                <div>
                  <p className={CARD_LABEL}>Channels</p>
                  <p className="mt-1 text-base font-bold text-accent tabular-nums">
                    {lightning.latest.channel_count.toLocaleString('en-US')}
                  </p>
                </div>
              </div>
            )
            : <p className="text-xs text-quiet">Unavailable</p>
        }
      </div>
    </div>
  )
}
