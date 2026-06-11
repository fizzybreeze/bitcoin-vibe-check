import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePersistedState } from '../usePersistedState.js'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('usePersistedState', () => {
  it('initialises with the default value when localStorage is empty', () => {
    const { result } = renderHook(() => usePersistedState('btc-vibe-currency', 'usd'))
    expect(result.current[0]).toBe('usd')
  })

  it('loads a stored value from localStorage on mount', () => {
    localStorage.setItem('btc-vibe-currency', JSON.stringify('gbp'))
    const { result } = renderHook(() => usePersistedState('btc-vibe-currency', 'usd'))
    expect(result.current[0]).toBe('gbp')
  })

  it('writes the correct key and JSON value to localStorage when the setter is called', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => usePersistedState('btc-vibe-currency', 'usd'))
    act(() => result.current[1]('gbp'))
    expect(spy).toHaveBeenCalledWith('btc-vibe-currency', JSON.stringify('gbp'))
    expect(result.current[0]).toBe('gbp')
  })

  it('persists the chart timeframe key correctly', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => usePersistedState('btc-vibe-chart-timeframe', '7D'))
    act(() => result.current[1]('1M'))
    expect(spy).toHaveBeenCalledWith('btc-vibe-chart-timeframe', JSON.stringify('1M'))
    expect(result.current[0]).toBe('1M')
  })

  it('falls back to the default when localStorage contains corrupt JSON', () => {
    localStorage.setItem('btc-vibe-currency', '{{invalid json')
    const { result } = renderHook(() => usePersistedState('btc-vibe-currency', 'usd'))
    expect(result.current[0]).toBe('usd')
  })

  it('falls back to the default when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    const { result } = renderHook(() => usePersistedState('btc-vibe-currency', 'usd'))
    expect(result.current[0]).toBe('usd')
  })

  it('still updates state when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(() => usePersistedState('btc-vibe-currency', 'usd'))
    act(() => result.current[1]('eur'))
    expect(result.current[0]).toBe('eur')
  })
})
