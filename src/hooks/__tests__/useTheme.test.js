import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useTheme, { applyTheme, readStoredTheme, systemTheme } from '../useTheme.js'
import { PALETTE, THEME_STORAGE_KEY } from '../../lib/palette.js'

// The theme is decided in three places that have to agree — the boot script in
// `index.html`, this hook, and the stylesheet — and two of them are unreachable
// from a unit test. What is testable here is the part that carries all the
// judgement: which of "stored", "what the OS asked for" and "the default" wins,
// and when a value gets written back.
//
// The distinction that matters most is between *no preference* and *a
// preference that happens to match the OS*. Collapsing those is the bug this
// suite mostly exists to catch: it freezes the theme at whatever the OS
// happened to say on the first visit, and it does it silently.

/** A `matchMedia` that answers one query and can be told to change its mind. */
function stubMatchMedia(prefersDark) {
  const listeners = new Set()
  const mql = {
    matches: prefersDark,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  }
  window.matchMedia = vi.fn(() => mql)
  return {
    mql,
    emit(nowDark) {
      mql.matches = nowDark
      for (const fn of listeners) fn({ matches: nowDark })
    },
    get listenerCount() { return listeners.size },
  }
}

const originalMatchMedia = window.matchMedia

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
  document.head.innerHTML = '<meta name="theme-color" content="#000000">'
  stubMatchMedia(false)
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
  vi.restoreAllMocks()
})

const metaColor = () => document.querySelector('meta[name="theme-color"]').getAttribute('content')

describe('readStoredTheme', () => {
  it('answers null when nothing has been chosen', () => {
    // Null, not the default — the caller has to be able to tell "no choice"
    // from "chose dark" so it knows whether to keep following the OS.
    expect(readStoredTheme()).toBeNull()
  })

  it('answers the stored theme when there is one', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    expect(readStoredTheme()).toBe('light')
  })

  it('treats an unrecognised stored value as no choice', () => {
    // localStorage is a string bucket shared with everything else on the
    // origin, and this key predates the feature by several versions.
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    expect(readStoredTheme()).toBeNull()
  })

  it('answers null rather than throwing when storage is unavailable', () => {
    // Safari's private mode throws on both read and write.
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    expect(readStoredTheme()).toBeNull()
  })
})

describe('systemTheme', () => {
  it('reports dark when the OS asks for it', () => {
    stubMatchMedia(true)
    expect(systemTheme()).toBe('dark')
  })

  it('reports light when the OS does not', () => {
    stubMatchMedia(false)
    expect(systemTheme()).toBe('light')
  })

  it('falls back to the default when there is no matchMedia to ask', () => {
    // A browser too old to answer is not a browser asking for light.
    window.matchMedia = undefined
    expect(systemTheme()).toBe('dark')
  })
})

describe('applyTheme', () => {
  it('puts the class the stylesheet keys off on the document', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('moves the browser chrome with the page', () => {
    // The address bar on Android and the status bar area of an installed PWA.
    // Neither is reachable from CSS, and a dark strip above a light page is
    // the most obvious way a theme switch looks half-finished.
    applyTheme('light')
    expect(metaColor()).toBe(PALETTE.light.ground)
    applyTheme('dark')
    expect(metaColor()).toBe(PALETTE.dark.ground)
  })

  it('resolves an unknown theme to the default rather than applying nothing', () => {
    applyTheme('sepia')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(metaColor()).toBe(PALETTE.dark.ground)
  })

  it('does not fail on a page with no theme-color meta', () => {
    // `applyTheme` is exported and the boot script owns that tag; a caller
    // rendering into a bare document should still get the class.
    document.head.innerHTML = ''
    expect(() => applyTheme('dark')).not.toThrow()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})

describe('useTheme', () => {
  it('follows the OS when nothing has been chosen', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('prefers an explicit choice over the OS', () => {
    stubMatchMedia(true)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
  })

  it('applies the theme to the document on mount', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(metaColor()).toBe(PALETTE.dark.ground)
  })

  it('toggles, applies and persists', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.toggleTheme() })
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('does not persist the theme it inherited from the OS', () => {
    // The load-bearing one. Writing on mount would turn "follow my system"
    // into "whatever my system said the first time I visited", permanently,
    // without the visitor touching anything.
    stubMatchMedia(true)
    renderHook(() => useTheme())
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('follows the OS changing while no choice has been made', () => {
    const media = stubMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
    act(() => { media.emit(true) })
    expect(result.current.theme).toBe('dark')
  })

  it('stops following the OS once the visitor has chosen', () => {
    const media = stubMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.toggleTheme() })
    expect(result.current.theme).toBe('dark')
    // The OS now swings to dark and back to light. Neither should move a
    // theme the visitor set by hand.
    act(() => { media.emit(true) })
    act(() => { media.emit(false) })
    expect(result.current.theme).toBe('dark')
  })

  it('stops listening when unmounted', () => {
    const media = stubMatchMedia(false)
    const { unmount } = renderHook(() => useTheme())
    expect(media.listenerCount).toBe(1)
    unmount()
    expect(media.listenerCount).toBe(0)
  })

  it('still applies the theme when storage refuses the write', () => {
    // The theme has to work for the session even where it cannot be
    // remembered; throwing here would take the toggle down entirely.
    stubMatchMedia(true)
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.toggleTheme() })
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('does not subscribe when there is no matchMedia', () => {
    window.matchMedia = undefined
    const { result, unmount } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    expect(() => unmount()).not.toThrow()
  })

  it('setTheme rejects a value this app has no theme for', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.setTheme('sepia') })
    expect(result.current.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })
})
