import { useState } from 'react'

export function usePersistedState(key, defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setPersistedState = (value) => {
    try {
      const next = typeof value === 'function' ? value(state) : value
      localStorage.setItem(key, JSON.stringify(next))
      setState(next)
    } catch {
      setState(value)
    }
  }

  return [state, setPersistedState]
}
