import { useRef, useState } from 'react'
import useDialogFocus from '../hooks/useDialogFocus.js'
import { ALERT_METRICS, ALERT_METRIC_IDS, DEFAULT_ALERT_METRIC } from '../lib/alertRules.js'
import { PUSH_FAILED, PUSH_OFF, PUSH_ON, PUSH_UNCONFIGURED } from '../hooks/usePushSubscription.js'
import { pushFooterCopy } from './pushCopy.js'
import Icon from './Icon.jsx'
import { CARD_LABEL } from '../lib/typography.js'

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
  pushFailReason = null,
  onEnablePush,
  onDisablePush,
  onClose,
}) {
  const [metric, setMetric] = useState(DEFAULT_ALERT_METRIC)
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState('')
  const panelRef = useRef(null)

  // `trap: false`, and that is the design rather than an omission. This is a
  // popover anchored to the header button, not a modal — there is no scrim, the
  // dashboard behind it is still readable and still usable, and it carries no
  // `aria-modal`. Holding Tab inside it would claim otherwise, and would strand
  // anyone who tabbed in expecting to carry on down the page.
  useDialogFocus(panelRef, { onClose })

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
      ref={panelRef}
      className="fixed inset-x-4 top-20 z-50 md:inset-x-auto md:right-8 md:top-16 md:w-80"
      role="dialog"
      aria-label="Alerts"
    >
      <div className="rounded-2xl bg-surface border border-line-soft p-4 shadow-2xl">

        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Alerts</h2>
          <button
            onClick={onClose}
            aria-label="Close alerts"
            className="flex h-6 w-6 items-center justify-center rounded-full text-quiet hover:text-ink-dim transition-colors"
          >
            <Icon name="close" size="sm" />
          </button>
        </div>

        {/* Notification blocked warning */}
        {notificationPermission === 'denied' && (
          <div className="mb-4 rounded-xl bg-raised px-3 py-2.5">
            <p className="text-xs text-warn">
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
                    ? 'bg-accent-fill text-accent-ink'
                    : 'bg-raised text-muted hover:text-ink-dim'
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
                className="w-full rounded-xl bg-raised px-3 py-2 text-sm text-ink placeholder-quiet [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            {unitLabel && (
              <span className="flex items-center text-xs font-semibold uppercase text-quiet">{unitLabel}</span>
            )}
            <button
              type="submit"
              className="rounded-xl bg-accent-fill px-3 py-2 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-fill-hover"
            >
              Set
            </button>
          </div>
          {inputError && <p className="mt-1.5 text-xs text-down">{inputError}</p>}
          <p className="mt-1.5 text-xs text-quiet">e.g. {example}</p>
        </form>

        {/* Alert list */}
        <div>
          <h3 className={`${CARD_LABEL} mb-2`}>Active alerts</h3>
          {alerts.length === 0 ? (
            <p className="text-xs text-quiet">No alerts set. Pick a metric and add a level above.</p>
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
                    className={`flex items-center justify-between rounded-xl px-3 py-2 ${alert.triggered ? 'bg-raised/50' : 'bg-raised'}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-sm ${
                        alert.triggered
                          ? 'text-quiet'
                          : tinted
                            ? alert.direction === 'above' ? 'text-up' : 'text-down'
                            : 'text-muted'
                      }`}>
                        {alert.direction === 'above' ? '↑' : '↓'}
                      </span>
                      {/* Named on every row, not only the non-price ones: "20"
                          beside "$80,000" is ambiguous, and a prefix that only
                          appears sometimes is worse than one that always does */}
                      <span className={`text-xs shrink-0 ${alert.triggered ? 'text-quiet' : 'text-quiet'}`}>
                        {rowMeta?.shortName ?? alert.metric}
                      </span>
                      <span className={`text-sm font-medium truncate ${alert.triggered ? 'text-quiet' : 'text-ink'}`}>
                        {alert.label}
                      </span>
                      {alert.triggered && (
                        <span className="text-xs text-quiet shrink-0">✓ Triggered</span>
                      )}
                    </div>
                    <button
                      onClick={() => onRemove(alert.id)}
                      aria-label={`Remove alert for ${rowMeta?.shortName ?? alert.metric} ${alert.label}`}
                      className="ml-2 shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-quiet hover:text-muted transition-colors"
                    >
                      <Icon name="close" size="sm" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {hasTriggered && (
            <button
              onClick={onClearTriggered}
              className="mt-3 text-xs text-quiet underline underline-offset-2 hover:text-ink-dim transition-colors"
            >
              Clear triggered
            </button>
          )}
        </div>

        {/* Push toggle, and the disclaimer it replaces once push is on. The
            sentence is deliberately explicit in every state rather than merely
            accurate — see PUSH_COPY. */}
        <div className="mt-4 border-t border-line-soft pt-3">
          {/* PUSH_FAILED keeps the toggle on screen. A failed attempt that
              hides the control leaves the visitor with advice they cannot act
              on — the copy below tells them to change a setting and try again,
              so there has to be something left to try again with. */}
          {(pushStatus === PUSH_ON || pushStatus === PUSH_OFF || pushStatus === PUSH_FAILED) && (
            <button
              type="button"
              onClick={pushStatus === PUSH_ON ? onDisablePush : onEnablePush}
              disabled={pushBusy}
              aria-pressed={pushStatus === PUSH_ON}
              className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl bg-raised px-3 py-2 text-left transition-colors hover:bg-hover disabled:opacity-50"
            >
              <span className="text-xs font-semibold text-ink">Push to this device</span>
              <span
                aria-hidden="true"
                className={`flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${
                  pushStatus === PUSH_ON ? 'bg-accent-fill' : 'bg-line-strong'
                }`}
              >
                {/* The knob changes colour with the track, not just position.
                    A white knob on the bright accent fill is 2.46:1, which
                    fails even the non-text minimum — so the on-state knob is
                    `accent-ink`, the fill's own label colour, and only the
                    off-state (against `line-strong`) stays white. */}
                <span
                  className={`h-4 w-4 rounded-full transition-transform ${
                    pushStatus === PUSH_ON ? 'bg-accent-ink translate-x-4' : 'bg-knob translate-x-0'
                  }`}
                />
              </span>
            </button>
          )}
          <p className="text-xs text-quiet">
            {pushFooterCopy(pushStatus, pushFailReason)}
          </p>
        </div>

      </div>
    </div>
  )
}
