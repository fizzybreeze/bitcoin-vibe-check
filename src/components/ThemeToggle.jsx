import Icon from './Icon.jsx'
import { ICON_BUTTON } from '../lib/icons.js'

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
  const action = toLight ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <button
      onClick={onToggle}
      aria-label={action}
      title={action}
      className={`${ICON_BUTTON} text-quiet hover:text-accent`}
    >
      <Icon name={toLight ? 'sun' : 'moon'} size="lg" />
    </button>
  )
}
