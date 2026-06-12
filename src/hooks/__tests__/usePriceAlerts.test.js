import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePriceAlerts } from '../usePriceAlerts.js'

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

// ─── addAlert direction ───────────────────────────────────────────────────────

describe('addAlert direction', () => {
  it('creates an alert with direction "above" when target > currentPrice', () => {
    const { result } = renderHook(() => usePriceAlerts(50000, 'usd'))
    act(() => result.current.addAlert(60000))
    expect(result.current.alerts).toHaveLength(1)
    expect(result.current.alerts[0].direction).toBe('above')
  })

  it('creates an alert with direction "below" when target < currentPrice', () => {
    const { result } = renderHook(() => usePriceAlerts(50000, 'usd'))
    act(() => result.current.addAlert(40000))
    expect(result.current.alerts).toHaveLength(1)
    expect(result.current.alerts[0].direction).toBe('below')
  })

  it('defaults to "above" when target equals currentPrice', () => {
    const { result } = renderHook(() => usePriceAlerts(50000, 'usd'))
    act(() => result.current.addAlert(50000))
    expect(result.current.alerts[0].direction).toBe('above')
  })

  it('stores the correct targetPrice and currency on the alert', () => {
    const { result } = renderHook(() => usePriceAlerts(50000, 'gbp'))
    act(() => result.current.addAlert(80000))
    const alert = result.current.alerts[0]
    expect(alert.targetPrice).toBe(80000)
    expect(alert.currency).toBe('gbp')
  })

  it('does not add an alert for a non-positive value', () => {
    const { result } = renderHook(() => usePriceAlerts(50000, 'usd'))
    act(() => result.current.addAlert(0))
    act(() => result.current.addAlert(-100))
    expect(result.current.alerts).toHaveLength(0)
  })
})

// ─── removeAlert ─────────────────────────────────────────────────────────────

describe('removeAlert', () => {
  it('removes the alert with the matching id', () => {
    const { result } = renderHook(() => usePriceAlerts(50000, 'usd'))
    act(() => result.current.addAlert(60000))
    act(() => result.current.addAlert(70000))
    const idToRemove = result.current.alerts[0].id
    act(() => result.current.removeAlert(idToRemove))
    expect(result.current.alerts).toHaveLength(1)
    expect(result.current.alerts.find(a => a.id === idToRemove)).toBeUndefined()
  })

  it('does nothing when the id does not exist', () => {
    const { result } = renderHook(() => usePriceAlerts(50000, 'usd'))
    act(() => result.current.addAlert(60000))
    act(() => result.current.removeAlert('non-existent-id'))
    expect(result.current.alerts).toHaveLength(1)
  })
})

// ─── price crossing / trigger logic ──────────────────────────────────────────

describe('price crossing', () => {
  it('triggers an "above" alert when price rises to or above the target', () => {
    const { result, rerender } = renderHook(
      ({ price, cur }) => usePriceAlerts(price, cur),
      { initialProps: { price: 50000, cur: 'usd' } }
    )
    act(() => result.current.addAlert(60000))
    expect(result.current.alerts[0].triggered).toBe(false)

    rerender({ price: 60000, cur: 'usd' })
    expect(result.current.alerts[0].triggered).toBe(true)
  })

  it('triggers a "below" alert when price falls to or below the target', () => {
    const { result, rerender } = renderHook(
      ({ price, cur }) => usePriceAlerts(price, cur),
      { initialProps: { price: 50000, cur: 'usd' } }
    )
    act(() => result.current.addAlert(40000))
    rerender({ price: 39000, cur: 'usd' })
    expect(result.current.alerts[0].triggered).toBe(true)
  })

  it('does not re-trigger an alert that is already triggered', () => {
    const MockNotification = vi.fn(() => ({}))
    MockNotification.permission = 'granted'
    MockNotification.requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', MockNotification)

    const { result, rerender } = renderHook(
      ({ price, cur }) => usePriceAlerts(price, cur),
      { initialProps: { price: 50000, cur: 'usd' } }
    )
    act(() => result.current.addAlert(60000))

    rerender({ price: 61000, cur: 'usd' })
    expect(result.current.alerts[0].triggered).toBe(true)

    const callCountAfterFirst = MockNotification.mock.calls.length

    rerender({ price: 62000, cur: 'usd' })
    expect(MockNotification.mock.calls.length).toBe(callCountAfterFirst)
  })

  it('does not trigger a GBP alert when the current currency is USD', () => {
    const { result, rerender } = renderHook(
      ({ price, cur }) => usePriceAlerts(price, cur),
      { initialProps: { price: 50000, cur: 'gbp' } }
    )
    // Alert created in GBP context
    act(() => result.current.addAlert(60000))
    expect(result.current.alerts[0].currency).toBe('gbp')

    // Simulate currency switch to USD — price feed now delivers USD price
    rerender({ price: 70000, cur: 'usd' })
    expect(result.current.alerts[0].triggered).toBe(false)
  })
})

// ─── clearTriggered ───────────────────────────────────────────────────────────

describe('clearTriggered', () => {
  it('removes only triggered alerts', () => {
    const { result, rerender } = renderHook(
      ({ price, cur }) => usePriceAlerts(price, cur),
      { initialProps: { price: 50000, cur: 'usd' } }
    )
    act(() => result.current.addAlert(60000)) // will trigger
    act(() => result.current.addAlert(90000)) // will not trigger
    rerender({ price: 65000, cur: 'usd' })
    expect(result.current.alerts.filter(a => a.triggered)).toHaveLength(1)

    act(() => result.current.clearTriggered())
    expect(result.current.alerts).toHaveLength(1)
    expect(result.current.alerts[0].triggered).toBe(false)
  })
})

// ─── localStorage persistence ─────────────────────────────────────────────────

describe('localStorage persistence', () => {
  it('persists alerts to localStorage when an alert is added', () => {
    const { result } = renderHook(() => usePriceAlerts(50000, 'usd'))
    act(() => result.current.addAlert(60000))
    const stored = JSON.parse(localStorage.getItem('btc-vibe-price-alerts'))
    expect(stored).toHaveLength(1)
    expect(stored[0].targetPrice).toBe(60000)
  })

  it('loads alerts from localStorage on mount', () => {
    const existing = [{
      id: 'existing-id', targetPrice: 70000, currency: 'usd',
      direction: 'above', label: '$70,000', triggered: false, createdAt: new Date().toISOString()
    }]
    localStorage.setItem('btc-vibe-price-alerts', JSON.stringify(existing))
    const { result } = renderHook(() => usePriceAlerts(50000, 'usd'))
    expect(result.current.alerts).toHaveLength(1)
    expect(result.current.alerts[0].id).toBe('existing-id')
  })
})
