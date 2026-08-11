import { useState, useEffect } from 'react'
import CardTooltip from './CardTooltip.jsx'
import Icon from './Icon.jsx'
import Skeleton from './Skeleton.jsx'
import { describeDifficulty } from './seriesLabel.js'
import { CARD, CARD_LABEL, CARD_VALUE } from '../lib/typography.js'

const HASH_RATE_TOOLTIP  = 'Total computational power securing the Bitcoin network, measured in exahashes per second. Rising hash rate signals miner confidence; a sharp drop can signal miner stress or capitulation.'
const DIFFICULTY_TOOLTIP = 'Adjusts every ~2,016 blocks (~2 weeks) to keep average block times near 10 minutes. A positive adjustment means blocks were found faster than target — network is growing. Negative means slower — miners left or difficulty was too high.'

function DifficultyBar({ change }) {
  const capped = change != null ? Math.max(-10, Math.min(10, change)) : 0
  const pct    = Math.abs(capped) / 10 * 50
  const isPositive = capped >= 0
  return (
    <div className="mt-3">
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-raised"
        role="img"
        aria-label={describeDifficulty(change)}
      >
        {change != null && (
          <div
            className={`absolute top-0 h-full ${isPositive ? 'left-1/2' : 'right-1/2'} bg-accent`}
            style={{ width: `${pct}%` }}
          />
        )}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-px bg-line-strong" />
      </div>
      {/* The bar's axis. `aria-hidden` because `describeDifficulty` already
          names both ends inside the label above — announcing them again would
          read as two stray words after a sentence that just said them. */}
      <div className="mt-1 flex justify-between" aria-hidden="true">
        <span className="text-xs text-quiet">Slower</span>
        <span className="text-xs text-quiet">Faster</span>
      </div>
    </div>
  )
}

function diffInterpretation(change) {
  if (change == null) return null
  if (change < -4)  return { text: 'Miners Slowing Fast',   cls: 'text-quiet' }
  if (change < -1)  return { text: 'Miners Slowing',        cls: 'text-quiet' }
  if (change <= 1)  return { text: 'Stable',                cls: 'text-quiet' }
  if (change <= 4)  return { text: 'Miners Speeding Up',    cls: 'text-quiet' }
  return                   { text: 'Miners Speeding Up Fast', cls: 'text-quiet' }
}

export default function NetworkPulseCard({ difficulty, loading, hashRateTrend }) {
  const diffChange      = difficulty?.difficultyChange ?? null
  const remainingBlocks = difficulty?.remainingBlocks ?? null
  const diffDays        = remainingBlocks != null
    ? Math.round(remainingBlocks * 10 / 60 / 24)
    : null
  const diffInterp      = diffInterpretation(diffChange)

  const [hashRate, setHashRate] = useState(null)
  useEffect(() => {
    fetch('https://mempool.space/api/v1/mining/hashrate/3d')
      .then(r => r.json())
      .then(json => {
        if (json?.currentHashrate != null) {
          setHashRate((json.currentHashrate / 1e18).toFixed(1))
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div data-testid="card-network-pulse" className={`${CARD} h-full`}>
      <h2 className={CARD_LABEL}>Network Health</h2>

      {/* Row 1: Hash Rate | Difficulty */}
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <p className={`${CARD_LABEL} flex items-center`}>Hash Rate<CardTooltip text={HASH_RATE_TOOLTIP} /></p>
          <div className="mt-2">
            {hashRate != null
              ? <p className={`${CARD_VALUE.base} text-accent tabular-nums`}>{hashRate} <span className="text-base font-semibold">EH/s</span></p>
              : <Skeleton className="h-8 w-20" />
            }
            {hashRate != null && hashRateTrend != null && (
              <p className={`mt-1 flex items-center gap-1 text-xs font-medium tabular-nums ${hashRateTrend >= 0 ? 'text-up' : 'text-down'}`}>
                <Icon name={hashRateTrend >= 0 ? 'triangle-up' : 'triangle-down'} size="sm" />
                {hashRateTrend >= 0 ? '+' : ''}{hashRateTrend.toFixed(1)}% (30d)
              </p>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <p className={`${CARD_LABEL} flex items-center`}>Difficulty<CardTooltip text={DIFFICULTY_TOOLTIP} /></p>
          <div className="mt-2">
            {loading
              ? <Skeleton className="h-8 w-16" />
              : diffChange == null
                ? <p className={`${CARD_VALUE.base} text-quiet`}>—</p>
                : <p className={`${CARD_VALUE.base} text-accent tabular-nums`}>
                    {diffChange >= 0 ? '+' : ''}{diffChange.toFixed(1)}%
                  </p>
            }
            <p className={`mt-1 text-sm ${diffInterp ? diffInterp.cls : 'text-quiet'}`}>
              {loading ? ' ' : diffInterp ? diffInterp.text : (diffChange == null ? 'Unavailable' : ' ')}
            </p>
            <p className="mt-1 text-xs text-quiet tabular-nums">
              {loading
                ? ' '
                : remainingBlocks != null
                  ? `in ${remainingBlocks.toLocaleString('en-US')} blocks (~${diffDays}d)`
                  : ' '
              }
            </p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mt-4 border-t border-line" />

      {/* Difficulty Adjustment bar (full width) */}
      <div className="mt-3">
        <p className={CARD_LABEL}>Difficulty Adjustment</p>
        <DifficultyBar change={loading ? null : diffChange} />
      </div>
    </div>
  )
}
