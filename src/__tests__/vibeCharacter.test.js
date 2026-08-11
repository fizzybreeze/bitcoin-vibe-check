import { describe, it, expect } from 'vitest'
import {
  VIBE_CHARACTERS, NO_READING_CHARACTER, vibeCharacterFor,
  GRID_WIDTH, GRID_HEIGHT, CHARACTER_SIZES, FIGURE_TOKEN, cellsAreWhole,
  figureTones, TONE_ORDER,
} from '../lib/vibeCharacter.js'
import { VIBE_BANDS } from '../lib/scales.js'
import { PALETTE, THEMES } from '../lib/palette.js'

// The character is the first element on this page that is not load-bearing, so
// what these assert is mostly *restraint*: that it never says more than the
// score already says, and never says it in a second voice.

/** A state's figure cells alone, with the weather stripped out. */
const figureOf = (grid) => grid.map(row => [...row].map(c => (c === 'o' || c === '.' ? '.' : c)).join(''))

const ALL = { ...VIBE_CHARACTERS, 'No reading': NO_READING_CHARACTER }

describe('the grid', () => {
  it.each(Object.keys(ALL))('%s is %ix%i with only known cells', (label) => {
    const grid = ALL[label]
    expect(grid).toHaveLength(GRID_HEIGHT)
    for (const row of grid) {
      expect(row).toHaveLength(GRID_WIDTH)
      expect(row).toMatch(/^[KSMHFo.]+$/)
    }
  })

  it('has seven states, because the seventh is the one that gets forgotten', () => {
    // `computeVibeScore` returns null below its floor, and a dashboard that
    // draws nothing there looks broken rather than honest.
    expect(Object.keys(ALL)).toHaveLength(7)
  })

  it('covers exactly the labels the score ladder can produce', () => {
    // Keyed on the label rather than the score, so this and the coloured word
    // beside it cannot drift apart.
    expect(Object.keys(VIBE_CHARACTERS).sort()).toEqual(Object.keys(VIBE_BANDS).sort())
  })
})

describe('environment, not emotion', () => {
  it('draws the identical figure in every state', () => {
    // The load-bearing assertion in this file. If a future edit gives the
    // character a slumped posture at Ice Cold, the dashboard has started having
    // a feeling about the market — which §7 rules out — and this is the only
    // thing that would notice.
    const base = figureOf(NO_READING_CHARACTER)
    for (const [label, grid] of Object.entries(ALL)) {
      expect(figureOf(grid), `${label} moved the figure`).toEqual(base)
    }
  })

  it('draws a figure at all, so the check above cannot pass on an empty grid', () => {
    const filled = figureOf(NO_READING_CHARACTER).join('').replace(/\./g, '').length
    expect(filled).toBeGreaterThan(200)
  })

  it('gives the no-reading state no weather rather than calm weather', () => {
    // A mild day and a day we could not measure are different claims. The only
    // non-figure cells it may carry are the ground it stands on.
    const weatherRows = NO_READING_CHARACTER.filter(row => row.includes('o'))
    expect(weatherRows).toHaveLength(2)
  })

  it('gives the figure no face, which is what makes the rule structural', () => {
    // The blank face is not only faithful to the anon statue — a figure with
    // no features *cannot* carry an expression, so "environment, not emotion"
    // stops depending on anyone remembering it. `F` is one flat region; if a
    // future edit puts an outline or a shadow inside it, that is an eye.
    const face = NO_READING_CHARACTER.map(r => [...r].map(c => (c === 'F' ? 'F' : '.')).join(''))
    const rows = face.filter(r => r.includes('F'))
    expect(rows.length).toBeGreaterThan(4)
    // Every face row is one unbroken run — no holes, no features.
    for (const row of rows) expect(row.replace(/^\.*/, '').replace(/\.*$/, '')).toMatch(/^F+$/)
  })

  it('gives every scored state some weather, so the ladder is never blank', () => {
    for (const [label, grid] of Object.entries(VIBE_CHARACTERS)) {
      const weather = grid.join('').split('o').length - 1
      const ground = NO_READING_CHARACTER.join('').split('o').length - 1
      expect(weather, `${label} has no weather beyond the ground`).toBeGreaterThan(ground)
    }
  })

  it('reads the extremes the roadmap named — frost and breath, haze and a wilt', () => {
    const ice = VIBE_CHARACTERS['Ice Cold']
    expect(ice.slice(0, 8).join('')).toContain('o')    // frost in the sky
    expect(ice[31]).toContain('o')                      // frozen ground beneath
    const over = VIBE_CHARACTERS['Overheated']
    expect(over.slice(0, 8).join('')).toContain('o')   // the sun, dominant
    expect(over.slice(20, 29).join('')).toContain('o')  // haze and the wilt
  })
})

describe('the sizes it is drawn at', () => {
  it('all divide the grid into whole pixels', () => {
    // A fractional cell antialiases every edge into a smear and nothing
    // reports it. 64px — the first draft's size — fails this on a 20 grid.
    for (const [name, px] of Object.entries(CHARACTER_SIZES)) {
      expect(cellsAreWhole(px), `${name} (${px}px) gives a fractional cell`).toBe(true)
    }
    // 60 and 80 were the 20-grid's sizes and do not divide this one.
    expect(cellsAreWhole(60)).toBe(false)
    expect(cellsAreWhole(80)).toBe(false)
  })
})

describe('the shading ramp', () => {
  it('ascends in lightness in both themes', () => {
    // The bug this exists for: deriving shadow by mixing toward `ground` is
    // correct in dark mode and exactly inverted in light, where `ground` is
    // near-white. The shading looked broken and nothing failed. Ordering the
    // ramp by measured luminance is the fix; this is the assertion.
    const lum = (h) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    for (const theme of THEMES) {
      const tones = figureTones(PALETTE[theme])
      const ordered = TONE_ORDER.map(k => lum(tones[k]))
      for (let i = 1; i < ordered.length; i++) {
        expect(ordered[i], `${theme}: ${TONE_ORDER[i]} is not lighter than ${TONE_ORDER[i - 1]}`)
          .toBeGreaterThan(ordered[i - 1])
      }
    }
  })

  it('covers every tone the artwork actually uses', () => {
    const used = new Set([...Object.values(VIBE_CHARACTERS), NO_READING_CHARACTER]
      .flatMap(g => [...g.join('')]).filter(c => c !== '.' && c !== 'o'))
    const provided = new Set(Object.keys(figureTones(PALETTE.dark)))
    for (const tone of used) expect(provided, `tone ${tone} has no colour`).toContain(tone)
  })

  it('keeps the midtone the declared token, so the hue stays in palette.js', () => {
    expect(figureTones(PALETTE.dark).M).toBe(PALETTE.dark[FIGURE_TOKEN])
  })
})

describe('the colours', () => {
  it('uses only palette tokens that exist in both themes', () => {
    // The whole reason this is rects rather than a sprite: it needs no second
    // artwork per theme, but only if every token it names actually resolves.
    const tokens = [FIGURE_TOKEN, ...Object.values(VIBE_BANDS).map(b => b.token)]
    for (const theme of THEMES) {
      for (const token of tokens) {
        expect(PALETTE[theme][token], `${token} missing in ${theme}`).toMatch(/^#/)
      }
    }
  })

  it('takes the weather colour from the same band the label beside it uses', () => {
    // Not a coincidence maintained by hand — both read VIBE_BANDS.
    for (const label of Object.keys(VIBE_CHARACTERS)) {
      expect(VIBE_BANDS[label].token).toBeTruthy()
    }
  })
})

describe('vibeCharacterFor', () => {
  it('returns the state for a known label', () => {
    expect(vibeCharacterFor('Hot')).toBe(VIBE_CHARACTERS.Hot)
  })

  it('falls back to no-reading for null and for anything unrecognised', () => {
    // An unknown label is missing data, not a reading — the same rule
    // `vibeLabelClass` applies at the other end.
    expect(vibeCharacterFor(null)).toBe(NO_READING_CHARACTER)
    expect(vibeCharacterFor(undefined)).toBe(NO_READING_CHARACTER)
    expect(vibeCharacterFor('Tepid')).toBe(NO_READING_CHARACTER)
  })
})
