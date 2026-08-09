import { useState, useRef } from 'react'
import ShareCanvas from './ShareCanvas.jsx'
import { useShareImage } from '../hooks/useShareImage.js'
import { SHARE_CARDS } from './shareCards.js'
import { PALETTE, resolveTheme } from '../lib/palette.js'

/**
 * A token as rgba. Inline styles cannot use Tailwind's `/30` opacity syntax,
 * and this modal is styled inline throughout — so the three translucent
 * surfaces here are derived from the same tokens the classes would have used
 * rather than being written out as a second set of colours.
 */
function withAlpha(hex, a) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export default function ShareModal({ isOpen, onClose, cardData, sentimentSummary, currency, theme }) {
  const [selectedCards, setSelectedCards] = useState(() => SHARE_CARDS.map(c => c.key))
  const canvasRef = useRef(null)
  // Resolved here rather than in each consumer: the modal, the off-screen
  // canvas and the html2canvas background must all be the same theme, or the
  // captured image gets a border of the other one.
  const t = resolveTheme(theme)
  const p = PALETTE[t]
  const { generateImage, isGenerating } = useShareImage(canvasRef, t)

  if (!isOpen) return null

  function toggleCard(key) {
    setSelectedCards(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share dashboard image"
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: withAlpha(p.scrim, 0.7) }}
    >
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 480,
        background: p.surface,
        border: `1px solid ${withAlpha(p.accent, 0.3)}`,
        borderRadius: 16,
        padding: 24,
        color: p.ink,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: p.quiet, fontSize: 14, cursor: 'pointer', padding: 4, lineHeight: 1 }}
        >
          ✕
        </button>

        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>Share Dashboard</h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: p.quiet }}>Choose cards to include in your share image.</p>

        {/* Card selection */}
        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 20px' }}>
          <legend style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: p.quiet, marginBottom: 12 }}>
            Include Cards
          </legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
            {SHARE_CARDS.map(({ key, label }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={selectedCards.includes(key)}
                  onChange={() => toggleCard(key)}
                  aria-label={label}
                  style={{ accentColor: p.accent, width: 14, height: 14, cursor: 'pointer' }}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => generateImage(false)}
            disabled={isGenerating || selectedCards.length === 0}
            style={{
              flex: 1,
              padding: '10px 20px',
              borderRadius: 9999,
              fontSize: 14,
              fontWeight: 600,
              cursor: isGenerating || selectedCards.length === 0 ? 'not-allowed' : 'pointer',
              border: 'none',
              background: p['accent-fill'],
              color: p['accent-ink'],
              opacity: isGenerating || selectedCards.length === 0 ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {isGenerating ? (
              <>
                <SpinnerIcon />
                Generating…
              </>
            ) : (
              <>
                <ShareIcon />
                Share
              </>
            )}
          </button>
          <button
            onClick={() => generateImage(true)}
            disabled={isGenerating || selectedCards.length === 0}
            style={{
              flex: 1,
              padding: '10px 20px',
              borderRadius: 9999,
              fontSize: 14,
              fontWeight: 600,
              cursor: isGenerating || selectedCards.length === 0 ? 'not-allowed' : 'pointer',
              border: `1px solid ${withAlpha(p.accent, 0.4)}`,
              background: 'transparent',
              color: p.accent,
              opacity: isGenerating || selectedCards.length === 0 ? 0.6 : 1,
            }}
          >
            Download
          </button>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '8px',
              borderRadius: 9999,
              fontSize: 13,
              cursor: 'pointer',
              border: 'none',
              background: 'transparent',
              color: p.quiet,
            }}
          >
            Cancel
          </button>
        </div>

        {/* Off-screen ShareCanvas for html2canvas capture */}
        <ShareCanvas
          selectedCards={selectedCards}
          sentimentSummary={sentimentSummary}
          cardData={cardData}
          currency={currency}
          forwardedRef={canvasRef}
          theme={t}
        />
      </div>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite' }}
      aria-hidden="true"
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </svg>
  )
}
