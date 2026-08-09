import { useState, useEffect } from 'react'
import { blocksToNextHalving, epochPercentage } from '../utils.js'
import CardTooltip from './CardTooltip.jsx'
import Skeleton from './Skeleton.jsx'

const HALVING_TOOLTIP = 'Every 210,000 blocks (~4 years), the reward paid to miners is cut in half, reducing new BTC issuance. Each of the four previous halvings preceded significant price appreciation in the following 12–18 months. Past performance is not indicative of future results.'

export default function HalvingCountdown({ blockHeight }) {
  // Anchor the countdown to a wall-clock deadline and tick `now`, rather than
  // decrementing a counter once a second. Browsers throttle timers in
  // background tabs, so a decrementing counter drifts further behind real time
  // the longer the tab is hidden; deriving from a deadline stays accurate.
  const [deadline, setDeadline] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (blockHeight == null) return
    const secs = Math.max(0, blocksToNextHalving(blockHeight)) * 10 * 60
    // Re-anchoring to a new chain tip is a genuine external-system sync: there
    // is no pure render-time expression for "10 minutes per remaining block,
    // measured from the moment we observed this height".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeadline(Date.now() + secs * 1000)
  }, [blockHeight])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const secsLeft = deadline != null ? Math.max(0, Math.round((deadline - now) / 1000)) : null

  const blocksRemaining = blockHeight != null ? Math.max(0, blocksToNextHalving(blockHeight)) : null
  const epochPct        = blockHeight != null ? epochPercentage(blockHeight) : null
  const days  = secsLeft != null ? Math.floor(secsLeft / 86400) : null
  const hours = secsLeft != null ? Math.floor((secsLeft % 86400) / 3600) : null
  const mins  = secsLeft != null ? Math.floor((secsLeft % 3600) / 60) : null
  const estStr = deadline != null
    ? new Date(deadline).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null

  const epochBarContent = epochPct != null ? (
    <>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
        <div className="h-full rounded-full bg-orange-400" style={{ width: `${epochPct}%` }} />
      </div>
      <p className="mt-1 text-xs text-gray-400">
        <span className="font-semibold text-white">{Math.round(epochPct)}%</span>
        <span className="ml-1 text-gray-450">of current epoch complete</span>
      </p>
    </>
  ) : <Skeleton className="h-2 w-full" />

  return (
    <div className="rounded-2xl bg-gray-900 p-4 mb-4">

      {/* Mobile: two columns top row + epoch bar below */}
      <div className="flex md:hidden flex-col gap-2">
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-450 flex items-center">Blocks to Halving<CardTooltip text={HALVING_TOOLTIP} /></p>
            {blocksRemaining != null
              ? <p className="mt-1 text-xl font-bold text-orange-400 tabular-nums">
                  {blocksRemaining.toLocaleString('en-US')}
                </p>
              : <Skeleton className="mt-1 h-7 w-20" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-450">Estimated Time</p>
            {secsLeft != null
              ? <>
                  <p className="mt-1 text-xl font-bold text-white tabular-nums">
                    {days}d {hours}h {mins}m
                  </p>
                  {estStr && <p className="text-xs text-gray-450">est. {estStr}</p>}
                </>
              : <Skeleton className="mt-1 h-7 w-28" />
            }
          </div>
        </div>
        <div>{epochBarContent}</div>
      </div>

      {/* Desktop: three columns side by side */}
      <div className="hidden md:flex gap-0">

        <div className="flex-1 pr-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-450">Blocks to Halving</p>
          {blocksRemaining != null
            ? <p className="mt-1.5 text-2xl font-bold text-orange-400 tabular-nums">
                {blocksRemaining.toLocaleString('en-US')}
              </p>
            : <Skeleton className="mt-1.5 h-8 w-28" />
          }
        </div>

        <div className="w-px self-stretch bg-gray-800" />

        <div className="flex-1 px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-450">Estimated Time</p>
          {secsLeft != null
            ? <>
                <p className="mt-1.5 text-2xl font-bold text-white tabular-nums">
                  {days}d {hours}h {mins}m
                </p>
                {estStr && <p className="mt-1 text-sm text-gray-450">est. {estStr}</p>}
              </>
            : <Skeleton className="mt-1.5 h-8 w-40" />
          }
        </div>

        <div className="w-px self-stretch bg-gray-800" />

        <div className="flex-1 pl-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-450">Epoch Progress</p>
          <div className="mt-2">{epochBarContent}</div>
        </div>

      </div>
    </div>
  )
}
