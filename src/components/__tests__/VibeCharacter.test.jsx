import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import VibeCharacter from '../VibeCharacter.jsx'
import { PALETTE } from '../../lib/palette.js'
import { VIBE_BANDS } from '../../lib/scales.js'
import {
  FIGURE_TOKEN, GRID_WIDTH, GRID_HEIGHT, figureTones, toneRuns, vibeCharacterFor,
} from '../../lib/vibeCharacter.js'

describe('VibeCharacter', () => {
  it('draws the grid in grid units, so the size is a CSS decision', () => {
    const { container } = render(<VibeCharacter label="Hot" />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${GRID_WIDTH} ${GRID_HEIGHT}`)
    expect(svg.querySelectorAll('rect').length).toBeGreaterThan(50)
  })

  it('keeps crispEdges, without which a pixel grid stops being one', () => {
    const { container } = render(<VibeCharacter label="Hot" />)
    expect(container.querySelector('svg').getAttribute('shape-rendering')).toBe('crispEdges')
  })

  it('is hidden from assistive technology', () => {
    // The inversion of `seriesLabel.js`: the score and its label are text
    // beside this, so describing the picture makes a screen reader say the
    // reading twice.
    const { container } = render(<VibeCharacter label="Ice Cold" />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('role')).toBeNull()
    expect(svg.getAttribute('aria-label')).toBeNull()
  })

  it('paints the weather in the band colour the label beside it uses', () => {
    const { container } = render(<VibeCharacter label="Ice Cold" />)
    const fills = new Set([...container.querySelectorAll('rect')].map(r => r.getAttribute('fill')))
    expect(fills.has(PALETTE.dark[VIBE_BANDS['Ice Cold'].token])).toBe(true)
  })

  it('paints the figure from the derived ramp and nothing else', () => {
    // The figure carries no reading, so every tone in it must come from the
    // ramp — a stray band colour on the figure would be the drawing saying
    // something the words beside it do not.
    const { container } = render(<VibeCharacter label="Ice Cold" />)
    const allowed = new Set([
      ...Object.values(figureTones(PALETTE.dark)),
      PALETTE.dark[VIBE_BANDS['Ice Cold'].token],
    ])
    for (const rect of container.querySelectorAll('rect')) {
      expect(allowed).toContain(rect.getAttribute('fill'))
    }
  })

  it('makes no colour claim about a day it could not measure', () => {
    const { container } = render(<VibeCharacter label={null} />)
    const fills = new Set([...container.querySelectorAll('rect')].map(r => r.getAttribute('fill')))
    const bands = Object.values(VIBE_BANDS).map(b => PALETTE.dark[b.token])
    // No band colour anywhere: the ground falls back to the figure's own tone.
    for (const band of bands) expect(fills.has(band)).toBe(false)
    expect(fills.has(PALETTE.dark[FIGURE_TOKEN])).toBe(true)
    expect(container.querySelector('[data-vibe-character="none"]')).toBeTruthy()
  })

  it('merges runs, so a shaded 32×32 is not 350 DOM nodes', () => {
    // Without merging this element re-renders ~350 rects on every score tick
    // and every theme flip. `mark.js` merges for the same reason.
    const grid = vibeCharacterFor('Overheated')
    const cells = grid.join('').replace(/\./g, '').length
    const merged = toneRuns(grid).length
    expect(merged).toBeLessThan(cells * 0.6)
    const { container } = render(<VibeCharacter label="Overheated" />)
    expect(container.querySelectorAll('rect').length).toBe(merged)
  })

  it('names the state it drew, so a wrong one is assertable', () => {
    const { container } = render(<VibeCharacter label="Overheated" />)
    expect(container.querySelector('[data-vibe-character="Overheated"]')).toBeTruthy()
  })

  it('does not animate, because the reduced-motion rule is blanket', () => {
    // Anything moving here would need a still frame carrying the same reading,
    // at which point the still frame is the feature.
    const { container } = render(<VibeCharacter label="Hot" />)
    expect(container.innerHTML).not.toMatch(/animate|@keyframes|transition/)
  })
})
