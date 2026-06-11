import { fmtCurrency } from '../utils.js'
import { calcMayerMultiple, calcPowerLawFairValue } from '../utils/cycleCalculations.js'
import CardTooltip from './CardTooltip.jsx'

const LABEL = 'text-xs font-semibold uppercase tracking-widest text-gray-500'

const POWER_LAW_TOOLTIP = "A long-term model treating adoption as a power function of time since Bitcoin's genesis block. Shows where price sits relative to a historical fair value range. A model, not a prediction — label it accordingly."
const MA200_TOOLTIP     = 'The most widely cited long-term trend indicator. Price above the 200-day moving average suggests a bull trend; below suggests a bear trend. Many investors use it as a simple entry or exit signal.'
const MAYER_TOOLTIP     = 'Price divided by the 200-day moving average. Above 2.4 has preceded corrections historically; below 1 has been rare and has often preceded recoveries. Long-run mean sits around 1.0–1.5.'

function mayerInterpretation(multiple) {
  if (multiple == null) return null
  if (multiple < 0.8) return { label: 'Historically Cheap',  cls: 'text-green-400'  }
  if (multiple < 1.0) return { label: 'Below Average',       cls: 'text-lime-400'   }
  if (multiple < 1.5) return { label: 'Normal Range',        cls: 'text-gray-400' }
  if (multiple < 2.4) return { label: 'Elevated',            cls: 'text-amber-400'  }
  return                     { label: 'Overheated',          cls: 'text-red-400'    }
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

export default function CycleIndicatorsCard({ currentPrice, ma200, ohlcLoading, ohlcError }) {
  const fairValue   = calcPowerLawFairValue()
  const mayer       = calcMayerMultiple(currentPrice, ma200)
  const mayerInterp = mayerInterpretation(mayer)
  const plInterp    = powerLawInterpretation(currentPrice, fairValue)

  const isOhlcReady = !ohlcLoading && !ohlcError && ma200 != null

  return (
    <div className="rounded-2xl bg-gray-900 p-4 md:p-6 flex flex-col gap-4 h-full">
      <p className={LABEL}>Cycle Indicators</p>

      <MetricRow
        label="Power Law Fair Value"
        value={fairValue != null ? fmtCurrency(fairValue, 'usd') : '—'}
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
            value={fmtCurrency(ma200, 'usd')}
            tooltip={MA200_TOOLTIP}
          />

          <div className="h-px bg-gray-800" />

          <MetricRow
            label="Mayer Multiple"
            value={mayer != null ? mayer.toFixed(2) : '—'}
            context={mayerInterp?.label}
            contextCls={mayerInterp?.cls ?? 'text-gray-400'}
            tooltip={MAYER_TOOLTIP}
          />
        </>
      )}
    </div>
  )
}
