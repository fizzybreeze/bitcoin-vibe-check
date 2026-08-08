import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMetricAlerts } from '../useMetricAlerts.js'

let uuidCounter = 0

beforeEach(() => {
  localStorage.clear()
  uuidCounter = 0
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `test-uuid-${++uuidCounter}`)

  const MockNotification = vi.fn(() => ({}))
  MockNotification.permission = 'granted'
  MockNotification.requestPermission = vi.fn().mockResolvedValue('granted')
  vi.stubGlobal('Notification', MockNotification)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const usd = (price) => ({ currency: 'usd', price })

// ─── addAlert direction ───────────────────────────────────────────────────────

describe('addAlert direction', () => {
  it('creates an alert with direction "above" when target > current price', () => {
    const { result } = renderHook(() => useMetricAlerts(usd(50000)))
    act(() => result.current.addAlert(60000))
    expect(result.current.alerts).toHaveLength(1)
    expect(result.current.alerts[0].direction).toBe('above')
  })

  it('creates an alert with direction "below" when target < current price', () => {
    const { result } = renderHook(() => useMetricAlerts(usd(50000)))
    act(() => result.current.addAlert(40000))
    expect(result.current.alerts).toHaveLength(1)
    expect(result.current.alerts[0].direction).toBe('below')
  })

  it('defaults to "above" when target equals the current price', () => {
    const { result } = renderHook(() => useMetricAlerts(usd(50000)))
    act(() => result.current.addAlert(50000))
    expect(result.current.alerts[0].direction).toBe('above')
  })

  it('stores the metric, threshold and currency on the alert', () => {
    const { result } = renderHook(() => useMetricAlerts({ currency: 'gbp', price: 50000 }))
    act(() => result.current.addAlert(80000))
    const alert = result.current.alerts[0]
    expect(alert.metric).toBe('price')
    expect(alert.threshold).toBe(80000)
    expect(alert.currency).toBe('gbp')
  })

  it('does not add an alert for a non-positive value', () => {
    const { result } = renderHook(() => useMetricAlerts(usd(50000)))
    act(() => result.current.addAlert(0))
    act(() => result.current.addAlert(-100))
    expect(result.current.alerts).toHaveLength(0)
  })

  it('does not add an alert for a metric that does not exist', () => {
    const { result } = renderHook(() => useMetricAlerts(usd(50000)))
    act(() => result.current.addAlert(60000, 'hashrate'))
    expect(result.current.alerts).toHaveLength(0)
  })
})

// ─── removeAlert ─────────────────────────────────────────────────────────────

describe('removeAlert', () => {
  it('removes the alert with the matching id', () => {
    const { result } = renderHook(() => useMetricAlerts(usd(50000)))
    act(() => result.current.addAlert(60000))
    act(() => result.current.addAlert(70000))
    const idToRemove = result.current.alerts[0].id
    act(() => result.current.removeAlert(idToRemove))
    expect(result.current.alerts).toHaveLength(1)
    expect(result.current.alerts.find(a => a.id === idToRemove)).toBeUndefined()
  })

  it('does nothing when the id does not exist', () => {
    const { result } = renderHook(() => useMetricAlerts(usd(50000)))
    act(() => result.current.addAlert(60000))
    act(() => result.current.removeAlert('non-existent-id'))
    expect(result.current.alerts).toHaveLength(1)
  })
})

// ─── crossing / trigger logic ────────────────────────────────────────────────

describe('metric crossing', () => {
  it('triggers an "above" alert when the price rises to or above the target', () => {
    const { result, rerender } = renderHook(
      ({ metrics }) => useMetricAlerts(metrics),
      { initialProps: { metrics: usd(50000) } }
    )
    act(() => result.current.addAlert(60000))
    expect(result.current.alerts[0].triggered).toBe(false)

    rerender({ metrics: usd(60000) })
    expect(result.current.alerts[0].triggered).toBe(true)
  })

  it('triggers a "below" alert when the price falls to or below the target', () => {
    const { result, rerender } = renderHook(
      ({ metrics }) => useMetricAlerts(metrics),
      { initialProps: { metrics: usd(50000) } }
    )
    act(() => result.current.addAlert(40000))
    rerender({ metrics: usd(39000) })
    expect(result.current.alerts[0].triggered).toBe(true)
  })

  it('notifies with a body naming the metric and the level', () => {
    const { result, rerender } = renderHook(
      ({ metrics }) => useMetricAlerts(metrics),
      { initialProps: { metrics: usd(50000) } }
    )
    act(() => result.current.addAlert(60000))
    rerender({ metrics: usd(61000) })

    expect(Notification).toHaveBeenCalledTimes(1)
    const [, options] = Notification.mock.calls[0]
    expect(options.body).toContain('BTC price')
    expect(options.body).toContain('$60,000')
  })

  it('does not re-trigger an alert that is already triggered', () => {
    const { result, rerender } = renderHook(
      ({ metrics }) => useMetricAlerts(metrics),
      { initialProps: { metrics: usd(50000) } }
    )
    act(() => result.current.addAlert(60000))

    rerender({ metrics: usd(61000) })
    expect(result.current.alerts[0].triggered).toBe(true)

    const callCountAfterFirst = Notification.mock.calls.length

    rerender({ metrics: usd(62000) })
    expect(Notification.mock.calls.length).toBe(callCountAfterFirst)
  })

  // The metrics-object shape is what makes this a row in the registry rather
  // than a second argument and a second branch. `metricsKey` is derived from
  // `ALERT_METRIC_IDS`, so a fee reading has to wake the effect on its own —
  // deleting `fee` from the key would leave this alert armed and silent.
  it('triggers a fee alert on a fee reading, with the price unchanged', () => {
    const { result, rerender } = renderHook(
      ({ metrics }) => useMetricAlerts(metrics),
      { initialProps: { metrics: { currency: 'usd', price: 50000, fee: 12 } } }
    )
    act(() => result.current.addAlert(5, 'fee'))
    expect(result.current.alerts[0].direction).toBe('below')
    expect(result.current.alerts[0].triggered).toBe(false)

    rerender({ metrics: { currency: 'usd', price: 50000, fee: 4 } })
    expect(result.current.alerts[0].triggered).toBe(true)
    expect(Notification.mock.calls[0][1].body).toContain('Network fee')
  })

  it('triggers a Fear & Greed alert at a reading of 0', () => {
    const { result, rerender } = renderHook(
      ({ metrics }) => useMetricAlerts(metrics),
      { initialProps: { metrics: { currency: 'usd', price: 50000, fng: 45 } } }
    )
    act(() => result.current.addAlert(10, 'fng'))
    rerender({ metrics: { currency: 'usd', price: 50000, fng: 0 } })
    expect(result.current.alerts[0].triggered).toBe(true)
  })

  // An un-scoped rule must survive the currency switch that correctly parks a
  // price rule. Scoping a fee would have invented a way for it to stop matching.
  it('still fires a Mayer alert after the displayed currency changes', () => {
    const { result, rerender } = renderHook(
      ({ metrics }) => useMetricAlerts(metrics),
      { initialProps: { metrics: { currency: 'usd', price: 50000, mayer: 1.8 } } }
    )
    act(() => result.current.addAlert(2.4, 'mayer'))
    expect(result.current.alerts[0].currency).toBeUndefined()

    rerender({ metrics: { currency: 'gbp', price: 40000, mayer: 2.5 } })
    expect(result.current.alerts[0].triggered).toBe(true)
  })

  it('does not trigger a GBP alert when the current currency is USD', () => {
    const { result, rerender } = renderHook(
      ({ metrics }) => useMetricAlerts(metrics),
      { initialProps: { metrics: { currency: 'gbp', price: 50000 } } }
    )
    // Alert created in GBP context
    act(() => result.current.addAlert(60000))
    expect(result.current.alerts[0].currency).toBe('gbp')

    // Simulate currency switch to USD — price feed now delivers USD price
    rerender({ metrics: usd(70000) })
    expect(result.current.alerts[0].triggered).toBe(false)
  })
})

// ─── clearTriggered ───────────────────────────────────────────────────────────

describe('clearTriggered', () => {
  it('removes only triggered alerts', () => {
    const { result, rerender } = renderHook(
      ({ metrics }) => useMetricAlerts(metrics),
      { initialProps: { metrics: usd(50000) } }
    )
    act(() => result.current.addAlert(60000)) // will trigger
    act(() => result.current.addAlert(90000)) // will not trigger
    rerender({ metrics: usd(65000) })
    expect(result.current.alerts.filter(a => a.triggered)).toHaveLength(1)

    act(() => result.current.clearTriggered())
    expect(result.current.alerts).toHaveLength(1)
    expect(result.current.alerts[0].triggered).toBe(false)
  })
})

// ─── localStorage persistence ─────────────────────────────────────────────────

describe('localStorage persistence', () => {
  it('persists alerts to localStorage when an alert is added', () => {
    const { result } = renderHook(() => useMetricAlerts(usd(50000)))
    act(() => result.current.addAlert(60000))
    const stored = JSON.parse(localStorage.getItem('btc-vibe-price-alerts'))
    expect(stored).toHaveLength(1)
    expect(stored[0].threshold).toBe(60000)
    expect(stored[0].metric).toBe('price')
  })

  it('loads alerts from localStorage on mount', () => {
    const existing = [{
      id: 'existing-id', metric: 'price', threshold: 70000, currency: 'usd',
      direction: 'above', label: '$70,000', triggered: false, createdAt: new Date().toISOString()
    }]
    localStorage.setItem('btc-vibe-price-alerts', JSON.stringify(existing))
    const { result } = renderHook(() => useMetricAlerts(usd(50000)))
    expect(result.current.alerts).toHaveLength(1)
    expect(result.current.alerts[0].id).toBe('existing-id')
  })

  // The reason `migrateStoredRules` exists: an alert set before this change has
  // no `metric` and carries `targetPrice`. Read strictly it is an unrecognised
  // rule, and dropping it deletes something a visitor set deliberately.
  it('migrates an alert stored before rules named a metric, and still fires it', () => {
    localStorage.setItem('btc-vibe-price-alerts', JSON.stringify([{
      id: 'legacy-id', targetPrice: 70000, currency: 'usd',
      direction: 'above', label: '$70,000', triggered: false, createdAt: new Date().toISOString()
    }]))

    const { result, rerender } = renderHook(
      ({ metrics }) => useMetricAlerts(metrics),
      { initialProps: { metrics: usd(50000) } }
    )
    expect(result.current.alerts).toHaveLength(1)
    expect(result.current.alerts[0].metric).toBe('price')
    expect(result.current.alerts[0].threshold).toBe(70000)

    rerender({ metrics: usd(71000) })
    expect(result.current.alerts[0].triggered).toBe(true)
  })
})
