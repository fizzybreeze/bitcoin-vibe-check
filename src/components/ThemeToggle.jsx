/**
 * The theme switch, in the header control cluster.
 *
 * The icon shows the theme you would get by pressing it, not the one you are
 * in — a sun while dark, a moon while light. Both readings are defensible and
 * neither is guessable from an icon alone, which is why the accessible name
 * says the action outright rather than naming a state.
 */
export default function ThemeToggle({ theme, onToggle }) {
  const toLight = theme === 'dark'

  return (
    <button
      onClick={onToggle}
      aria-label={toLight ? 'Switch to light theme' : 'Switch to dark theme'}
      title={toLight ? 'Switch to light theme' : 'Switch to dark theme'}
      className="flex items-center justify-center w-7 h-7 rounded-full text-quiet transition-colors hover:text-accent"
    >
      {toLight ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}
