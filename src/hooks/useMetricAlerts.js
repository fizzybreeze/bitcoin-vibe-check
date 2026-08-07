import { useState, useEffect, useRef } from 'react'
import {
  ALERT_METRIC_IDS,
  DEFAULT_ALERT_METRIC,
  alertNotificationBody,
  createAlertRule,
  hasAlertCrossed,
  migrateStoredRules,
  readAlertMetric,
} from '../lib/alertRules.js'

// Unchanged from when this hook only knew about price. Renaming the key to
// match the hook would orphan every alert a visitor has already set, which is
// the exact loss the migration in `alertRules.js` exists to prevent.
const STORAGE_KEY = 'btc-vibe-price-alerts'

function loadAlerts() {
  try {
    return migrateStoredRules(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return []
  }
}

function fireNotification(rule, value) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const body = alertNotificationBody(rule, value)
  if (!body) return
  try {
    new Notification('Bitcoin Vibe Check', { body, icon: '/favicon.ico', tag: rule.id })
  } catch {
    // Notification API unavailable or permission revoked
  }
}

/**
 * Threshold alerts over any metric in `ALERT_METRICS`.
 *
 * Takes the whole metrics object rather than a value and a currency, so adding
 * a metric is a row in the registry and a field here — not a new argument and a
 * new branch. Every decision about whether a rule fires lives in
 * `src/lib/alertRules.js`; this hook owns storage, notification permission and
 * the React state around them.
 */
export function useMetricAlerts(metrics) {
  const [alerts, setAlerts] = useState(loadAlerts)
  const [notificationPermission, setNotificationPermission] = useState(
    () => (typeof Notification !== 'undefined' ? Notification.permission : 'default')
  )
  const isMounted = useRef(false)

  // Persist on change; skip the synchronous initialisation render
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts))
    } catch {
      // quota exceeded or storage unavailable
    }
  }, [alerts])

  // App passes a fresh object every render, so the effect cannot depend on it
  // by identity — it would re-check on every render instead of on every reading.
  // Derived from the registry rather than from a hand-written list, so a metric
  // added to `ALERT_METRICS` is watched without anyone remembering to say so.
  const metricsKey = [
    ...ALERT_METRIC_IDS.map(id => metrics?.[id] ?? ''),
    metrics?.currency ?? '',
  ].join('|')

  // Check every pending rule whenever a reading changes
  useEffect(() => {
    alerts.forEach(alert => {
      if (!hasAlertCrossed(alert, metrics)) return
      fireNotification(alert, readAlertMetric(alert, metrics))
      setAlerts(prev => prev.map(a => (a.id === alert.id ? { ...a, triggered: true } : a)))
    })
  // alerts and metrics are intentionally omitted: we only re-check when a reading
  // changes, not on every alert mutation or render. New alerts are picked up on
  // the next update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricsKey])

  function addAlert(threshold, metric = DEFAULT_ALERT_METRIC) {
    const rule = createAlertRule(threshold, { metric, metrics })
    if (!rule) return
    setAlerts(prev => [...prev, rule])
  }

  function removeAlert(id) {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  function clearTriggered() {
    setAlerts(prev => prev.filter(a => !a.triggered))
  }

  const requestPermission = async () => {
    if (!('Notification' in window)) return
    await Notification.requestPermission()
    setNotificationPermission(Notification.permission)
  }

  return {
    alerts,
    addAlert,
    removeAlert,
    clearTriggered,
    notificationPermission,
    requestPermission,
  }
}
