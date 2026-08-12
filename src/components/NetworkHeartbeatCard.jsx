import NetworkHeartbeat from './NetworkHeartbeat.jsx'
import { CARD, CARD_LABEL } from '../lib/typography.js'

/**
 * The heartbeat as a card of its own — mobile only. On desktop the same
 * interior is merged into the top of `RecentBlocksCard` instead, which is why
 * the interior lives in `NetworkHeartbeat.jsx` and this file is a frame around
 * it. The two are not one component because they are two cards at two grid
 * positions, not one card at two widths.
 */
export default function NetworkHeartbeatCard({ blockHeight, difficulty, lastBlockTs, loading }) {
  return (
    <div className={`${CARD} h-full`}>
      <h2 className={CARD_LABEL}>Network Heartbeat</h2>
      <NetworkHeartbeat
        blockHeight={blockHeight}
        difficulty={difficulty}
        lastBlockTs={lastBlockTs}
        loading={loading}
      />
    </div>
  )
}
