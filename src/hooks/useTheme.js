import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_THEME, PALETTE, THEME_STORAGE_KEY, THEMES, resolveTheme } from '../lib/palette.js'

// Which theme is on, and the one call that changes it.
//
// The class is applied to `<html>` by the boot script in `index.html` *before
// first paint*, and this hook re-applies it on mount. Both are needed and they
// are not redundant: without the boot script the page paints light and then
// snaps to dark, which is the flash every themed site is judged by; without the
// hook the class never changes when the toggle is pressed.
//
// **No stored preference means follow the operating system**, which is what the
// boot script has always assumed — it just had no light stylesheet to reveal it
// until now. An explicit press of the toggle wins permanently from then on;
// `DEFAULT_THEME` is only reached when there is no stored value *and* no
// `matchMedia` to ask, which is a very old browser rather than a preference.

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** What the OS is asking for, or the default when it cannot be asked. */
export function systemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return DEFAULT_THEME
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/**
 * The stored choice, or null for "no choice made".
 *
 * Null is a distinct answer from a theme name, which is the whole reason this
 * does not just return `DEFAULT_THEME`: absent means keep following the OS,
 * and collapsing the two would freeze the theme at whatever the OS happened to
 * say on the first visit.
 *
 * Reads of `localStorage` throw in Safari's private mode and wherever storage
 * is disabled. Swallowing that is safe here in a way it was not in v1.7.15 —
 * there is no user-visible failure being hidden, because the fallback path
 * (follow the OS) is a complete answer rather than a degraded one.
 */
export function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return THEMES.includes(stored) ? stored : null
  } catch {
    return null
  }
}

/**
 * Puts a theme on the document: the class the stylesheet keys off, and the
 * browser-chrome colour that sits *outside* it.
 *
 * `theme-color` is the address bar on Android and the status bar area on an
 * installed PWA — neither is reachable from CSS, and a dark strip above a light
 * page is the single most obvious way a theme switch looks half-finished.
 */
export function applyTheme(value) {
  const theme = resolveTheme(value)
  document.documentElement.classList.toggle('dark', theme === 'dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', PALETTE[theme].ground)
  return theme
}

export default function useTheme() {
  const [theme, setThemeState] = useState(() => readStoredTheme() ?? systemTheme())

  useEffect(() => { applyTheme(theme) }, [theme])

  // Follow the OS until the visitor has said otherwise. Re-read the stored
  // value inside the handler rather than closing over it, so a press of the
  // toggle stops the following immediately without re-subscribing.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia(DARK_QUERY)
    const onChange = (event) => {
      if (readStoredTheme() === null) setThemeState(event.matches ? 'dark' : 'light')
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((value) => {
    const next = resolveTheme(value)
    setThemeState(next)
    // Written here rather than in the effect above: the effect also runs for
    // the value inherited from the OS, and persisting that would silently
    // freeze the theme at whatever it was on the first visit.
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Storage refused; the theme still applies for this session.
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return { theme, setTheme, toggleTheme }
}
