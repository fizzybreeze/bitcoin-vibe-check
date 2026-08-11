import Icon from './Icon.jsx'
import { ICON_BUTTON_LABELLED } from '../lib/icons.js'

export default function ShareButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Share dashboard"
      className={`${ICON_BUTTON_LABELLED} text-accent hover:text-accent-hover`}
    >
      {/* `lg`, matching the bell it sits beside. These two were 12 and 16 with
          stroke weights of 2.5 and 2, which is the drift the shared scale ends. */}
      <Icon name="share" size="lg" />
      <span className="hidden md:inline">Share</span>
    </button>
  )
}
