import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import InstitutionalPulseCard from '../InstitutionalPulseCard.jsx'
import OnChainSignalsCard from '../OnChainSignalsCard.jsx'
import CycleIndicatorsCard from '../CycleIndicatorsCard.jsx'

// Build a minimal klines array of 200 entries at a fixed close price
function makeKlines200(closePrice) {
  return Array.from({ length: 200 }, (_, i) => [i, '0', '0', '0', String(closePrice), '0'])
}

describe('InstitutionalPulseCard', () => {
  it('renders the card label', () => {
    render(<InstitutionalPulseCard />)
    expect(screen.getByText(/institutional pulse/i)).toBeTruthy()
  })

  it('shows "Accumulating" when btcHeld increased over 7 days', () => {
    render(<InstitutionalPulseCard btcHeld={1_100_000} btcHeld7dAgo={1_000_000} />)
    expect(screen.getByText(/accumulating/i)).toBeTruthy()
  })

  it('shows "Distributing" when btcHeld decreased over 7 days', () => {
    render(<InstitutionalPulseCard btcHeld={900_000} btcHeld7dAgo={1_000_000} />)
    expect(screen.getByText(/distributing/i)).toBeTruthy()
  })

  it('shows "Neutral" when change is negligible', () => {
    render(<InstitutionalPulseCard btcHeld={1_000_010} btcHeld7dAgo={1_000_000} />)
    expect(screen.getByText(/neutral/i)).toBeTruthy()
  })

  it('shows "Data unavailable" when btcHeld is null and not loading', () => {
    render(<InstitutionalPulseCard btcHeld={null} isLoading={false} />)
    expect(screen.getByText(/data unavailable/i)).toBeTruthy()
  })

  it('shows a loading skeleton when isLoading=true and no data yet', () => {
    const { container } = render(<InstitutionalPulseCard btcHeld={null} isLoading={true} />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })
})

describe('OnChainSignalsCard', () => {
  it('renders the card label', () => {
    render(<OnChainSignalsCard />)
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

  it('shows "Data unavailable" when mvrv is null and not loading', () => {
    render(<OnChainSignalsCard mvrv={null} isLoading={false} />)
    expect(screen.getByText(/data unavailable/i)).toBeTruthy()
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
