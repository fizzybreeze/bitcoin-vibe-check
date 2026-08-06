import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CycleIndicatorsCard from '../CycleIndicatorsCard.jsx'

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

  it('shows dash placeholders on ohlcError', () => {
    render(
      <CycleIndicatorsCard
        currentPrice={65000}
        ma200={null}
        ohlcLoading={false}
        ohlcError="fetch failed"
      />
    )
    expect(screen.getByText('200-Day Moving Average')).toBeTruthy()
    expect(screen.getByText('Mayer Multiple')).toBeTruthy()
  })

  it('shows a loading skeleton while OHLC is loading', () => {
    const { container } = render(
      <CycleIndicatorsCard currentPrice={65000} ma200={null} ohlcLoading={true} ohlcError={null} />
    )
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  // `/api/chain-data` serves the last stored MVRV when the BGeometrics budget is
  // exhausted (roadmap §3.2b). The value is a day or more old, so the card has
  // to say where it came from — a fallback that presents itself as live is the
  // one way this feature could be worse than the blank card it replaces.
  it('marks an MVRV served from the daily snapshot', () => {
    render(
      <CycleIndicatorsCard
        currentPrice={65000} ma200={50000} ohlcLoading={false}
        mvrv={2.15} dataDate="2026-08-05" mvrvSource="snapshot"
      />
    )
    expect(screen.getByText(/2026-08-05.*daily snapshot/i)).toBeTruthy()
  })

  it('says nothing extra about a live MVRV', () => {
    render(
      <CycleIndicatorsCard
        currentPrice={65000} ma200={50000} ohlcLoading={false}
        mvrv={2.15} dataDate="2026-08-05" mvrvSource="live"
      />
    )
    expect(screen.getByText('2026-08-05')).toBeTruthy()
    expect(screen.queryByText(/snapshot/i)).toBeNull()
  })
})
