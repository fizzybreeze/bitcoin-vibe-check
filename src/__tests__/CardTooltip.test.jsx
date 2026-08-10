import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import CardTooltip from '../components/CardTooltip.jsx'

describe('CardTooltip', () => {
  it('renders without error when given a text prop', () => {
    render(<CardTooltip text="Test tooltip content" />)
    expect(screen.getByRole('button', { name: /more information/i })).toBeInTheDocument()
  })

  it('tooltip content is not visible by default', () => {
    render(<CardTooltip text="Test tooltip content" />)
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument()
  })

  it('tooltip content becomes visible after clicking the icon', () => {
    render(<CardTooltip text="Test tooltip content" />)
    const button = screen.getByRole('button', { name: /more information/i })
    fireEvent.click(button)
    expect(screen.getByTestId('tooltip-content')).toBeInTheDocument()
    expect(screen.getByText('Test tooltip content')).toBeInTheDocument()
  })

  it('dismisses on Escape', () => {
    // Dismissible from the keyboard without having to find your way back to a
    // 14px control that the open tooltip may be covering.
    render(<CardTooltip text="Test tooltip content" />)
    fireEvent.click(screen.getByRole('button', { name: /more information/i }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument()
  })

  it('says whether it is open', () => {
    render(<CardTooltip text="Test tooltip content" />)
    const button = screen.getByRole('button', { name: /more information/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })
})
