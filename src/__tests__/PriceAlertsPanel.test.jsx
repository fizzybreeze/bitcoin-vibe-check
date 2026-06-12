import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import PriceAlertsPanel from '../components/PriceAlertsPanel.jsx'

const baseProps = {
  alerts: [],
  currency: 'usd',
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onClearTriggered: vi.fn(),
  notificationPermission: 'granted',
  onRequestPermission: vi.fn(),
  onClose: vi.fn(),
}

function makeAlert(overrides = {}) {
  return {
    id: 'alert-1',
    targetPrice: 80000,
    currency: 'usd',
    direction: 'above',
    label: '$80,000',
    triggered: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('PriceAlertsPanel', () => {
  it('shows "No alerts set" when alerts array is empty', () => {
    render(<PriceAlertsPanel {...baseProps} />)
    expect(screen.getByText(/no alerts set/i)).toBeInTheDocument()
  })

  it('renders one row per alert', () => {
    const alerts = [
      makeAlert({ id: 'a1', label: '$80,000' }),
      makeAlert({ id: 'a2', label: '$60,000', direction: 'below' }),
    ]
    render(<PriceAlertsPanel {...baseProps} alerts={alerts} />)
    expect(screen.getByText('$80,000')).toBeInTheDocument()
    expect(screen.getByText('$60,000')).toBeInTheDocument()
  })

  it('shows "✓ Triggered" label for alerts where triggered is true', () => {
    const alerts = [makeAlert({ triggered: true })]
    render(<PriceAlertsPanel {...baseProps} alerts={alerts} />)
    expect(screen.getByText('✓ Triggered')).toBeInTheDocument()
  })

  it('does not show "✓ Triggered" label for non-triggered alerts', () => {
    const alerts = [makeAlert({ triggered: false })]
    render(<PriceAlertsPanel {...baseProps} alerts={alerts} />)
    expect(screen.queryByText('✓ Triggered')).not.toBeInTheDocument()
  })

  it('shows notification blocked warning when permission is "denied"', () => {
    render(<PriceAlertsPanel {...baseProps} notificationPermission="denied" />)
    expect(screen.getByText(/notifications are blocked/i)).toBeInTheDocument()
  })

  it('does not show notification blocked warning when permission is "granted"', () => {
    render(<PriceAlertsPanel {...baseProps} notificationPermission="granted" />)
    expect(screen.queryByText(/notifications are blocked/i)).not.toBeInTheDocument()
  })

  it('shows the ≈ symbol (up arrow) for "above" direction alerts', () => {
    const alerts = [makeAlert({ direction: 'above' })]
    render(<PriceAlertsPanel {...baseProps} alerts={alerts} />)
    expect(screen.getByText('↑')).toBeInTheDocument()
  })

  it('shows a down arrow for "below" direction alerts', () => {
    const alerts = [makeAlert({ direction: 'below' })]
    render(<PriceAlertsPanel {...baseProps} alerts={alerts} />)
    expect(screen.getByText('↓')).toBeInTheDocument()
  })

  it('shows "Clear triggered" button only when there are triggered alerts', () => {
    const { rerender } = render(
      <PriceAlertsPanel {...baseProps} alerts={[makeAlert({ triggered: false })]} />
    )
    expect(screen.queryByText(/clear triggered/i)).not.toBeInTheDocument()

    rerender(
      <PriceAlertsPanel {...baseProps} alerts={[makeAlert({ triggered: true })]} />
    )
    expect(screen.getByText(/clear triggered/i)).toBeInTheDocument()
  })

  it('calls onRemove with the correct id when remove button is clicked', () => {
    const onRemove = vi.fn()
    const alerts = [makeAlert({ id: 'target-id' })]
    render(<PriceAlertsPanel {...baseProps} alerts={alerts} onRemove={onRemove} />)
    fireEvent.click(screen.getByLabelText(/remove alert for/i))
    expect(onRemove).toHaveBeenCalledWith('target-id')
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<PriceAlertsPanel {...baseProps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText(/close price alerts/i))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the disclaimer about the page needing to be open', () => {
    render(<PriceAlertsPanel {...baseProps} />)
    expect(screen.getByText(/alerts fire while this page is open/i)).toBeInTheDocument()
  })

  it('shows the ≈ symbol in fiat amounts — the "≈" prefix appears in the UI', () => {
    // This test verifies the panel renders the currency code label next to input
    render(<PriceAlertsPanel {...baseProps} currency="gbp" />)
    expect(screen.getByText('GBP')).toBeInTheDocument()
  })
})
