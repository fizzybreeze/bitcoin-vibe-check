export default function ShareButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Share dashboard"
      className="flex items-center justify-center w-7 h-7 rounded-full text-accent transition-colors hover:text-accent-hover md:w-auto md:h-auto md:gap-1.5 md:bg-raised md:px-3 md:py-1 md:text-xs md:font-semibold md:hover:bg-hover md:hover:text-accent"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
      <span className="hidden md:inline">Share</span>
    </button>
  )
}
