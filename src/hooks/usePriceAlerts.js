import { useState, useEffect, useRef } from 'react'
import { CURRENCY_META } from '../utils.js'

const STORAGE_KEY = 'btc-vibe-price-alerts'

function loadAlerts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') ?? []
  } catch {
    return []
  }
}

function fmtLabel(targetPrice, currency) {
  try {
    return new Intl.NumberFormat(CURRENCY_META[currency]?.locale ?? 'en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(targetPrice)
  } catch {
    const sym = CURRENCY_META[currency]?.sym ?? '$'
    return `${sym}${Math.round(targetPrice).toLocaleString('en-US')}`
  }
}

function fireNotification(alert, currentPrice, currency) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const formatted = new Intl.NumberFormat(CURRENCY_META[currency]?.locale ?? 'en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(currentPrice)
    new Notification('Bitcoin Vibe Check', {
      body: `BTC has crossed your ${alert.direction === 'above' ? 'upper' : 'lower'} alert at ${alert.label}. Current price: ${formatted}.`,
      icon: '/favicon.ico',
      tag: alert.id,
    })
  } catch {
    // Notification API unavailable or permission revoked
  }
}

export function usePriceAlerts(currentPrice, currency) {
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

  // Check price against every pending alert on each price tick
  useEffect(() => {
    if (!currentPrice || !currency) return

    alerts.forEach(alert => {
      if (alert.triggered) return
      if (alert.currency !== currency) return

      const crossed =
        (alert.direction === 'above' && currentPrice >= alert.targetPrice) ||
        (alert.direction === 'below' && currentPrice <= alert.targetPrice)

      if (crossed) {
        fireNotification(alert, currentPrice, currency)
        setAlerts(prev =>
          prev.map(a => a.id === alert.id ? { ...a, triggered: true } : a)
        )
      }
    })
  // alerts is intentionally omitted: we only re-check on price ticks, not on every alert mutation.
  // New alerts are picked up on the next price update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, currency])

  function addAlert(targetPrice) {
    const parsed = Number(targetPrice)
    if (!isFinite(parsed) || parsed <= 0) return

    const direction = (currentPrice != null && parsed < currentPrice) ? 'below' : 'above'
    const alert = {
      id: crypto.randomUUID(),
      targetPrice: parsed,
      currency,
      direction,
      label: fmtLabel(parsed, currency),
      triggered: false,
      createdAt: new Date().toISOString(),
    }
    setAlerts(prev => [...prev, alert])
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
