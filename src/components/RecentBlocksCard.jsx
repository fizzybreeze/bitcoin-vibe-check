import { useState, useEffect } from 'react'
import CardTooltip from './CardTooltip.jsx'
import Skeleton from './Skeleton.jsx'
import { blockTimeColors } from './blockTime.js'

const RECENT_BLOCKS_TOOLTIP = 'Shows the last few blocks added to the Bitcoin blockchain. The target interval between blocks is 10 minutes. Blocks arriving significantly faster or slower than that indicate a recent change in hash rate or an imminent difficulty adjustment.'

export default function RecentBlocksCard({ blockHeight, difficulty, lastBlockTs, loading }) {
  const [blocks, setBlocks] = useState(null)
  const [now, setNow]       = useState(() => Date.now())

  // Fetch on mount and immediately when a new block is detected
  useEffect(() => {
    const controller = new AbortController()
    fetch('https://mempool.space/api/v1/blocks', { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { if (Array.isArray(data)) setBlocks(data.slice(0, 5)) })
      .catch(() => {})
    return () => controller.abort()
  }, [blockHeight])

  // 60-second background poll
  useEffect(() => {
    const id = setInterval(() => {
      fetch('https://mempool.space/api/v1/blocks')
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => { if (Array.isArray(data)) setBlocks(data.slice(0, 5)) })
        .catch(() => {})
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  // Live timestamps — tick every second, no re-fetch needed
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  function timeAgo(ts) {
    const secs = Math.floor(now / 1000 - ts)
    if (secs < 60)  return `${secs}s ago`
    const mins = Math.floor(secs / 60)
    if (mins < 60)  return `${mins} min ago`
    return `${Math.floor(mins / 60)}h ago`
  }

  const avgBlockMins = difficulty?.timeAvg != null ? difficulty.timeAvg / 60000 : null
  const colors = blockTimeColors(avgBlockMins)
  // Derived from the ticking `now` state (same source as timeAgo) rather than
  // Date.now(), so this stays pure and updates on the same 1s cadence.
  const lastBlockMinsAgo = lastBlockTs != null
    ? Math.max(0, Math.floor((now / 1000 - lastBlockTs) / 60))
    : null

  return (
    <div data-testid="card-recent-blocks" className="rounded-2xl bg-gray-900 p-6 h-full">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 flex items-center">Recent Blocks<CardTooltip text={RECENT_BLOCKS_TOOLTIP} /></p>

      {/* Heartbeat header — desktop only, merged above the block list */}
      <div className="hidden lg:block">
        <div className="mt-3 flex gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Block Height</p>
            <div className="mt-1">
              {loading || blockHeight == null
                ? <Skeleton className="h-7 w-16" />
                : <p className="text-sm font-bold text-orange-400 tabular-nums md:text-2xl">
                    {blockHeight.toLocaleString('en-US')}
                  </p>
              }
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Avg Block Time</p>
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
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {!loading && (
            <span key={blockHeight ?? 'init'} className="relative inline-flex h-2 w-2 shrink-0">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${colors.bg}`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${colors.bg}`} />
            </span>
          )}
          <p className="text-xs text-gray-500">
            {lastBlockMinsAgo != null
              ? `Last block: ${lastBlockMinsAgo} min ago`
              : 'Last block: unknown'
            }
          </p>
        </div>
        <div className="mt-3 border-t border-gray-700" />
      </div>

      {blocks == null ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : (
        <div className="mt-3">
          {blocks.map((block, i) => (
            <div key={block.id}>
              {i > 0 && <div className="border-t border-gray-700" />}
              <div className="flex items-start justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <a
                    href={`https://mempool.space/block/${block.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base font-bold text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    {block.height.toLocaleString('en-US')}
                  </a>
                  <p className="mt-0.5 text-xs text-gray-600 flex flex-wrap items-center gap-x-1">
                    <span>{block.tx_count.toLocaleString('en-US')} txs</span>
                    <span className="text-gray-700">·</span>
                    <span>
                      {block.extras?.totalFees != null
                        ? `${(block.extras.totalFees / 1e8).toFixed(3)} BTC in fees`
                        : '—'}
                    </span>
                    {block.extras?.avgFeeRate > 0 && (
                      <>
                        <span className="text-gray-700">·</span>
                        <span>avg {block.extras.avgFeeRate} sat/vB</span>
                      </>
                    )}
                  </p>
                </div>
                <p className="text-xs text-gray-600 shrink-0 pt-0.5">{timeAgo(block.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
