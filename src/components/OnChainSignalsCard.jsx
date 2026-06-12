import CardTooltip from './CardTooltip.jsx'

const LABEL = 'text-xs font-semibold uppercase tracking-widest text-gray-500'
const VALUE = 'text-3xl font-bold text-orange-400 mt-1'
const SUB   = 'mt-1 text-sm text-gray-400'

const MVRV_TOOLTIP = "Compares Bitcoin's market cap to the aggregate cost basis of all coins. Above 3.5 has historically marked cycle tops; below 1 has marked bottoms. Near 1 means the market is close to its collective break-even."

function mvrvInterpretation(mvrv) {
  if (mvrv == null) return null
  if (mvrv < 1)    return { label: 'Deeply Undervalued',  cls: 'text-green-400'  }
  if (mvrv < 1.5)  return { label: 'Undervalued',         cls: 'text-lime-400'   }
  if (mvrv < 2.4)  return { label: 'Fair Value',          cls: 'text-yellow-400' }
  if (mvrv < 3.7)  return { label: 'Overvalued',          cls: 'text-amber-400'  }
  return                   { label: 'Extremely Overvalued', cls: 'text-red-400'   }
}

export default function OnChainSignalsCard({ mvrv, dataDate, isLoading, error }) {
  const interp = mvrvInterpretation(mvrv)

  // 1. Loading — always show skeleton while fetch is in flight
  if (isLoading) {
    return (
      <div className="rounded-2xl bg-gray-900 p-4 md:p-6 flex flex-col gap-3 h-full">
        <p className={LABEL}>On-Chain Signals</p>
        <p className="text-xs text-gray-600 flex items-center">MVRV Ratio<CardTooltip text={MVRV_TOOLTIP} /></p>
        <div className="animate-pulse space-y-2">
          <div className="h-8 w-20 rounded bg-gray-800" />
          <div className="h-4 w-32 rounded bg-gray-800" />
        </div>
      </div>
    )
  }

  // 2. Confirmed fetch error — hide card entirely
  if (error) return null

  // 3. No data but no error — keep skeleton (data may still be absent from API response)
  if (mvrv == null) {
    return (
      <div className="rounded-2xl bg-gray-900 p-4 md:p-6 flex flex-col gap-3 h-full">
        <p className={LABEL}>On-Chain Signals</p>
        <p className="text-xs text-gray-600 flex items-center">MVRV Ratio<CardTooltip text={MVRV_TOOLTIP} /></p>
        <div className="animate-pulse space-y-2">
          <div className="h-8 w-20 rounded bg-gray-800" />
          <div className="h-4 w-32 rounded bg-gray-800" />
        </div>
      </div>
    )
  }

  // 4. Data present — render normally
  return (
    <div className="rounded-2xl bg-gray-900 p-4 md:p-6 flex flex-col gap-3 h-full">
      <p className={LABEL}>On-Chain Signals</p>
      <p className="text-xs text-gray-600 flex items-center">MVRV Ratio<CardTooltip text={MVRV_TOOLTIP} /></p>
      <div>
        <p className={VALUE}>{mvrv.toFixed(2)}</p>
        <p className={SUB}>Market Value to Realised Value</p>
      </div>
      {interp && (
        <p className={`text-sm ${interp.cls}`}>{interp.label}</p>
      )}
      {mvrv < 1 && (
        <p className="text-xs text-gray-500">
          Coins are, on average, held at a loss — historically a strong buying zone.
        </p>
      )}
      {dataDate && (
        <p className="text-xs text-gray-600">As of {dataDate}</p>
      )}
    </div>
  )
}
