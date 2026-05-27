import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiCard } from '../App'

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
