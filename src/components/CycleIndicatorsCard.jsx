import { fmtCurrency } from '../utils.js'
import { calcMayerMultiple, calcPowerLawFairValue } from '../utils/cycleCalculations.js'
import CardTooltip from './CardTooltip.jsx'
import { mvrvBand, powerLawBand } from '../lib/scales.js'

const LABEL = 'text-xs font-semibold uppercase tracking-widest text-quiet'

const MVRV_TOOLTIP      = "Compares Bitcoin's market cap to the aggregate cost basis of all coins. Above 3.5 has historically marked cycle tops; below 1 has marked bottoms. Near 1 means the market is close to its collective break-even."
const POWER_LAW_TOOLTIP = "A long-term model treating adoption as a power function of time since Bitcoin's genesis block. Shows where price sits relative to a historical fair value range. A model, not a prediction — label it accordingly."
const MA200_TOOLTIP     = 'The most widely cited long-term trend indicator. Price above the 200-day moving average suggests a bull trend; below suggests a bear trend. Many investors use it as a simple entry or exit signal.'
const MAYER_TOOLTIP     = 'Price divided by the 200-day moving average. Above 2.4 has preceded corrections historically; below 1 has been rare and has often preceded recoveries. Long-run mean sits around 1.0–1.5.'

function mayerInterpretation(multiple) {
  if (multiple == null) return null
  if (multiple < 0.8) return { label: 'Historically Cheap' }
  if (multiple < 1.0) return { label: 'Below Average'      }
  if (multiple < 1.5) return { label: 'Normal Range'       }
  if (multiple < 2.4) return { label: 'Elevated'           }
  return                     { label: 'Overheated'         }
}

// The deviation label is written here; the band it is drawn in comes from
// `powerLawBand`, which the share image reads too.
function powerLawInterpretation(currentPrice, fairValue) {
  if (currentPrice == null || fairValue == null) return null
  const pct = ((currentPrice - fairValue) / fairValue) * 100
  const sign = pct >= 0 ? '+' : ''
  return { label: `${sign}${pct.toFixed(0)}% vs fair`, cls: powerLawBand(pct)?.text }
}

function MetricRow({ label, value, context, contextCls = 'text-muted', tooltip }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className={`${LABEL} flex items-center`}>{label}{tooltip && <CardTooltip text={tooltip} />}</p>
      <p className="text-xl font-bold text-accent">{value ?? '—'}</p>
      {context && <p className={`text-xs ${contextCls}`}>{context}</p>}
    </div>
  )
}

export default function CycleIndicatorsCard({ currentPrice, ma200, ohlcLoading, ohlcError, currency = 'usd', fxRate = 1, mvrv = null, dataDate = null, mvrvSource = null, mvrvLoading = false, mvrvError = null }) {
  const fairValue   = calcPowerLawFairValue()
  const mayer       = calcMayerMultiple(currentPrice, ma200)
  const mayerInterp = mayerInterpretation(mayer)
  const plInterp    = powerLawInterpretation(currentPrice, fairValue)
  const mvrvInterp  = mvrvBand(mvrv)

  const isOhlcReady = !ohlcLoading && !ohlcError && ma200 != null

  return (
    <div data-testid="card-cycle-indicators" className="rounded-2xl bg-surface p-4 md:p-6 flex flex-col gap-4 h-full">
      <p className={LABEL}>Cycle Indicators</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 md:divide-x divide-line-soft">
        {/* Top-left: MVRV Ratio */}
        <div className="flex flex-col gap-0.5">
          {!mvrvError && mvrvLoading && mvrv == null ? (
            <div className="animate-pulse space-y-1">
              <div className="h-3 w-20 rounded bg-raised" />
              <div className="h-6 w-16 rounded bg-raised" />
            </div>
          ) : (
            <>
              <MetricRow
                label="MVRV Ratio"
                value={mvrv != null ? mvrv.toFixed(2) : '—'}
                context={mvrvInterp?.label}
                contextCls={mvrvInterp?.text ?? 'text-muted'}
                tooltip={MVRV_TOOLTIP}
              />
              {/* `/api/chain-data` serves the last stored MVRV when the
                  BGeometrics budget is exhausted. Say so: a value read off a
                  daily snapshot is a day or more old, and a number that quietly
                  presents itself as live is the failure this fallback would
                  otherwise introduce. */}
              {dataDate && (
                <p className="text-xs text-quiet">
                  {dataDate}{mvrvSource === 'snapshot' && ' · from daily snapshot'}
                </p>
              )}
            </>
          )}
        </div>

        {/* Top-right: Power Law Fair Value */}
        <div className="md:pl-6">
          <MetricRow
            label="Power Law Fair Value"
            value={fairValue != null ? fmtCurrency(fairValue * fxRate, currency) : '—'}
            context={plInterp?.label}
            contextCls={plInterp?.cls ?? 'text-muted'}
            tooltip={POWER_LAW_TOOLTIP}
          />
        </div>

        {/* Bottom-left: 200-Day Moving Average */}
        <div className="flex flex-col gap-0.5">
          {ohlcLoading && ma200 == null ? (
            <div className="animate-pulse space-y-1">
              <div className="h-3 w-28 rounded bg-raised" />
              <div className="h-6 w-20 rounded bg-raised" />
            </div>
          ) : (
            <MetricRow
              label="200-Day Moving Average"
              value={isOhlcReady ? fmtCurrency(ma200 * fxRate, currency) : '—'}
              tooltip={MA200_TOOLTIP}
            />
          )}
        </div>

        {/* Bottom-right: Mayer Multiple */}
        <div className="md:pl-6">
          {ohlcLoading && ma200 == null ? (
            <div className="animate-pulse space-y-1">
              <div className="h-3 w-24 rounded bg-raised" />
              <div className="h-6 w-16 rounded bg-raised" />
            </div>
          ) : (
            <MetricRow
              label="Mayer Multiple"
              value={isOhlcReady && mayer != null ? mayer.toFixed(2) : '—'}
              context={isOhlcReady ? mayerInterp?.label : undefined}
              contextCls="text-quiet"
              tooltip={MAYER_TOOLTIP}
            />
          )}
        </div>
      </div>
    </div>
  )
}
