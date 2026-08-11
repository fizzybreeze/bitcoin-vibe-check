import { useCallback, useEffect, useSyncExternalStore } from 'react'
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

// ── One value, however many components ask for it ──────────────────────────
//
// This was `useState` per caller, which is fine while exactly one component
// reads the theme and wrong the moment a second does: each instance gets its
// own copy, and only the one whose `toggleTheme` ran re-renders. Everything
// else keeps painting the theme that was on when it mounted.
//
// That is invisible for anything styled with a `dark:` variant or a token,
// because the stylesheet does not care what React thinks. It bites exactly the
// components that *cannot* use a class — an SVG `fill` takes a value — which is
// the wordmark and the Vibe Score character. Measured: after a toggle to light,
// `--color-ink` is `#241f38` and the wordmark was still filling `#ffffff`,
// white on a near-white ground.
//
// A store rather than a context, because a context needs a provider and a
// provider is something the next caller can forget to be inside. `getSnapshot`
// re-derives when nothing is mounted, so the value is read fresh on the first
// mount exactly as `useState`'s initialiser did.

const listeners = new Set()
let current = null

function getSnapshot() {
  if (current === null) current = readStoredTheme() ?? systemTheme()
  return current
}

function emit(next) {
  if (next === current) return
  current = next
  for (const fn of listeners) fn()
}

function subscribe(onChange) {
  listeners.add(onChange)
  // The OS listener belongs to the store, not to a component: one subscription
  // however many consumers, and it stops existing when the last one unmounts.
  if (listeners.size === 1) attachSystemListener()
  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0) {
      detachSystemListener()
      // Nothing is mounted to keep in sync, so the next mount re-reads rather
      // than resuming a value that may have been changed in another tab.
      current = null
    }
  }
}

let detachSystemListener = () => {}

// Follow the OS until the visitor has said otherwise. The stored value is read
// inside the handler rather than closed over, so a press of the toggle stops
// the following immediately.
function attachSystemListener() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  const query = window.matchMedia(DARK_QUERY)
  const onChange = (event) => {
    if (readStoredTheme() === null) emit(event.matches ? 'dark' : 'light')
  }
  query.addEventListener('change', onChange)
  detachSystemListener = () => {
    query.removeEventListener('change', onChange)
    detachSystemListener = () => {}
  }
}

export default function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => { applyTheme(theme) }, [theme])

  const setTheme = useCallback((value) => {
    const next = resolveTheme(value)
    emit(next)
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
