import { computeIssuedSupply } from '../lib/calculations.js'
import Skeleton from './Skeleton.jsx'

export default function SupplyIssuedCard({ blockHeight }) {
  return (
    <div data-testid="card-supply-issued" className="rounded-2xl bg-gray-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Supply Issued</p>
      {blockHeight != null ? (
        <>
          <p className="mt-2 text-lg font-bold text-white">
            {computeIssuedSupply(blockHeight).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}&nbsp;BTC
          </p>
          <p className="mt-0.5 text-xs text-gray-500">of 21,000,000 maximum</p>
        </>
      ) : (
        <Skeleton className="mt-2 h-7 w-36" />
      )}
    </div>
  )
}
