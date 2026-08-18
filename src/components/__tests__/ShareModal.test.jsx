import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ShareModal from '../ShareModal.jsx'
import { SHARE_CARDS } from '../shareCards.js'
import { PALETTE } from '../../lib/palette.js'
import html2canvas from 'html2canvas'

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toBlob: vi.fn((cb) => cb(new Blob(['img'], { type: 'image/png' }))),
  }),
}))

// jsdom serialises an inline colour as `rgb(r, g, b)`.
function rgb(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

const mockCardData = {
  priceUsd: 100_000,
  priceGbp: 79_000,
  priceEur: 92_000,
  priceCad: 136_000,
  priceChf: 89_000,
  // Per currency, matching what `mergeMarketData` actually returns — a fixture
  // carrying a shape the app no longer produces is a shape the next reader
  // copies.
  priceChange24hUsd: 2.5,
  priceChange24hGbp: -1.25,
  athUsd: 109_000,
  fng: { value: '72', value_classification: 'Greed' },
  difficulty: { difficultyChange: 2.1, timeAvg: 600_000, remainingBlocks: 1200 },
  volumeUsd: 50_000_000_000,
  volumeGbp: 39_500_000_000,
  volumeEur: 46_000_000_000,
  volumeCad: 68_000_000_000,
  volumeChf: 44_500_000_000,
  btcDominance: 54.2,
  marketCapUsd: 1_980_000_000_000,
  blockHeight: 900_000,
  lastBlockTs: Math.floor(Date.now() / 1000) - 300,
  fees: { hourFee: 5, halfHourFee: 8, fastestFee: 12 },
  mempool: { vsize: 15_000_000, count: 12_000 },
  lightning: null,
}

function renderModal(props = {}) {
  return render(
    <ShareModal
      isOpen={true}
      onClose={vi.fn()}
      cardData={mockCardData}
      sentimentSummary="Market is greedy, price is up, miners are steady."
      currency="usd"
      {...props}
    />
  )
}

describe('ShareModal', () => {
  it('renders all shareable card checkboxes checked by default', () => {
    renderModal()
    for (const { label } of SHARE_CARDS) {
      const checkbox = screen.getByRole('checkbox', { name: label })
      expect(checkbox).toBeInTheDocument()
      expect(checkbox).toBeChecked()
    }
  })

  it('does not render excluded card checkboxes', () => {
    renderModal()
    // Price chart excluded
    expect(screen.queryByRole('checkbox', { name: /chart/i })).toBeNull()
    // Supporters excluded
    expect(screen.queryByRole('checkbox', { name: /supporters/i })).toBeNull()
    // Newsletter excluded
    expect(screen.queryByRole('checkbox', { name: /newsletter/i })).toBeNull()
    // Donate/support excluded
    expect(screen.queryByRole('checkbox', { name: /donat/i })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /support/i })).toBeNull()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders nothing when isOpen is false', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('allows toggling a card off and back on', () => {
    renderModal()
    const checkbox = screen.getByRole('checkbox', { name: 'BTC Price' })
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('does not render an aspect ratio toggle', () => {
    renderModal()
    expect(screen.queryByRole('button', { name: '16:9' })).toBeNull()
    expect(screen.queryByRole('button', { name: '1:1' })).toBeNull()
  })

  // The theme reaches three places from here — the modal's own surface, the
  // off-screen canvas, and the background html2canvas paints behind it. Each is
  // a hand-written line, and a missed one shows up only in the exported PNG.
  it('follows the theme it is given, and passes it to the canvas', () => {
    const { container } = renderModal({ theme: 'light' })
    expect(screen.getByRole('dialog').firstChild.style.background)
      .toBe(rgb(PALETTE.light.surface))
    // The off-screen capture target is the modal's last child.
    const canvasSheet = container.querySelector('[style*="-9999px"]').firstChild
    // `backgroundColor`, not `background`: the sheet carries the CRT raster as
    // a `background-image` and the shorthand would reset it.
    expect(canvasSheet.style.backgroundColor).toBe(rgb(PALETTE.light.ground))
  })

  it('defaults to the dark theme when given none', () => {
    const { container } = renderModal()
    expect(container.querySelector('[style*="-9999px"]').firstChild.style.backgroundColor)
      .toBe(rgb(PALETTE.dark.ground))
  })

  it('captures on the active theme rather than a fixed background', async () => {
    // A dark background behind a light card frames the image in the theme the
    // visitor is not using — which is invisible until the PNG is posted.
    vi.mocked(html2canvas).mockClear()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    try {
      renderModal({ theme: 'light' })
      fireEvent.click(screen.getByRole('button', { name: /download/i }))
      await waitFor(() => expect(html2canvas).toHaveBeenCalled())
      expect(html2canvas.mock.calls[0][1].backgroundColor).toBe(PALETTE.light.ground)
    } finally {
      createObjectURL.mockRestore()
      revokeObjectURL.mockRestore()
    }
  })

  it('renders the v1.4 signal card checkboxes checked by default', () => {
    renderModal()
    const labels = ['Market Sentiment', 'Network Health', 'Cycle Indicators']
    for (const label of labels) {
      const checkbox = screen.getByRole('checkbox', { name: label })
      expect(checkbox).toBeInTheDocument()
      expect(checkbox).toBeChecked()
    }
  })
  // ── Keyboard operability (roadmap §5) ──────────────────────────────────────

  it('moves focus into the dialog when it opens', () => {
    renderModal()
    // The close control, which is the one element guaranteed to be useful to
    // someone who did not mean to open this.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('holds Tab inside itself, because it is a modal over a scrim', () => {
    renderModal()
    const focusables = [...document.querySelector('[role="dialog"]')
      .querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), iframe')]
    const last = focusables[focusables.length - 1]
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
  })

  it('does not reach into the off-screen capture target when it wraps', () => {
    // `ShareCanvas` is parked at left:-9999px for html2canvas. If it ever grew a
    // focusable element the trap would wrap onto something invisible, and the
    // visitor would be tabbing into a void with nothing on screen to say so.
    renderModal()
    const canvas = document.querySelector('[role="dialog"] div[style*="-9999px"]')
    expect(canvas, 'the off-screen capture target moved').not.toBeNull()
    expect(canvas.querySelectorAll('a[href], button, input, select, textarea, iframe')).toHaveLength(0)
  })
})
