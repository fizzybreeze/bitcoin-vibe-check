import { useState } from 'react'
import { CURRENCY_META } from '../utils.js'

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
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState('')

  const currSym = CURRENCY_META[currency]?.sym ?? '$'
  const hasTriggered = alerts.some(a => a.triggered)

  async function handleSubmit(e) {
    e.preventDefault()
    const parsed = parseFloat(inputValue)
    if (!inputValue || !isFinite(parsed) || parsed <= 0) {
      setInputError('Enter a valid price above zero.')
      return
    }
    setInputError('')

    if (notificationPermission !== 'granted') {
      await onRequestPermission()
    }

    onAdd(parsed)
    setInputValue('')
  }

  return (
    <div
      className="fixed inset-x-4 top-20 z-50 md:inset-x-auto md:right-8 md:top-16 md:w-80"
      role="dialog"
      aria-label="Price Alerts"
    >
      <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4 shadow-2xl">

        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Price Alerts</p>
          <button
            onClick={onClose}
            aria-label="Close price alerts"
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
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="any"
                value={inputValue}
                onChange={e => { setInputValue(e.target.value); setInputError('') }}
                placeholder="Target price"
                aria-label="Target price"
                className="w-full rounded-xl bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:ring-1 focus:ring-orange-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <span className="flex items-center text-xs font-semibold uppercase text-gray-500">{currency.toUpperCase()}</span>
            <button
              type="submit"
              className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-400"
            >
              Set
            </button>
          </div>
          {inputError && <p className="mt-1.5 text-xs text-red-400">{inputError}</p>}
          <p className="mt-1.5 text-xs text-gray-600">e.g. {currSym}80,000</p>
        </form>

        {/* Alert list */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">Active alerts</p>
          {alerts.length === 0 ? (
            <p className="text-xs text-gray-600">No alerts set. Add a price level above.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {alerts.map(alert => (
                <li
                  key={alert.id}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 ${alert.triggered ? 'bg-gray-800/50' : 'bg-gray-800'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-sm ${alert.triggered ? 'text-gray-600' : alert.direction === 'above' ? 'text-green-400' : 'text-red-400'}`}>
                      {alert.direction === 'above' ? '↑' : '↓'}
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
                    aria-label={`Remove alert for ${alert.label}`}
                    className="ml-2 shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <line x1="1" y1="1" x2="9" y2="9" />
                      <line x1="9" y1="1" x2="1" y2="9" />
                    </svg>
                  </button>
                </li>
              ))}
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

        {/* Disclaimer */}
        <p className="mt-4 text-xs text-gray-600">
          Alerts fire while this page is open in your browser.
        </p>

      </div>
    </div>
  )
}
