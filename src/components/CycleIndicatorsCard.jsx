import { fmtCurrency } from '../utils.js'
import { calcMayerMultiple, calcPowerLawFairValue } from '../utils/cycleCalculations.js'
import CardTooltip from './CardTooltip.jsx'

const LABEL = 'text-xs font-semibold uppercase tracking-widest text-gray-500'

const MVRV_TOOLTIP      = "Compares Bitcoin's market cap to the aggregate cost basis of all coins. Above 3.5 has historically marked cycle tops; below 1 has marked bottoms. Near 1 means the market is close to its collective break-even."
const POWER_LAW_TOOLTIP = "A long-term model treating adoption as a power function of time since Bitcoin's genesis block. Shows where price sits relative to a historical fair value range. A model, not a prediction — label it accordingly."
const MA200_TOOLTIP     = 'The most widely cited long-term trend indicator. Price above the 200-day moving average suggests a bull trend; below suggests a bear trend. Many investors use it as a simple entry or exit signal.'
const MAYER_TOOLTIP     = 'Price divided by the 200-day moving average. Above 2.4 has preceded corrections historically; below 1 has been rare and has often preceded recoveries. Long-run mean sits around 1.0–1.5.'

function mvrvInterpretation(mvrv) {
  if (mvrv == null) return null
  if (mvrv < 1)    return { label: 'Deeply Undervalued',   cls: 'text-green-400' }
  if (mvrv < 1.5)  return { label: 'Undervalued',          cls: 'text-green-400' }
  if (mvrv < 2.4)  return { label: 'Fair Value',           cls: 'text-gray-400'  }
  if (mvrv < 3.7)  return { label: 'Overvalued',           cls: 'text-red-400'   }
  return                   { label: 'Extremely Overvalued', cls: 'text-red-400'   }
}

function mayerInterpretation(multiple) {
  if (multiple == null) return null
  if (multiple < 0.8) return { label: 'Historically Cheap' }
  if (multiple < 1.0) return { label: 'Below Average'      }
  if (multiple < 1.5) return { label: 'Normal Range'       }
  if (multiple < 2.4) return { label: 'Elevated'           }
  return                     { label: 'Overheated'         }
}

function powerLawInterpretation(currentPrice, fairValue) {
  if (currentPrice == null || fairValue == null) return null
  const pct = ((currentPrice - fairValue) / fairValue) * 100
  const sign = pct >= 0 ? '+' : ''
  const cls = pct > 20 ? 'text-amber-400' : pct > -20 ? 'text-yellow-400' : 'text-green-400'
  return { label: `${sign}${pct.toFixed(0)}% vs fair`, cls }
}

function MetricRow({ label, value, context, contextCls = 'text-gray-400', tooltip }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className={`${LABEL} flex items-center`}>{label}{tooltip && <CardTooltip text={tooltip} />}</p>
      <p className="text-xl font-bold text-orange-400">{value ?? '—'}</p>
      {context && <p className={`text-xs ${contextCls}`}>{context}</p>}
    </div>
  )
}

export default function CycleIndicatorsCard({ currentPrice, ma200, ohlcLoading, ohlcError, currency = 'usd', fxRate = 1, mvrv = null, dataDate = null, mvrvLoading = false, mvrvError = null }) {
  const fairValue   = calcPowerLawFairValue()
  const mayer       = calcMayerMultiple(currentPrice, ma200)
  const mayerInterp = mayerInterpretation(mayer)
  const plInterp    = powerLawInterpretation(currentPrice, fairValue)
  const mvrvInterp  = mvrvInterpretation(mvrv)

  const isOhlcReady = !ohlcLoading && !ohlcError && ma200 != null

  return (
    <div className="rounded-2xl bg-gray-900 p-4 md:p-6 flex flex-col gap-4 h-full">
      <p className={LABEL}>Cycle Indicators</p>

      {mvrvError ? null : mvrvLoading && mvrv == null ? (
        <div className="animate-pulse space-y-1">
          <div className="h-3 w-20 rounded bg-gray-800" />
          <div className="h-6 w-16 rounded bg-gray-800" />
        </div>
      ) : mvrv != null ? (
        <>
          <MetricRow
            label="MVRV Ratio"
            value={mvrv.toFixed(2)}
            context={mvrvInterp?.label}
            contextCls={mvrvInterp?.cls ?? 'text-gray-400'}
            tooltip={MVRV_TOOLTIP}
          />
          {dataDate && <p className="text-xs text-gray-600">{dataDate}</p>}
        </>
      ) : null}

      <div className="h-px bg-gray-800" />

      <MetricRow
        label="Power Law Fair Value"
        value={fairValue != null ? fmtCurrency(fairValue * fxRate, currency) : '—'}
        context={plInterp?.label}
        contextCls={plInterp?.cls ?? 'text-gray-400'}
        tooltip={POWER_LAW_TOOLTIP}
      />

      <div className="h-px bg-gray-800" />

      {ohlcLoading && ma200 == null ? (
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-28 rounded bg-gray-800" />
          <div className="h-6 w-20 rounded bg-gray-800" />
          <div className="h-px bg-gray-800" />
          <div className="h-4 w-24 rounded bg-gray-800" />
          <div className="h-6 w-16 rounded bg-gray-800" />
        </div>
      ) : ohlcError || !isOhlcReady ? (
        <p className="text-xs text-gray-500">200-day data unavailable</p>
      ) : (
        <>
          <MetricRow
            label="200-Day Moving Average"
            value={fmtCurrency(ma200 * fxRate, currency)}
            tooltip={MA200_TOOLTIP}
          />

          <div className="h-px bg-gray-800" />

          <MetricRow
            label="Mayer Multiple"
            value={mayer != null ? mayer.toFixed(2) : '—'}
            context={mayerInterp?.label}
            contextCls="text-gray-500"
            tooltip={MAYER_TOOLTIP}
          />
        </>
      )}
    </div>
  )
}
