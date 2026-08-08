import { useState } from 'react'
import { ALERT_METRICS, ALERT_METRIC_IDS, DEFAULT_ALERT_METRIC } from '../lib/alertRules.js'

export default function PriceAlertsPanel({
  alerts,
  currency,
  onAdd,
  onRemove,
  onClearTriggered,
  notificationPermission,
  onRequestPermission,
  onClose,
}) {
  const [metric, setMetric] = useState(DEFAULT_ALERT_METRIC)
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState('')

  const meta = ALERT_METRICS[metric] ?? ALERT_METRICS[DEFAULT_ALERT_METRIC]
  const hasTriggered = alerts.some(a => a.triggered)

  // The unit slot says what the number is in. For a currency-scoped metric that
  // is the currency code — the same number means different things in USD and
  // GBP, which is the whole reason the rule stores one.
  const unitLabel = meta.currencyScoped ? currency.toUpperCase() : meta.unit
  const example = meta.format(meta.exampleValue, { currency })

  function selectMetric(id) {
    setMetric(id)
    setInputValue('')
    setInputError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // The registry's own predicate, not a second copy of it. A hard-coded
    // "> 0" here would reject a Fear & Greed alert at 0 that the rule model
    // accepts, and accept a 140 that it does not — the panel and the rule
    // disagreeing about what a valid threshold is, in the direction where the
    // visitor gets a row that never fires.
    const parsed = Number(inputValue)
    if (!inputValue.trim() || !meta.isValidValue(parsed)) {
      setInputError(meta.invalidMessage)
      return
    }
    setInputError('')

    if (notificationPermission !== 'granted') {
      await onRequestPermission()
    }

    onAdd(parsed, meta.id)
    setInputValue('')
  }

  return (
    <div
      className="fixed inset-x-4 top-20 z-50 md:inset-x-auto md:right-8 md:top-16 md:w-80"
      role="dialog"
      aria-label="Alerts"
    >
      <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4 shadow-2xl">

        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Alerts</p>
          <button
            onClick={onClose}
            aria-label="Close alerts"
            className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>
        </div>

        {/* Notification blocked warning */}
        {notificationPermission === 'denied' && (
          <div className="mb-4 rounded-xl bg-gray-800 px-3 py-2.5">
            <p className="text-xs text-amber-400">
              Notifications are blocked in your browser. Enable them in browser settings to receive alerts.
            </p>
          </div>
        )}

        {/* Add alert form */}
        <form onSubmit={handleSubmit} className="mb-4">
          {/* Metric picker — wraps rather than scrolls, so every option is
              reachable at 390px without a horizontal gesture */}
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Alert metric">
            {ALERT_METRIC_IDS.map(id => (
              <button
                key={id}
                type="button"
                onClick={() => selectMetric(id)}
                aria-pressed={id === meta.id}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                  id === meta.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {ALERT_METRICS[id].shortName}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={inputValue}
                onChange={e => { setInputValue(e.target.value); setInputError('') }}
                placeholder={meta.placeholder}
                aria-label={`${meta.name} alert level`}
                className="w-full rounded-xl bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:ring-1 focus:ring-orange-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            {unitLabel && (
              <span className="flex items-center text-xs font-semibold uppercase text-gray-500">{unitLabel}</span>
            )}
            <button
              type="submit"
              className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-400"
            >
              Set
            </button>
          </div>
          {inputError && <p className="mt-1.5 text-xs text-red-400">{inputError}</p>}
          <p className="mt-1.5 text-xs text-gray-600">e.g. {example}</p>
        </form>

        {/* Alert list */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Active alerts</p>
          {alerts.length === 0 ? (
            <p className="text-xs text-gray-600">No alerts set. Pick a metric and add a level above.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {alerts.map(alert => {
                // Rules with an unknown metric are dropped by `migrateStoredRules`
                // before they reach here, so this fallback is belt and braces —
                // but a row that throws would take the whole panel with it.
                const rowMeta = ALERT_METRICS[alert.metric]
                const tinted = rowMeta?.colorDirection
                return (
                  <li
                    key={alert.id}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 ${alert.triggered ? 'bg-gray-800/50' : 'bg-gray-800'}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-sm ${
                        alert.triggered
                          ? 'text-gray-600'
                          : tinted
                            ? alert.direction === 'above' ? 'text-green-400' : 'text-red-400'
                            : 'text-gray-400'
                      }`}>
                        {alert.direction === 'above' ? '↑' : '↓'}
                      </span>
                      {/* Named on every row, not only the non-price ones: "20"
                          beside "$80,000" is ambiguous, and a prefix that only
                          appears sometimes is worse than one that always does */}
                      <span className={`text-xs shrink-0 ${alert.triggered ? 'text-gray-700' : 'text-gray-500'}`}>
                        {rowMeta?.shortName ?? alert.metric}
                      </span>
                      <span className={`text-sm font-medium truncate ${alert.triggered ? 'text-gray-600' : 'text-white'}`}>
                        {alert.label}
                      </span>
                      {alert.triggered && (
                        <span className="text-xs text-gray-600 shrink-0">✓ Triggered</span>
                      )}
                    </div>
                    <button
                      onClick={() => onRemove(alert.id)}
                      aria-label={`Remove alert for ${rowMeta?.shortName ?? alert.metric} ${alert.label}`}
                      className="ml-2 shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                        <line x1="1" y1="1" x2="9" y2="9" />
                        <line x1="9" y1="1" x2="1" y2="9" />
                      </svg>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {hasTriggered && (
            <button
              onClick={onClearTriggered}
              className="mt-3 text-xs text-gray-500 underline underline-offset-2 hover:text-gray-300 transition-colors"
            >
              Clear triggered
            </button>
          )}
        </div>

        {/* Disclaimer. Deliberately explicit rather than merely accurate: these
            are not push notifications, and §4.1 is what makes them so. */}
        <p className="mt-4 text-xs text-gray-600">
          Alerts only fire while this tab is open — they are not push notifications.
        </p>

      </div>
    </div>
  )
}
