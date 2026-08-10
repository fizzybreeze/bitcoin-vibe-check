import { describe, it, expect } from 'vitest'
import {
  EMPTY,
  GROUND_TOKEN,
  ICON_TARGETS,
  MARK,
  MARK_COLS,
  MARK_ROWS,
  MARK_THEME,
  MASK_SAFE_ZONE,
  TONES,
  markGeometry,
  markRuns,
  markSvg,
} from '../../scripts/lib/mark.js'
import { PALETTE } from '../lib/palette.js'

// The mark is the one thing in this repo whose failures are all silent.
//
// A logo does not throw. Every way of getting it wrong — a tone that names a
// colour the scheme no longer has, a cell size that lands on a half pixel, a
// mark that Android's mask crops the corner off, a revert to `<text>` that
// renders perfectly on the machine that made it and as a tofu box everywhere
// else — produces a PNG that builds, ships and looks approximately right in the
// one place the person who changed it is looking. `appIcons.test.js` covers the
// wiring: that the files exist and that something points at them. This file
// covers the drawing.

const COLOURS = PALETTE[MARK_THEME]

describe('the grid', () => {
  it('is rectangular, so a row cannot be quietly short', () => {
    // A short row does not fail — it draws a mark with a bite out of it.
    expect(MARK.length).toBeGreaterThan(0)
    for (const [i, row] of MARK.entries()) {
      expect(row.length, `row ${i} is ${row.length} cells, not ${MARK_COLS}`).toBe(MARK_COLS)
    }
    expect(MARK_ROWS).toBe(MARK.length)
  })

  it('uses only characters that mean something', () => {
    const known = new Set([...Object.keys(TONES), EMPTY])
    for (const [i, row] of MARK.entries()) {
      for (const char of row) {
        expect(known.has(char), `row ${i} has an undeclared tone ${JSON.stringify(char)}`).toBe(true)
      }
    }
  })

  it('actually draws something on every row', () => {
    // An all-empty row is a gap through the letter, which reads as two shapes.
    for (const [i, row] of MARK.entries()) {
      expect([...row].some(c => c !== EMPTY), `row ${i} is blank`).toBe(true)
    }
  })
})

describe('the tones', () => {
  it('name palette tokens rather than hexes', () => {
    // The rule the whole Afterglow scheme rests on, applied to the one drawing
    // that lives outside `src/` and so is not covered by `palette.test.js`'s
    // scan. A hex here is how the app came to ship two different oranges.
    for (const [char, name] of Object.entries(TONES)) {
      expect(COLOURS[name], `tone ${char} names ${name}, which is not a token`).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(COLOURS[GROUND_TOKEN]).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('knocks the mark out of the accent using the palette pair meant for it', () => {
    // `accent-ink` is the token whose whole job is being readable on
    // `accent-fill`. Any other pairing would be a contrast claim this repo has
    // not made anywhere — and the toggle knob in v1.8.0 is the standing proof
    // that guessing at it produces a 2.46:1 failure.
    expect(GROUND_TOKEN).toBe('accent-fill')
    expect(Object.values(TONES)).toContain('accent-ink')
  })

  it('is a fuchsia mark, not whatever the accent happens to be renamed to', () => {
    expect(COLOURS[GROUND_TOKEN]).toBe(COLOURS.accent)
  })
})

describe('the letterform', () => {
  // The two ticks above and below are the entire difference between a ₿ and a
  // B. They are also the first thing a well-meaning simplification removes,
  // and the result still reads as a plausible logo.
  const runsOn = row => markRuns([row])

  it('has two ticks on the top row and two on the bottom', () => {
    expect(runsOn(MARK[0])).toHaveLength(2)
    expect(runsOn(MARK[MARK_ROWS - 1])).toHaveLength(2)
  })

  it('aligns the left tick with the stem', () => {
    // A tick floating clear of the stem reads as a detached mark rather than a
    // stroke passing through the letter.
    for (const row of [MARK[0], MARK[MARK_ROWS - 1]]) {
      expect(runsOn(row)[0].x).toBe(0)
    }
  })

  it('roofs and floors both ticks with a solid bar', () => {
    // A tick that overhangs the bar below it is a stroke ending in mid-air.
    const covered = (tickRow, barRow) =>
      markRuns([tickRow]).every(run =>
        [...Array(run.width)].every((_, i) => barRow[run.x + i] !== EMPTY))
    expect(covered(MARK[0], MARK[1])).toBe(true)
    expect(covered(MARK[MARK_ROWS - 1], MARK[MARK_ROWS - 2])).toBe(true)
  })

  it('leaves exactly two counters, so the bowls are not filled in', () => {
    // Counted as contiguous *bands* rather than as rows, and over the body
    // rather than the whole grid. The first draft of this did neither: the
    // tick rows have a gap in them too, so they matched the same pattern a
    // counter does, and a row count of "at least five" was then satisfiable
    // without either bowl being open. One band is a D, three is not a letter.
    const body = MARK.slice(1, -1)
    const holed = body.map(row => /^#+\.+#+/.test(row))
    const bands = holed.reduce((n, open, i) => n + (open && !holed[i - 1] ? 1 : 0), 0)
    expect(bands, `bowl rows: ${holed.map(Number).join('')}`).toBe(2)
  })
})

describe('run merging', () => {
  it('joins adjacent cells of one tone into a single rect', () => {
    // Not a size optimisation — two rects sharing an edge show a hairline seam
    // the moment anything antialiases them.
    expect(markRuns(['####.....'])).toEqual([{ x: 0, y: 0, width: 4, tone: '#' }])
  })

  it('keeps runs separated by a gap apart', () => {
    expect(markRuns(['##..##...']).map(r => [r.x, r.width])).toEqual([[0, 2], [4, 2]])
  })

  it('emits nothing for an empty row', () => {
    expect(markRuns(['.........'])).toEqual([])
  })
})

describe('geometry', () => {
  it('lands every cell on a whole pixel, at every size actually shipped', () => {
    // The failure this exists for is not a crash. A cell of 11.25px renders,
    // and antialiases every edge in the artwork into a smear — pixel art with
    // soft edges, which looks like a bad export rather than a bug.
    for (const { file, size, coverage } of ICON_TARGETS) {
      const { cell, x, y } = markGeometry(size, coverage)
      expect(Number.isInteger(cell), `${file}: cell ${cell}`).toBe(true)
      expect(Number.isInteger(x), `${file}: x ${x}`).toBe(true)
      expect(Number.isInteger(y), `${file}: y ${y}`).toBe(true)
      expect(cell).toBeGreaterThan(0)
    }
  })

  it('centres the mark on the canvas', () => {
    for (const { file, size, coverage } of ICON_TARGETS) {
      const { cell, x, y } = markGeometry(size, coverage)
      // Within a pixel: an odd leftover cannot be split evenly.
      expect(Math.abs((size - cell * MARK_COLS) / 2 - x), file).toBeLessThanOrEqual(0.5)
      expect(Math.abs((size - cell * MARK_ROWS) / 2 - y), file).toBeLessThanOrEqual(0.5)
    }
  })

  it('keeps the mark inside the canvas', () => {
    for (const { file, size, coverage } of ICON_TARGETS) {
      const { cell, x, y } = markGeometry(size, coverage)
      expect(x, file).toBeGreaterThanOrEqual(0)
      expect(y, file).toBeGreaterThanOrEqual(0)
      expect(x + cell * MARK_COLS, file).toBeLessThanOrEqual(size)
      expect(y + cell * MARK_ROWS, file).toBeLessThanOrEqual(size)
    }
  })

  it('keeps every maskable icon inside Android’s safe circle', () => {
    // Android crops a maskable icon to a shape of its own choosing and
    // guarantees only the central 80%. What has to fit is the mark's
    // half-diagonal, because a circle does not care which corner it clips.
    const maskable = ICON_TARGETS.filter(t => t.maskable)
    expect(maskable.length).toBeGreaterThan(0)
    for (const { file, size, coverage } of maskable) {
      const { cell } = markGeometry(size, coverage)
      const halfDiagonal = Math.hypot(cell * MARK_COLS, cell * MARK_ROWS) / 2
      expect(halfDiagonal, `${file} is cropped by the mask`)
        .toBeLessThanOrEqual((size * MASK_SAFE_ZONE) / 2)
    }
  })
})

describe('the rendered SVG', () => {
  const svg = markSvg({ size: 512, coverage: 0.625 })

  it('never sets the mark as type', () => {
    // The regression that made this artwork necessary. `<text>₿</text>` renders
    // correctly on any machine with U+20BF and as a tofu box on any without —
    // so it passes review, passes the build, and ships a broken icon to
    // whoever's device lacks the glyph. There is no font in this file to fall
    // back to, so the only way it returns is by somebody reintroducing one.
    expect(svg).not.toMatch(/<text|font-family|font-size/)
    expect(svg).not.toContain('₿')
  })

  it('paints the fuchsia ground and the mark on top of it', () => {
    expect(svg).toContain(`fill="${COLOURS[GROUND_TOKEN]}"`)
    expect(svg).toContain(`fill="${COLOURS['accent-ink']}"`)
  })

  it('uses no colour that is not in the palette', () => {
    const allowed = new Set(Object.values(COLOURS).map(c => c.toLowerCase()))
    for (const hex of svg.match(/#[0-9a-fA-F]{6}/g) ?? []) {
      expect(allowed.has(hex.toLowerCase()), `${hex} is not an Afterglow colour`).toBe(true)
    }
  })

  it('asks the rasteriser not to smooth the grid', () => {
    expect(svg).toContain('shape-rendering="crispEdges"')
  })

  it('rounds a normal icon and leaves a maskable one full-bleed', () => {
    // A maskable icon with corners of its own gets them visibly clipped, which
    // is the exact defect v1.7.7 fixed by splitting the two files apart.
    expect(markSvg({ size: 512, coverage: 0.52, maskable: true })).toContain('rx="0"')
    expect(svg).not.toContain('rx="0"')
  })

  it('snaps the corner radius to the cell grid', () => {
    const { cell } = markGeometry(512, 0.625)
    const radius = Number(svg.match(/rx="(\d+)"/)[1])
    expect(radius % cell, `radius ${radius} is out of step with a ${cell}px cell`).toBe(0)
  })

  it('draws one rect per run, plus the ground', () => {
    expect(svg.match(/<rect/g)).toHaveLength(markRuns().length + 1)
  })
})
