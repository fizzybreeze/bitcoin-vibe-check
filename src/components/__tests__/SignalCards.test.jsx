import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OnChainSignalsCard from '../OnChainSignalsCard.jsx'
import CycleIndicatorsCard from '../CycleIndicatorsCard.jsx'

// Build a minimal klines array of 200 entries at a fixed close price
function makeKlines200(closePrice) {
  return Array.from({ length: 200 }, (_, i) => [i, '0', '0', '0', String(closePrice), '0'])
}

describe('OnChainSignalsCard', () => {
  it('renders the card label while loading', () => {
    render(<OnChainSignalsCard isLoading={true} />)
    expect(screen.getByText(/on-chain signals/i)).toBeTruthy()
  })

  it('renders the MVRV value when provided', () => {
    render(<OnChainSignalsCard mvrv={2.15} />)
    expect(screen.getByText('2.15')).toBeTruthy()
  })

  it('shows "Fair Value" interpretation for MVRV 2.0', () => {
    render(<OnChainSignalsCard mvrv={2.0} />)
    expect(screen.getByText(/fair value/i)).toBeTruthy()
  })

  it('shows "Undervalued" for MVRV 1.2', () => {
    render(<OnChainSignalsCard mvrv={1.2} />)
    expect(screen.getByText(/undervalued/i)).toBeTruthy()
  })

  it('shows "Extremely Overvalued" for MVRV 4.0', () => {
    render(<OnChainSignalsCard mvrv={4.0} />)
    expect(screen.getByText(/extremely overvalued/i)).toBeTruthy()
  })

  it('shows a skeleton when mvrv is null and not loading (data absent but no error)', () => {
    const { container } = render(<OnChainSignalsCard mvrv={null} isLoading={false} />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('hides card entirely when error=true', () => {
    const { container } = render(<OnChainSignalsCard mvrv={null} isLoading={false} error={true} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('CycleIndicatorsCard', () => {
  it('renders the card label', () => {
    render(<CycleIndicatorsCard currentPrice={65000} ma200={null} ohlcLoading={true} />)
    expect(screen.getByText(/cycle indicators/i)).toBeTruthy()
  })

  it('always renders Power Law Fair Value (no OHLC needed)', () => {
    render(<CycleIndicatorsCard currentPrice={65000} ma200={null} ohlcLoading={false} />)
    expect(screen.getByText(/power law fair value/i)).toBeTruthy()
  })

  it('renders 200-Day MA and Mayer Multiple when ma200 is provided', () => {
    render(
      <CycleIndicatorsCard
        currentPrice={65000}
        ma200={50000}
        ohlcLoading={false}
        ohlcError={null}
      />
    )
    expect(screen.getByText(/200-day moving average/i)).toBeTruthy()
    expect(screen.getByText(/mayer multiple/i)).toBeTruthy()
  })

  it('shows "200-day data unavailable" on ohlcError', () => {
    render(
      <CycleIndicatorsCard
        currentPrice={65000}
        ma200={null}
        ohlcLoading={false}
        ohlcError="fetch failed"
      />
    )
    expect(screen.getByText(/200-day data unavailable/i)).toBeTruthy()
  })

  it('shows a loading skeleton while OHLC is loading', () => {
    const { container } = render(
      <CycleIndicatorsCard currentPrice={65000} ma200={null} ohlcLoading={true} ohlcError={null} />
    )
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })
})
