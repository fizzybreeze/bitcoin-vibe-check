import { useState, useEffect } from 'react'
import Skeleton from './Skeleton.jsx'
import { blockTimeBand } from '../lib/scales.js'
import { CARD_LABEL, CARD_VALUE } from '../lib/typography.js'

/**
 * The heartbeat interior — block height, average block time and the last-block
 * line with its breathing dot. **Not a card**: it has no shell and no heading,
 * because it is rendered in two different frames.
 *
 * It existed twice, hand-written, in `NetworkHeartbeatCard` (the mobile card)
 * and inside `RecentBlocksCard`'s `hidden lg:block` header. The two agreeing
 * was a thing somebody had to keep doing by hand, and v1.8.7 found they had
 * already stopped: the mobile copy rendered the block height at `text-sm` while
 * the desktop copy carried the identical class in a subtree that could never
 * render at that width, so *neither* was visibly wrong and the drift was
 * invisible from either side. That is the failure this file removes — one
 * source of markup, so a change to it cannot reach one breakpoint and not the
 * other.
 *
 * It owns its own minute tick rather than taking `now` as a prop. A consumer
 * that must remember to pass a clock is a consumer that can forget to, and the
 * figure it drives is whole minutes — the desktop copy previously rode
 * `RecentBlocksCard`'s one-second tick, which is finer than the number it
 * prints has ever been.
 */
export default function NetworkHeartbeat({ blockHeight, difficulty, lastBlockTs, loading }) {
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
    <div data-testid="network-heartbeat">
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
        <p className="text-xs text-quiet tabular-nums">
          {lastBlockMinsAgo != null
            ? `Last block: ${lastBlockMinsAgo} min ago`
            : 'Last block: unknown'
          }
        </p>
      </div>
    </div>
  )
}
