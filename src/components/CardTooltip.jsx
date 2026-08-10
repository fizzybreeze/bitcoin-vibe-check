import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { PALETTE } from '../lib/palette.js'
import useTheme from '../hooks/useTheme.js'
import Icon from './Icon.jsx'

export default function CardTooltip({ text }) {
  const { theme } = useTheme()
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
    // Escape as well as a press outside. The button toggles, so this was
    // already dismissible from the keyboard — but only by finding your way back
    // to a 14px control that the tooltip you just opened may now be covering,
    // and Escape is the key everyone reaches for anyway.
    function handleEscape(e) {
      if (e.key === 'Escape') setVisible(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('keydown', handleEscape)
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
        aria-expanded={visible}
        className={`flex items-center justify-center w-3.5 h-3.5 ml-1 rounded-full transition-colors ${
          visible ? 'text-muted' : 'text-quiet hover:text-muted'
        }`}
      >
        <Icon name="info" size="sm" />
      </button>

      {visible && (
        <div
          ref={tooltipRef}
          data-testid="tooltip-content"
          style={{
            background: PALETTE[theme].raised,
            left: `calc(50% + ${offset}px)`,
            transform: 'translateX(-50%)',
          }}
          className={`absolute z-50 w-56 rounded-xl border border-line px-3 py-2.5 text-xs leading-relaxed text-ink-dim shadow-2xl normal-case tracking-normal font-normal ${
            above ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {text}
        </div>
      )}
    </span>
  )
}
