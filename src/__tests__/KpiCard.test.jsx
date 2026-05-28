import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiCard, BtcPriceCard } from '../App'

describe('KpiCard', () => {
  it('renders the label', () => {
    render(<KpiCard label="BTC Price" value="$105,000" />)
    expect(screen.getByText('BTC Price')).toBeInTheDocument()
  })

  it('renders the value', () => {
    render(<KpiCard label="BTC Price" value="$105,000" />)
    expect(screen.getByText('$105,000')).toBeInTheDocument()
  })

  it('shows skeleton when value is null', () => {
    const { container } = render(<KpiCard label="BTC Price" value={null} />)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('shows positive change with ▲ and green class', () => {
    render(<KpiCard label="BTC Price" value="$105,000" change={2.5} />)
    const changeEl = screen.getByText(/▲/)
    expect(changeEl).toHaveClass('text-green-400')
    expect(changeEl.textContent).toContain('+')
  })

  it('shows negative change with ▼ and red class', () => {
    render(<KpiCard label="BTC Price" value="$105,000" change={-1.5} />)
    const changeEl = screen.getByText(/▼/)
    expect(changeEl).toHaveClass('text-red-400')
    expect(changeEl.textContent).not.toContain('+')
  })

  it('renders sub text when value and sub are provided', () => {
    render(<KpiCard label="BTC Price" value="$105,000" sub="24h change" />)
    expect(screen.getByText('24h change')).toBeInTheDocument()
  })

  it('does not render sub text when value is null', () => {
    render(<KpiCard label="BTC Price" value={null} sub="24h change" />)
    expect(screen.queryByText('24h change')).not.toBeInTheDocument()
  })
})

describe('BtcPriceCard — 24h change indicator', () => {
  it('renders the sub label as "24h change"', () => {
    render(<BtcPriceCard value="$105,000" change={2.5} sub="24h change" />)
    // Multiple DOM nodes (mobile + desktop) — at least one should be in the tree
    const matches = screen.getAllByText('24h change')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('shows a + sign and green colour for positive change', () => {
    render(<BtcPriceCard value="$105,000" change={2.5} sub="24h change" />)
    const indicators = screen.getAllByText(/\+2\.50%/)
    expect(indicators.length).toBeGreaterThan(0)
    indicators.forEach(el => expect(el).toHaveClass('text-green-400'))
  })

  it('shows no + sign and red colour for negative change', () => {
    render(<BtcPriceCard value="$105,000" change={-1.5} sub="24h change" />)
    const indicators = screen.getAllByText(/▼/)
    expect(indicators.length).toBeGreaterThan(0)
    indicators.forEach(el => expect(el).toHaveClass('text-red-400'))
  })

  it('sub label is not rendered when value is null', () => {
    render(<BtcPriceCard value={null} change={2.5} sub="24h change" />)
    expect(screen.queryByText('24h change')).not.toBeInTheDocument()
  })
})
