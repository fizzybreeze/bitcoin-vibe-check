import { useState, useEffect } from 'react'
import Skeleton from './Skeleton.jsx'
import { blockTimeColors } from './blockTime.js'

export default function NetworkHeartbeatCard({ blockHeight, difficulty, lastBlockTs, loading }) {
  // Tick once a minute so "N min ago" stays current without a re-fetch.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const avgBlockMins = difficulty?.timeAvg != null ? difficulty.timeAvg / 60000 : null
  const colors = blockTimeColors(avgBlockMins)
  const lastBlockMinsAgo = lastBlockTs != null
    ? Math.max(0, Math.floor((now / 1000 - lastBlockTs) / 60))
    : null

  return (
    <div className="rounded-2xl bg-gray-900 p-6 h-full">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-450">Network Heartbeat</p>

      {/* Two-column interior */}
      <div className="mt-3 flex gap-3">

        {/* Block height */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-450">Block Height</p>
          <div className="mt-1">
            {loading || blockHeight == null
              ? <Skeleton className="h-7 w-16" />
              : <p className="text-sm font-bold text-orange-400 tabular-nums md:text-2xl">
                  {blockHeight.toLocaleString('en-US')}
                </p>
            }
          </div>
        </div>

        {/* Avg block time */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-450">Avg Block Time</p>
          <div className="mt-1">
            {loading || avgBlockMins == null
              ? <Skeleton className="h-7 w-12" />
              : <p className={`text-sm font-bold tabular-nums md:text-2xl ${colors.text}`}>
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
        <p className="text-xs text-gray-450">
          {lastBlockMinsAgo != null
            ? `Last block: ${lastBlockMinsAgo} min ago`
            : 'Last block: unknown'
          }
        </p>
      </div>
    </div>
  )
}
