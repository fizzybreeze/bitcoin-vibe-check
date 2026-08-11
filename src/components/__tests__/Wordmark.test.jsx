import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Wordmark from '../Wordmark.jsx'
import { PALETTE } from '../../lib/palette.js'
import {
  WORDMARK_WIDTH, WORDMARK_HEIGHT, WORDMARK_SIZES, wordmarkRuns,
} from '../../lib/wordmark.js'

describe('Wordmark', () => {
  it('draws in grid units, so the size is a CSS decision', () => {
    const { container } = render(<Wordmark />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${WORDMARK_WIDTH} ${WORDMARK_HEIGHT}`)
    expect(svg.querySelectorAll('rect').length).toBe(wordmarkRuns().length)
  })

  it('keeps crispEdges, without which the letterforms go soft', () => {
    const { container } = render(<Wordmark />)
    expect(container.querySelector('svg').getAttribute('shape-rendering')).toBe('crispEdges')
  })

  it('is hidden from assistive technology', () => {
    // The `<h1>` around it carries the real text. Naming the picture too would
    // make a screen reader announce the site twice.
    const { container } = render(<Wordmark />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('aria-label')).toBeNull()
    expect(svg.getAttribute('role')).toBeNull()
  })

  it('paints CHECK in the accent and the rest in the ink', () => {
    // The two-fill split is what makes this a mark rather than a label, and it
    // comes off the line index rather than a slice taken in the component.
    const { container } = render(<Wordmark />)
    const fills = [...container.querySelectorAll('rect')].map(r => r.getAttribute('fill'))
    expect(new Set(fills)).toEqual(new Set([PALETTE.dark.ink, PALETTE.dark.accent]))
    const accentRuns = wordmarkRuns().filter(r => r.line === 1).length
    expect(fills.filter(f => f === PALETTE.dark.accent)).toHaveLength(accentRuns)
  })

  it('uses only palette values, never a hue of its own', () => {
    const { container } = render(<Wordmark />)
    const allowed = new Set([PALETTE.dark.ink, PALETTE.dark.accent])
    for (const rect of container.querySelectorAll('rect')) {
      expect(allowed).toContain(rect.getAttribute('fill'))
    }
  })

  it('responds to the breakpoint by default and not when given a cell', () => {
    // `ShareCanvas` is rasterised at a fixed size and has no breakpoints to
    // respond to — a `md:` class there would be dead weight at best and, if it
    // ever resolved, would change the size of an image somebody has posted.
    const { container: responsive } = render(<Wordmark />)
    expect(responsive.querySelector('svg').getAttribute('class')).toMatch(/md:w-/)

    const { container: fixed } = render(<Wordmark cell={2} />)
    const svg = fixed.querySelector('svg')
    expect(svg.getAttribute('class')).not.toMatch(/md:w-/)
    expect(svg.getAttribute('width')).toBe(String(WORDMARK_WIDTH * 2))
    expect(svg.getAttribute('height')).toBe(String(WORDMARK_HEIGHT * 2))
  })

  it('carries its intrinsic size at the base cell', () => {
    const { container } = render(<Wordmark />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe(String(WORDMARK_WIDTH * WORDMARK_SIZES.base))
  })
})
