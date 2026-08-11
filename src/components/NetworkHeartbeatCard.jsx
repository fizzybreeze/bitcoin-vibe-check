import { useState, useEffect } from 'react'
import Skeleton from './Skeleton.jsx'
import { blockTimeBand } from '../lib/scales.js'
import { CARD, CARD_LABEL, CARD_VALUE } from '../lib/typography.js'

export default function NetworkHeartbeatCard({ blockHeight, difficulty, lastBlockTs, loading }) {
  // Tick once a minute so "N min ago" stays current without a re-fetch.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const avgBlockMins = difficulty?.timeAvg != null ? difficulty.timeAvg / 60000 : null
  const colors = blockTimeBand(avgBlockMins)
  const lastBlockMinsAgo = lastBlockTs != null
    ? Math.max(0, Math.floor((now / 1000 - lastBlockTs) / 60))
    : null

  return (
    <div className={`${CARD} h-full`}>
      <h2 className={CARD_LABEL}>Network Heartbeat</h2>

      {/* Two-column interior */}
      <div className="mt-3 flex gap-3">

        {/* Block height */}
        <div className="flex-1 min-w-0">
          <p className={CARD_LABEL}>Block Height</p>
          <div className="mt-1">
            {loading || blockHeight == null
              ? <Skeleton className="h-7 w-16" />
              : <p className={`${CARD_VALUE.dense} text-accent tabular-nums`}>
                  {blockHeight.toLocaleString('en-US')}
                </p>
            }
          </div>
        </div>

        {/* Avg block time */}
        <div className="flex-1 min-w-0">
          <p className={CARD_LABEL}>Avg Block Time</p>
          <div className="mt-1">
            {loading || avgBlockMins == null
              ? <Skeleton className="h-7 w-12" />
              : <p className={`${CARD_VALUE.dense} tabular-nums ${colors.text}`}>
                  {avgBlockMins.toFixed(1)} min
                </p>
            }
          </div>
        </div>

      </div>

      {/* Last block line with breathing dot */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {!loading && (
          <span key={blockHeight ?? 'init'} className="relative inline-flex h-2 w-2 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${colors.bg}`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${colors.bg}`} />
          </span>
        )}
        <p className="text-xs text-quiet">
          {lastBlockMinsAgo != null
            ? `Last block: ${lastBlockMinsAgo} min ago`
            : 'Last block: unknown'
          }
        </p>
      </div>
    </div>
  )
}
