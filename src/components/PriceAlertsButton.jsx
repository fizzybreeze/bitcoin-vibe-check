import Icon from './Icon.jsx'
import { ICON_BUTTON_LABELLED } from '../lib/icons.js'

export default function PriceAlertsButton({ onClick, hasActiveAlerts }) {
  return (
    <button
      onClick={onClick}
      aria-label="Alerts"
      className={`relative ${ICON_BUTTON_LABELLED} text-accent hover:text-accent-hover`}
    >
      <Icon name="bell" size="lg" />
      <span className="hidden md:inline">Alerts</span>
      {hasActiveAlerts && (
        <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-accent md:hidden" aria-hidden="true" />
      )}
      {hasActiveAlerts && (
        <span className="hidden md:inline-flex h-1.5 w-1.5 rounded-full bg-accent ml-0.5" aria-hidden="true" />
      )}
    </button>
  )
}
