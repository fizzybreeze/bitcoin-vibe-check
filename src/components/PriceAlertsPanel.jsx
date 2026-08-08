import { useState } from 'react'
import { ALERT_METRICS, ALERT_METRIC_IDS, DEFAULT_ALERT_METRIC } from '../lib/alertRules.js'
import {
  PUSH_BLOCKED, PUSH_OFF, PUSH_ON, PUSH_UNCONFIGURED, PUSH_UNSUPPORTED,
} from '../hooks/usePushSubscription.js'

// What the footer says, per push state. Kept as data next to the component
// rather than as a chain of ternaries in the JSX, because the honest sentence
// differs in every state and the wrong one is worse than none: telling someone
// their alerts survive a closed tab when they do not is the single most
// misleading thing this panel could say.
const PUSH_COPY = {
  [PUSH_ON]:           'Alerts are pushed to this device, even with the tab closed.',
  [PUSH_OFF]:          'Alerts only fire while this tab is open. Turn on push to get them with the tab closed.',
  [PUSH_BLOCKED]:      'Notifications are blocked in your browser, so alerts cannot be pushed. Enable them in browser settings.',
  [PUSH_UNSUPPORTED]:  'Alerts only fire while this tab is open — this browser does not support push notifications.',
  [PUSH_UNCONFIGURED]: 'Alerts only fire while this tab is open — they are not push notifications.',
}

export default function PriceAlertsPanel({
  alerts,
  currency,
  onAdd,
  onRemove,
  onClearTriggered,
  notificationPermission,
  onRequestPermission,
  pushStatus = PUSH_UNCONFIGURED,
  pushBusy = false,
  onEnablePush,
  onDisablePush,
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

  function handleSubmit(e) {
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

    // The alert is stored first, and the permission prompt is deliberately not
    // awaited. This used to read `await onRequestPermission()` before `onAdd`,
    // which lost alerts outright: Chromium leaves a *concurrent*
    // `Notification.requestPermission()` unsettled rather than resolving it, so
    // a second Set pressed while the first prompt was still open awaited a
    // promise that never came and never reached `onAdd`. Measured in a real
    // browser — of four requests fired together, two resolved and two hung
    // forever — and four rapid Sets stored one alert.
    //
    // Nothing about creating the rule needs the answer: an alert with
    // notifications denied still lists, still crosses and still shows
    // "✓ Triggered". Asking afterwards also puts the prompt in context, with
    // the row the visitor just made already on screen.
    onAdd(parsed, meta.id)
    setInputValue('')

    if (notificationPermission !== 'granted') {
      onRequestPermission()
    }
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

        {/* Push toggle, and the disclaimer it replaces once push is on. The
            sentence is deliberately explicit in every state rather than merely
            accurate — see PUSH_COPY. */}
        <div className="mt-4 border-t border-gray-800 pt-3">
          {(pushStatus === PUSH_ON || pushStatus === PUSH_OFF) && (
            <button
              type="button"
              onClick={pushStatus === PUSH_ON ? onDisablePush : onEnablePush}
              disabled={pushBusy}
              aria-pressed={pushStatus === PUSH_ON}
              className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl bg-gray-800 px-3 py-2 text-left transition-colors hover:bg-gray-700 disabled:opacity-50"
            >
              <span className="text-xs font-semibold text-white">Push to this device</span>
              <span
                aria-hidden="true"
                className={`flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${
                  pushStatus === PUSH_ON ? 'bg-orange-500' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`h-4 w-4 rounded-full bg-white transition-transform ${
                    pushStatus === PUSH_ON ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </span>
            </button>
          )}
          <p className="text-xs text-gray-600">
            {PUSH_COPY[pushStatus] ?? PUSH_COPY[PUSH_UNCONFIGURED]}
          </p>
        </div>

      </div>
    </div>
  )
}
