import { calcFiatFee } from '../lib/calculations.js'
import CardTooltip from './CardTooltip.jsx'
import Skeleton from './Skeleton.jsx'
import { backlogBand } from '../lib/scales.js'
import { mempoolBacklogBlocks, backlogBarPct } from '../lib/mempool.js'
import { readFeeTiers, FLAT_CAPTION } from '../lib/feeTiers.js'
import { CARD, CARD_LABEL, CARD_VALUE } from '../lib/typography.js'

const FEES_TOOLTIP = 'Fee rates in sat/vbyte for getting into the next block, into about three blocks, or into about six. Fiat estimates assume a standard 250-vbyte transaction -- a typical single-input transfer. Tiers are shown in blocks rather than minutes because a block interval is random: it averages ten minutes, but half arrive inside seven and one in ten takes over twenty-three. When every tier carries the same rate there is no premium for priority, and the card shows that one figure rather than printing one price three times. Congestion is measured as blocks of backlog bidding above the 1 sat/vbyte relay floor, not as the total size of the mempool: most of that total is transactions at the floor that do not clear, so it stays near 40 MB whether the chain is busy or idle.'

export default function NetworkFeesCard({ fees, mempool, lightning, loading, price, currencySym }) {
  // Blocks of backlog bidding above the relay floor — the same figure the Vibe
  // Score's congestion dimension reads, so the label here and the number inside
  // the score are one measure rather than two that can disagree. It was the
  // mempool's *total vsize* until v1.22.0, which answered "Moderate" on all 50
  // captured days; `src/lib/mempool.js` has the measurement and the reason.
  //
  // `null` when the histogram is missing or in a shape that module refuses, and
  // the whole row is then hidden: an unreadable mempool is not a clear one, and
  // there is no honest band to draw for it.
  const backlog = mempoolBacklogBlocks(mempool)
  const cg  = backlogBand(backlog)
  const pct = backlogBarPct(backlog) ?? 0

  const tiers = readFeeTiers(fees)

  const fiatStr = feeRate => {
    const f = price > 0 ? calcFiatFee(feeRate, price) : null
    return f == null ? null : `≈ ${currencySym}${f >= 0.10 ? f.toFixed(2) : f.toFixed(4)}`
  }
  const flatFiat = tiers?.flat ? fiatStr(tiers.rate) : null

  return (
    <div data-testid="card-network-fees" className={`${CARD} flex flex-col gap-4 justify-between`}>
      <h2 className={`${CARD_LABEL} flex items-center`}>Network Fees<CardTooltip text={FEES_TOOLTIP} /></h2>

      {/* Congestion indicator — hidden gracefully if mempool fetch failed */}
      {cg != null && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className={CARD_LABEL}>Mempool Congestion</p>
            <span className={`text-xs font-semibold ${cg.text}`}>{cg.label}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
            <div className={`h-full rounded-full ${cg.bar}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-quiet tabular-nums">
            {backlog < 0.1 ? 'under 0.1' : backlog.toFixed(1)} blocks of backlog
            {mempool?.count != null && ` · ${mempool.count.toLocaleString('en-US')} unconfirmed`}
          </p>
        </div>
      )}

      {/* Fee tiers — one figure when every tier carries the same rate, because
          three prices that are one price under three different waits reads as a
          choice that does not exist. `src/lib/feeTiers.js` has the measurement. */}
      {loading || !fees
        ? (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        )
        : tiers == null
          ? <p className="text-xs text-quiet">Fee rates unavailable</p>
          : tiers.flat
            ? (
              <div data-testid="fees-flat" className="rounded-xl bg-raised px-3 py-4">
                <p className={CARD_LABEL}>Every Tier</p>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className={`${CARD_VALUE.dense} text-accent tabular-nums`}>{tiers.rate}</span>
                  <span className="text-xs text-quiet">sat/vB</span>
                  {flatFiat && <span className="text-xs text-quiet tabular-nums">{flatFiat}</span>}
                </div>
                <p className="mt-1 text-xs text-quiet">{FLAT_CAPTION}</p>
              </div>
            )
            : (
              <div className="grid grid-cols-3 gap-2">
                {tiers.tiers.map(({ label, blocks, value }) => (
                  <div key={label} className="flex flex-col justify-center rounded-xl bg-raised px-2 py-3 md:px-3 md:py-4">
                    <p className={CARD_LABEL}>{label}</p>
                    <div className="mt-1.5 flex items-baseline gap-0.5 md:gap-1">
                      <span className={`${CARD_VALUE.dense} text-accent tabular-nums`}>{value}</span>
                      <span className="text-xs text-quiet">sat/vB</span>
                    </div>
                    <p className="mt-0.5 text-xs text-quiet">{blocks}</p>
                    {fiatStr(value) && <p className="mt-0.5 text-xs text-quiet tabular-nums">{fiatStr(value)}</p>}
                  </div>
                ))}
              </div>
            )
      }

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
