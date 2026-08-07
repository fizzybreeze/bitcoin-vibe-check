// The price chart was the last card still inline in App.jsx, and the largest.
// These cover its chrome — range toggles, the two error states, the loading
// overlay — which is everything a reader interacts with and none of what
// recharts draws. `ResponsiveContainer` has no dimensions under jsdom, so the
// chart body itself is asserted in `ohlcDedupe.spec.js` against a real browser.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import PriceChartCard from '../PriceChartCard.jsx'

const RANGES = [
  { label: '1D', days: 1   },
  { label: '7D', days: 7   },
  { label: '1M', days: 30  },
  { label: '1Y', days: 365 },
]

const chart = [
  { date: '1 Aug', price: 100_000, volume: 1e9 },
  { date: '2 Aug', price: 104_000, volume: 2e9 },
]

const renderCard = props => render(
  <PriceChartCard
    chart={chart}
    chartLoading={false}
    chartError={null}
    chartChange={2.5}
    range="7D"
    setRange={() => {}}
    refreshChart={() => {}}
    ranges={RANGES}
    currency="usd"
    {...props}
  />
)

afterEach(cleanup)

describe('PriceChartCard', () => {
  it('renders one toggle per range and highlights the active one', () => {
    // The list is a prop, not an import: App owns it because the same mapping
    // drives the fetch, and a second copy here would be free to drift.
    renderCard()
    for (const { label } of RANGES) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: '7D' })).toHaveClass('bg-orange-500')
    expect(screen.getByRole('button', { name: '1M' })).not.toHaveClass('bg-orange-500')
  })

  it('reports the chosen range to its parent', () => {
    const setRange = vi.fn()
    renderCard({ setRange })
    fireEvent.click(screen.getByRole('button', { name: '1Y' }))
    expect(setRange).toHaveBeenCalledWith('1Y')
  })

  it('labels the chart with the selected currency', () => {
    renderCard({ currency: 'gbp' })
    expect(screen.getByText(/Price · GBP/)).toBeInTheDocument()
  })

  it('colours the range change by direction', () => {
    const { rerender } = renderCard({ chartChange: 2.5 })
    expect(screen.getByTestId('chart-range-change')).toHaveClass('text-green-400')
    expect(screen.getByTestId('chart-range-change')).toHaveTextContent('+2.50%')

    rerender(
      <PriceChartCard chart={chart} chartLoading={false} chartError={null} chartChange={-1.25}
        range="7D" setRange={() => {}} refreshChart={() => {}} ranges={RANGES} currency="usd" />
    )
    expect(screen.getByTestId('chart-range-change')).toHaveClass('text-red-400')
  })

  it('hides the range change while a fetch is in flight', () => {
    // Showing the previous range's move next to the new range's chart is worse
    // than showing nothing — it reads as this range's number.
    renderCard({ chartLoading: true })
    expect(screen.queryByTestId('chart-range-change')).not.toBeInTheDocument()
  })

  it('distinguishes a retrying failure from a final one', () => {
    const { rerender } = renderCard({ chartError: 'temp' })
    expect(screen.getByText(/Retrying/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry chart' })).not.toBeInTheDocument()

    rerender(
      <PriceChartCard chart={chart} chartLoading={false} chartError="permanent" chartChange={null}
        range="7D" setRange={() => {}} refreshChart={() => {}} ranges={RANGES} currency="usd" />
    )
    // Only the final state offers a manual retry; the temporary one is already
    // retrying on its own and a second button would race it.
    expect(screen.getByRole('button', { name: 'Retry chart' })).toBeInTheDocument()
  })

  it('lets the reader force a refetch', () => {
    const refreshChart = vi.fn()
    renderCard({ refreshChart })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh chart' }))
    expect(refreshChart).toHaveBeenCalled()
  })

  it('disables the refresh button while a fetch is already running', () => {
    renderCard({ chartLoading: true })
    expect(screen.getByRole('button', { name: 'Refresh chart' })).toBeDisabled()
  })

  it('shows a skeleton on first load but keeps the old chart on a refresh', () => {
    const { rerender } = renderCard({ chart: null, chartLoading: true })
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()

    // Same load state, but a chart is already on screen: it stays, dimmed,
    // under a "Loading..." overlay rather than collapsing to a skeleton.
    rerender(
      <PriceChartCard chart={chart} chartLoading={true} chartError={null} chartChange={null}
        range="7D" setRange={() => {}} refreshChart={() => {}} ranges={RANGES} currency="usd" />
    )
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
