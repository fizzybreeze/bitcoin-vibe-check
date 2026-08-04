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
})
