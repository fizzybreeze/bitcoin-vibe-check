import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Icon from '../Icon.jsx'
import { ICON_SIZES, ICON_STROKE_WIDTH, ICON_VIEWBOX } from '../../lib/icons.js'

describe('Icon', () => {
  it('renders the registry entry at the requested size', () => {
    const { container } = render(<Icon name="bell" size="lg" />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe(String(ICON_SIZES.lg))
    expect(svg.getAttribute('height')).toBe(String(ICON_SIZES.lg))
    expect(svg.getAttribute('viewBox')).toBe(ICON_VIEWBOX)
    expect(svg.getAttribute('stroke-width')).toBe(String(ICON_STROKE_WIDTH))
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('defaults to md, so a call site that omits the size still gets one of the three', () => {
    const { container } = render(<Icon name="share" />)
    expect(container.querySelector('svg').getAttribute('width')).toBe(String(ICON_SIZES.md))
  })

  it('is hidden from assistive technology unless it is given a label', () => {
    // Every current call site sits inside a control that already has a name, so
    // a title here makes a screen reader say the thing twice.
    const { container } = render(<Icon name="close" />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('role')).toBeNull()
  })

  it('becomes an image with a name when one is passed', () => {
    const { container } = render(<Icon name="close" label="Close" />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toBe('Close')
    expect(svg.getAttribute('aria-hidden')).toBeNull()
  })

  it('names itself, so an aria-hidden icon is still assertable', () => {
    const { container } = render(<Icon name="triangle-up" size="sm" />)
    expect(container.querySelector('[data-icon="triangle-up"]')).toBeTruthy()
  })

  it('throws on an unknown name rather than rendering an empty control', () => {
    // The whole failure mode: a blank button looks exactly like a deliberately
    // unadorned one, keeps its label and its handler, and reviews clean.
    expect(() => render(<Icon name="definitely-not-an-icon" />)).toThrow(/unknown name/)
  })

  it('throws on a size outside the scale', () => {
    expect(() => render(<Icon name="bell" size="xl" />)).toThrow(/unknown size/)
  })
})
