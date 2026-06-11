import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ShareModal, { SHARE_CARDS } from '../ShareModal.jsx'

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toBlob: vi.fn((cb) => cb(new Blob(['img'], { type: 'image/png' }))),
  }),
}))

const mockCardData = {
  priceUsd: 100_000,
  priceGbp: 79_000,
  priceEur: 92_000,
  priceCad: 136_000,
  priceChf: 89_000,
  priceChange24h: 2.5,
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
  athUsd: 109_000,
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

  it('calls onClose when the ✕ button is clicked', () => {
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

  it('renders the three v1.4 signal card checkboxes checked by default', () => {
    renderModal()
    const labels = ['Institutional Pulse', 'On-Chain Signals', 'Cycle Indicators']
    for (const label of labels) {
      const checkbox = screen.getByRole('checkbox', { name: label })
      expect(checkbox).toBeInTheDocument()
      expect(checkbox).toBeChecked()
    }
  })
})
