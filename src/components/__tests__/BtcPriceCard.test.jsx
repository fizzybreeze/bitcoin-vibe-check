// Render tests for the Vibe Score history sparkline (§3.2c). The picking rules
// live in vibeHistory.test.js; what those cannot see is whether the card ever
// draws the line, and — more importantly on the day this merges — whether it
// correctly draws nothing.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BtcPriceCard from '../BtcPriceCard.jsx'
import { MIN_HISTORY_POINTS, VIBE_HISTORY_DAYS } from '../../lib/vibeHistory.js'

const DAY_MS = 86_400_000
const END = Date.parse('2026-09-10T00:00:00Z')

// Already-built points, which is what the card takes — the row→point step is
// the pure module's job and is asserted there.
function points(count) {
  return Array.from({ length: count }, (_, i) => {
    const dateMs = END - (count - 1 - i) * DAY_MS
    return { date: new Date(dateMs).toISOString().slice(0, 10), dateMs, score: 40 + i }
  })
}

const VIBE = {
  score: 61,
  label: 'Warm',
  dimensions: { sentiment: 55, valuation: 62, momentum: 70, congestion: 40, network: 50 },
  inputsUsed: 7,
  inputsTotal: 7,
}

function renderCard(vibeHistory) {
  return render(
    <BtcPriceCard value="$60,000" change={1.5} sub="24h change" athPct={-12.3} vibe={VIBE} vibeHistory={vibeHistory} />
  )
}

describe('BtcPriceCard vibe history', () => {
  it('draws nothing below the minimum number of points', () => {
    // The branch that renders on the day this ships: three snapshot rows exist,
    // and only the ones carrying momentum are comparable.
    renderCard(points(MIN_HISTORY_POINTS - 1))
    expect(screen.queryByTestId('vibe-sparkline')).toBeNull()
  })

  it('draws nothing at all when there is no history', () => {
    renderCard([])
    expect(screen.queryByTestId('vibe-sparkline')).toBeNull()
    // And the score itself is unaffected — the history is not on its path.
    expect(screen.getByTestId('vibe-score')).toHaveTextContent('61')
  })

  it('defaults to no history when the prop is not passed at all', () => {
    render(<BtcPriceCard value="$60,000" vibe={VIBE} />)
    expect(screen.queryByTestId('vibe-sparkline')).toBeNull()
  })

  it('draws the line at exactly the minimum, labelled with its first day', () => {
    renderCard(points(MIN_HISTORY_POINTS))
    expect(screen.getByTestId('vibe-sparkline')).toBeInTheDocument()

    // Accessibility (roadmap §5): recharts renders an SVG with no text in it,
    // so without this the sparkline is silent — a reader is not told the score
    // has a history at all.
    const chart = screen.getByRole('img', { name: /Vibe Score/ })
    expect(chart.getAttribute('aria-label')).toMatch(/\d+ to \d+, (rising|falling|unchanged)/)
    expect(screen.getByText(/Vibe trend \(since 4 Sep\)/)).toBeInTheDocument()
  })

  it('labels a full window by the window rather than by a date', () => {
    renderCard(points(VIBE_HISTORY_DAYS))
    expect(screen.getByText(/Vibe trend \(30d\)/)).toBeInTheDocument()
  })

  it('does not draw a history when there is no score to draw it under', () => {
    // The whole section is a reading of the number above it. A sparkline under
    // a "—" would be a history of something the card is not currently claiming.
    render(<BtcPriceCard value="$60,000" vibe={null} vibeHistory={points(VIBE_HISTORY_DAYS)} />)
    expect(screen.queryByTestId('vibe-sparkline')).toBeNull()
  })
})
