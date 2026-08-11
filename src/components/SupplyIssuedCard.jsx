import { computeIssuedSupply } from '../lib/calculations.js'
import Skeleton from './Skeleton.jsx'
import { CARD, CARD_LABEL, CARD_VALUE } from '../lib/typography.js'

export default function SupplyIssuedCard({ blockHeight }) {
  return (
    <div data-testid="card-supply-issued" className={CARD}>
      <h2 className={CARD_LABEL}>Supply Issued</h2>
      {blockHeight != null ? (
        <>
          <p className={`mt-2 ${CARD_VALUE.tight} text-ink tabular-nums`}>
            {computeIssuedSupply(blockHeight).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}&nbsp;BTC
          </p>
          <p className="mt-0.5 text-xs text-quiet">of 21,000,000 maximum</p>
        </>
      ) : (
        <Skeleton className="mt-2 h-7 w-36" />
      )}
    </div>
  )
}
