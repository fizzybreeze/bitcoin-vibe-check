import { useState, useEffect, useLayoutEffect, useRef } from 'react'

export default function CardTooltip({ text }) {
  const [visible, setVisible] = useState(false)
  const [above, setAbove]     = useState(false)
  const [offset, setOffset]   = useState(0)
  const containerRef = useRef(null)
  const tooltipRef   = useRef(null)

  useEffect(() => {
    if (!visible) return
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setVisible(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [visible])

  // Clamp tooltip within viewport after it renders — runs synchronously before paint
  useLayoutEffect(() => {
    if (!visible || !tooltipRef.current) return
    const vw = window.innerWidth
    if (vw <= 0) return
    const rect = tooltipRef.current.getBoundingClientRect()
    let shift = 0
    if (rect.left < 8)          shift = 8 - rect.left
    else if (rect.right > vw - 8) shift = (vw - 8) - rect.right
    setOffset(shift)
  }, [visible]) // intentionally excludes offset — one correction pass only

  function toggle(e) {
    e.stopPropagation()
    if (!visible && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setAbove(rect.top > window.innerHeight / 2)
      setOffset(0)
    }
    setVisible(v => !v)
  }

  return (
    <span ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={toggle}
        aria-label="More information"
        className={`flex items-center justify-center w-3.5 h-3.5 ml-1 rounded-full transition-colors focus:outline-none ${
          visible ? 'text-gray-400' : 'text-gray-600 hover:text-gray-400'
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.2" />
          <path d="M6 5v3.5M6 3.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {visible && (
        <div
          ref={tooltipRef}
          data-testid="tooltip-content"
          style={{
            background: '#0f172a',
            left: `calc(50% + ${offset}px)`,
            transform: 'translateX(-50%)',
          }}
          className={`absolute z-50 w-56 rounded-xl border border-gray-700 px-3 py-2.5 text-xs leading-relaxed text-gray-300 shadow-2xl normal-case tracking-normal font-normal ${
            above ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {text}
        </div>
      )}
    </span>
  )
}
