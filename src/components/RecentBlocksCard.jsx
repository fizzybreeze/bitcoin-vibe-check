import { useState, useEffect } from 'react'
import CardTooltip from './CardTooltip.jsx'
import NetworkHeartbeat from './NetworkHeartbeat.jsx'
import Skeleton from './Skeleton.jsx'
import { CARD, CARD_LABEL } from '../lib/typography.js'

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

  return (
    <div data-testid="card-recent-blocks" className={`${CARD} h-full`}>
      <h2 className={`${CARD_LABEL} flex items-center`}>Recent Blocks<CardTooltip text={RECENT_BLOCKS_TOOLTIP} /></h2>

      {/* Heartbeat header — desktop only, merged above the block list. Same
          markup as the standalone mobile card, from the same module. */}
      <div className="hidden lg:block">
        <NetworkHeartbeat
          blockHeight={blockHeight}
          difficulty={difficulty}
          lastBlockTs={lastBlockTs}
          loading={loading}
        />
        <div className="mt-3 border-t border-line" />
      </div>

      {blocks == null ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : (
        <div className="mt-3">
          {blocks.map((block, i) => (
            <div key={block.id}>
              {i > 0 && <div className="border-t border-line" />}
              <div className="flex items-start justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <a
                    href={`https://mempool.space/block/${block.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base font-bold text-accent hover:text-accent-hover transition-colors tabular-nums"
                  >
                    {block.height.toLocaleString('en-US')}
                  </a>
                  <p className="mt-0.5 text-xs text-quiet flex flex-wrap items-center gap-x-1 tabular-nums">
                    <span>{block.tx_count.toLocaleString('en-US')} txs</span>
                    <span className="text-quiet">·</span>
                    <span>
                      {block.extras?.totalFees != null
                        ? `${(block.extras.totalFees / 1e8).toFixed(3)} BTC in fees`
                        : '—'}
                    </span>
                    {block.extras?.avgFeeRate > 0 && (
                      <>
                        <span className="text-quiet">·</span>
                        <span>avg {block.extras.avgFeeRate} sat/vB</span>
                      </>
                    )}
                  </p>
                </div>
                {/* Re-rendered every second by the tick below, and every width
                    of digit passes through it — this is the fastest-moving
                    figure on the card and it had no tabular figures at all
                    while the card's entry in `typography.test.js` was being
                    satisfied by the `hidden lg:block` header above. */}
                <p className="text-xs text-quiet shrink-0 pt-0.5 tabular-nums">{timeAgo(block.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
