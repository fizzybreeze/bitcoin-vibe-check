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
    expect(screen.getByRole('button', { name: '7D' })).toHaveClass('bg-accent-fill')
    expect(screen.getByRole('button', { name: '1M' })).not.toHaveClass('bg-accent-fill')
  })

  it('reports the chosen range to its parent', () => {
    const setRange = vi.fn()
    renderCard({ setRange })
    fireEvent.click(screen.getByRole('button', { name: '1Y' }))
    expect(setRange).toHaveBeenCalledWith('1Y')
  })

  it('labels the chart with the currency the candles are in', () => {
    renderCard({ currency: 'gbp', chartCurrency: 'gbp', chartRequestedCurrency: 'gbp' })
    expect(screen.getByText(/Price · GBP/)).toBeInTheDocument()
  })

  it('does not announce a fallback in the frame after a currency switch', () => {
    // The selector updates in the render that follows the change event; the new
    // candles arrive an effect later. So there is a frame where an already-drawn
    // USD chart sits under a GBP selection — and comparing the served currency
    // against the *selector* paints "No Kraken GBP market" in it, on a currency
    // that has one. The comparison is between the series' own two currencies,
    // which cannot come apart that way.
    renderCard({ currency: 'gbp', chartCurrency: 'usd', chartRequestedCurrency: 'usd' })
    expect(screen.queryByTestId('chart-currency-fallback')).not.toBeInTheDocument()
    expect(screen.getByText(/Price · USD/)).toBeInTheDocument()
  })

  it('labels the chart in dollars when the selection fell back, and says so', () => {
    // The defect this card shipped with, from the other side: the heading used
    // to follow the selector while the data stayed in dollars. It must never
    // name a currency the candles are not in, and when the two differ the reader
    // is owed the reason — otherwise a GBP selection silently draws dollars.
    renderCard({ currency: 'chf', chartCurrency: 'usd', chartRequestedCurrency: 'chf' })
    expect(screen.getByText(/Price · USD/)).toBeInTheDocument()
    expect(screen.queryByText(/Price · CHF/)).not.toBeInTheDocument()
    expect(screen.getByTestId('chart-currency-fallback')).toHaveTextContent(/No Kraken CHF market · chart in USD/)
  })

  it('says nothing when the chart is in the currency that was asked for', () => {
    // The heading already names it. The caption this replaced was permanent and
    // read "Chart in USD" under a heading that said GBP.
    renderCard({ currency: 'eur', chartCurrency: 'eur', chartRequestedCurrency: 'eur' })
    expect(screen.queryByTestId('chart-currency-fallback')).not.toBeInTheDocument()
  })

  it('does not blame a missing market for a fetch that merely failed', () => {
    // A transient failure leaves the previous currency's candles on screen, so
    // the selection and the chart disagree for a reason that has nothing to do
    // with Kraken's markets. The retry notice already explains itself; "No
    // Kraken GBP market" would be a confident wrong answer to a dropped packet.
    renderCard({ currency: 'gbp', chartCurrency: 'usd', chartRequestedCurrency: 'usd', chartError: 'temp' })
    expect(screen.queryByTestId('chart-currency-fallback')).not.toBeInTheDocument()
    expect(screen.getByText(/Retrying/)).toBeInTheDocument()
  })

  it('keeps the note on a fallback that is still on screen during a retry', () => {
    // The other half of the same rule. These candles genuinely *are* the USD
    // fallback for CHF, so the note stays true while a refresh of them fails —
    // an error is not a reason to stop explaining the chart being read.
    renderCard({ currency: 'chf', chartCurrency: 'usd', chartRequestedCurrency: 'chf', chartError: 'temp' })
    expect(screen.getByTestId('chart-currency-fallback')).toBeInTheDocument()
  })

  it('says nothing before any candles have arrived', () => {
    // On a cold load with GBP stored from a previous visit, the selection is GBP
    // and nothing has been fetched yet — so App passes no series currencies at
    // all. Without this the card would flash a "no market" notice at every such
    // visitor before the chart arrived.
    renderCard({ currency: 'gbp', chartCurrency: undefined, chartRequestedCurrency: undefined, chart: null, chartLoading: true })
    expect(screen.queryByTestId('chart-currency-fallback')).not.toBeInTheDocument()
  })

  it('names the traded pair in the volume caveat', () => {
    // The tooltip explains why these bars disagree with the 24H Volume card. It
    // named BTC/USD unconditionally, which is a wrong statement of provenance
    // once the chart can be drawn off another pair.
    renderCard({ currency: 'gbp', chartCurrency: 'gbp', chartRequestedCurrency: 'gbp' })
    fireEvent.click(screen.getByRole('button', { name: /volume|info|more/i }))
    expect(screen.getByText(/BTC\/GBP pair only/)).toBeInTheDocument()
  })

  it('colours the range change by direction', () => {
    const { rerender } = renderCard({ chartChange: 2.5 })
    expect(screen.getByTestId('chart-range-change')).toHaveClass('text-up')
    expect(screen.getByTestId('chart-range-change')).toHaveTextContent('+2.50%')

    rerender(
      <PriceChartCard chart={chart} chartLoading={false} chartError={null} chartChange={-1.25}
        range="7D" setRange={() => {}} refreshChart={() => {}} ranges={RANGES} currency="usd" />
    )
    expect(screen.getByTestId('chart-range-change')).toHaveClass('text-down')
  })

  it('names the range the change is measured across', () => {
    // Unlabelled, this badge reads as a second opinion on the 24h change in
    // the card beside it — and at 1D the two genuinely differ: that one is a
    // rolling 24 hours off the live ticker, this one spans 24 hourly candles
    // anchored to clock-hour boundaries and frozen at fetch time. The label is
    // what stops one being read as the other's error.
    const { rerender } = renderCard({ chartChange: 2.5, range: '1D' })
    // Matched loosely across the separator: the badge is an inline-flex row
    // and the space either side of the `·` comes from `gap-1`, not from a
    // character in the markup.
    expect(screen.getByTestId('chart-range-change')).toHaveTextContent(/\+2\.50%\s*·\s*1D/)

    rerender(
      <PriceChartCard chart={chart} chartLoading={false} chartError={null} chartChange={2.5}
        range="1Y" setRange={() => {}} refreshChart={() => {}} ranges={RANGES} currency="usd" />
    )
    // The label follows the active range rather than being written once for
    // the case that prompted it.
    expect(screen.getByTestId('chart-range-change')).toHaveTextContent(/\+2\.50%\s*·\s*1Y/)
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

// The CRT treatment. What the *rules* do is `crt.test.js`'s job — these cover
// the wiring, which is the half a stylesheet cannot state: that the overlay is
// rendered at all, that it is announced to nobody, and that it and the wobble
// are attached to the elements the design argument depends on.
describe('PriceChartCard CRT treatment', () => {
  it('lays the scanlines over the chart', () => {
    renderCard()
    expect(screen.getByTestId('chart-crt')).toHaveClass('crt-overlay')
  })

  it('announces them to nobody', () => {
    // Pure decoration sitting over a chart that already carries its own
    // labelling. A screen reader stopping on an empty div here is noise.
    renderCard()
    expect(screen.getByTestId('chart-crt')).toHaveAttribute('aria-hidden', 'true')
  })

  it('wobbles the chart wrapper, not the card', () => {
    // The correctness rule from `crt.js`: the axes and gridlines have to move
    // with the series, or a decorative effect is shifting a reading against its
    // own scale. Putting the class on the card root would also wobble the range
    // toggles, which is a different bug with the same cause.
    const { container } = renderCard()
    const wobbling = container.querySelector('.crt-wobble')
    expect(wobbling).not.toBeNull()
    expect(container.firstChild).not.toHaveClass('crt-wobble')
    expect(wobbling.querySelector('.recharts-responsive-container')).not.toBeNull()
  })

  it('puts the scanlines inside the wobbling wrapper', () => {
    // Outside it they would sit still in front of a moving picture, and they
    // would keep full strength while the chart dims under a range change.
    const { container } = renderCard()
    expect(container.querySelector('.crt-wobble .crt-overlay')).not.toBeNull()
  })

  it('draws no scanlines over the first-load skeleton', () => {
    // There is no chart to be a CRT of yet, and the skeleton has a pulse of its
    // own for the overlay to fight with.
    renderCard({ chart: null, chartLoading: true })
    expect(screen.queryByTestId('chart-crt')).not.toBeInTheDocument()
  })
})
