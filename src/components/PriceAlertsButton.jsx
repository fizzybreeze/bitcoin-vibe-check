export default function PriceAlertsButton({ onClick, hasActiveAlerts }) {
  return (
    <button
      onClick={onClick}
      aria-label="Price alerts"
      className="relative flex items-center justify-center w-7 h-7 rounded-full text-orange-400 transition-colors hover:text-orange-300 md:w-auto md:h-auto md:gap-1.5 md:bg-gray-800 md:px-3 md:py-1 md:text-xs md:font-semibold md:hover:bg-gray-700 md:hover:text-orange-400"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <span className="hidden md:inline">Alerts</span>
      {hasActiveAlerts && (
        <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-orange-400 md:hidden" aria-hidden="true" />
      )}
      {hasActiveAlerts && (
        <span className="hidden md:inline-flex h-1.5 w-1.5 rounded-full bg-orange-400 ml-0.5" aria-hidden="true" />
      )}
    </button>
  )
}
