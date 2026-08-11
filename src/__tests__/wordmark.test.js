import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  GLYPHS, GLYPH_HEIGHT, LETTER_GAP, WORD_GAP, LINE_GAP,
  WORDMARK_LINES, WORDMARK_TEXT, REQUIRED_LETTERS,
  WORDMARK_WIDTH, WORDMARK_HEIGHT, WORDMARK_SIZES,
  layoutLine, inkRuns, lineWidth, wordmarkRuns, lineSvg, lineDataUri,
} from '../lib/wordmark.js'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

/** Source with comment lines removed — prose about the wordmark is not a use of it. */
const strip = (source) => source.split('\n')
  .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n')

describe('the alphabet', () => {
  it('covers exactly the letters the wordmark uses — no more, no fewer', () => {
    // Both halves matter. Fewer, and the title renders with a hole in it.
    // More, and this has started becoming a font, which is 60+ glyphs of work
    // nobody asked for and a maintenance surface with no consumer.
    expect(Object.keys(GLYPHS).sort()).toEqual([...REQUIRED_LETTERS])
  })

  it('draws every glyph as a rectangle of the same height', () => {
    for (const [letter, rows] of Object.entries(GLYPHS)) {
      expect(rows, `${letter} is not ${GLYPH_HEIGHT} rows`).toHaveLength(GLYPH_HEIGHT)
      const width = rows[0].length
      for (const row of rows) {
        expect(row, `${letter} has a ragged row`).toHaveLength(width)
        expect(row, `${letter} has a cell that is neither ink nor space`).toMatch(/^[#.]+$/)
      }
    }
  })

  it('draws ink in every glyph, so a blank one cannot pass the checks above', () => {
    for (const [letter, rows] of Object.entries(GLYPHS)) {
      expect(rows.join(''), `${letter} is empty`).toContain('#')
    }
  })

  it('keeps I narrower than the rest, which is what stops BITCOIN falling apart', () => {
    // A 5-wide I next to a 5-wide T puts three empty columns between two stems.
    // The first draft did that and the word read as loose lettering rather than
    // as a mark.
    expect(GLYPHS.I[0].length).toBeLessThan(GLYPHS.T[0].length)
  })
})

describe('layoutLine', () => {
  it('separates letters by one cell and words by three', () => {
    expect(layoutLine('II')[0]).toBe('###' + '.'.repeat(LETTER_GAP) + '###')
    expect(layoutLine('I I')[0]).toBe('###' + '.'.repeat(WORD_GAP) + '###')
  })

  it('leads with no gap, so the mark is flush left', () => {
    expect(layoutLine('B')[0][0]).toBe('#')
    expect(layoutLine('BI')[0][0]).toBe('#')
  })

  it('throws on a letter it has no glyph for', () => {
    // Rather than dropping it. A wordmark with a missing letter looks
    // deliberate and reviews clean — the silent-failure shape this repo keeps
    // meeting, and the same rule `Icon` applies to an unknown icon name.
    expect(() => layoutLine('BITCOIN VIBE CHECK!')).toThrow(/no glyph/)
    expect(() => layoutLine('bitcoin')).toThrow(/no glyph/)
  })

  it('lays every line out at the glyph height', () => {
    for (const line of WORDMARK_LINES) {
      expect(layoutLine(line)).toHaveLength(GLYPH_HEIGHT)
    }
  })
})

describe('inkRuns', () => {
  it('merges adjacent ink into one rect', () => {
    // `mark.js`'s reasoning, third time: fewer nodes, and no interior edges for
    // a renderer to show hairline seams along.
    expect(inkRuns(['####'])).toEqual([{ x: 0, y: 0, width: 4 }])
  })

  it('breaks a run at a gap and keeps the x it resumes at', () => {
    expect(inkRuns(['##.#'])).toEqual([
      { x: 0, y: 0, width: 2 },
      { x: 3, y: 0, width: 1 },
    ])
  })

  it('emits nothing for a blank row', () => {
    expect(inkRuns(['....'])).toEqual([])
  })

  it('cuts the node count well below one rect per cell', () => {
    const cells = WORDMARK_LINES
      .flatMap(line => layoutLine(line))
      .join('').replace(/\./g, '').length
    // A smaller saving than the character's, and honestly so: letterforms are
    // mostly one-cell stems, so there is less to merge. The rows that do merge
    // are the crossbars, which are where the seams would have shown.
    expect(wordmarkRuns().length).toBeLessThan(cells * 0.75)
  })
})

describe('the two lines', () => {
  it('says the same thing as the text beside it', () => {
    expect(WORDMARK_LINES.join(' ')).toBe(WORDMARK_TEXT.toUpperCase())
  })

  it('puts CHECK on its own line, which is what lets it carry the accent', () => {
    expect(WORDMARK_LINES).toHaveLength(2)
    expect(WORDMARK_LINES[1]).toBe('CHECK')
  })

  it('tags every run with the line it belongs to', () => {
    const lines = new Set(wordmarkRuns().map(r => r.line))
    expect([...lines].sort()).toEqual([0, 1])
  })

  it('stacks the second line below the first with a blank row between', () => {
    const second = wordmarkRuns().filter(r => r.line === 1)
    expect(Math.min(...second.map(r => r.y))).toBe(GLYPH_HEIGHT + LINE_GAP)
  })

  it('measures itself by its widest line', () => {
    expect(WORDMARK_WIDTH).toBe(Math.max(...WORDMARK_LINES.map(lineWidth)))
    expect(WORDMARK_HEIGHT).toBe(GLYPH_HEIGHT * 2 + LINE_GAP)
  })
})

describe('the sizes it is drawn at', () => {
  it('are whole numbers of pixels per cell', () => {
    // A fractional cell does not throw, it antialiases every edge in the
    // drawing — and pixel art with soft edges reads as a bad export rather than
    // as a bug. Same rule as `cellsAreWhole` for the character.
    for (const [name, px] of Object.entries(WORDMARK_SIZES)) {
      expect(Number.isInteger(px), `${name} (${px}) is fractional`).toBe(true)
    }
  })

  it('fits the long line inside a 390px phone with margin either side', () => {
    // The header sits inside `p-4`, so 358px is what is actually available.
    expect(WORDMARK_WIDTH * WORDMARK_SIZES.base).toBeLessThan(358)
  })
})

describe('the component', () => {
  const source = read('../components/Wordmark.jsx')

  it('hard-codes the size classes as the constants times the cell sizes', () => {
    // Tailwind scans source text, so a composed class name is never generated
    // and the element silently renders at its intrinsic size. The literals are
    // therefore the only option, and this is what stops them drifting from
    // `WORDMARK_SIZES`.
    const { base, md } = WORDMARK_SIZES
    expect(source).toContain(`w-[${WORDMARK_WIDTH * base}px]`)
    expect(source).toContain(`h-[${WORDMARK_HEIGHT * base}px]`)
    expect(source).toContain(`md:w-[${WORDMARK_WIDTH * md}px]`)
    expect(source).toContain(`md:h-[${WORDMARK_HEIGHT * md}px]`)
  })
})

describe('lineSvg', () => {
  it('sizes the viewBox in the same units as the rects', () => {
    const svg = lineSvg('I', { cell: 3 })
    expect(svg).toContain(`viewBox="0 0 9 ${GLYPH_HEIGHT * 3}"`)
    expect(svg).toContain('width="9"')
  })

  it('keeps crispEdges, without which a pixel grid stops being one', () => {
    expect(lineSvg('I')).toContain('shape-rendering="crispEdges"')
  })

  it('draws in the fill it is given, so CHECK can be the accent', () => {
    expect(lineSvg('I', { fill: '#abcdef' })).toContain('fill="#abcdef"')
  })

  it('emits one rect per merged run, not one per cell', () => {
    const rects = lineSvg('CHECK').split('<rect').length - 1
    expect(rects).toBe(inkRuns(layoutLine('CHECK')).length)
  })

  it('base64-encodes to a data URI Satori accepts', () => {
    const uri = lineDataUri('CHECK', { cell: 2 })
    expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true)
    expect(atob(uri.slice('data:image/svg+xml;base64,'.length))).toBe(lineSvg('CHECK', { cell: 2 }))
  })
})

describe('the surfaces that carry it', () => {
  // Four of them, and the reason `lineSvg` exists at all is that they must not
  // become four wordmarks. Each is asserted to render *through* the module
  // rather than to restate the title — the failure being guarded against is a
  // surface quietly going back to a font, which looks fine in isolation and
  // only shows up when two of them are seen side by side.
  it.each([
    ['the header',        '../App.jsx',                       'Wordmark'],
    ['the share canvas',  '../components/ShareCanvas.jsx',    'Wordmark'],
    ['the preview card',  '../../api/lib/ogView.js',          'lineDataUri'],
    ['the static card',   '../../scripts/generate-og-image.mjs', 'lineSvg'],
  ])('%s renders through the module', (_name, path, symbol) => {
    const source = read(path)
    expect(source).toMatch(/wordmark\.jsx?/i)
    expect(source).toContain(symbol)
  })

  it('calls into the module rather than importing it and not using it', () => {
    // The import surviving a revert is exactly how a surface goes quietly back
    // to a font: the line at the top still names `wordmark.js` while the header
    // below it is a `fontWeight: 700` div again. These are the call sites.
    expect(strip(read('../../api/lib/ogView.js'))).toMatch(/lineDataUri\(/)
    expect(strip(read('../../scripts/generate-og-image.mjs'))).toMatch(/\$\{wordmark\(\)\}/)
  })

  it('leaves the title out of every surface as a typed string', () => {
    // Unquoted too — the static card composes HTML in a template literal, where
    // a reverted title is bare text rather than a string constant. Case
    // sensitive on purpose: `App.jsx` carries "Bitcoin Vibe Check" in its
    // copyright line, which is prose rather than the mark. The one surface
    // whose title was title-case is `ShareCanvas`, and its own render test
    // asserts the words are absent there.
    for (const path of ['../App.jsx', '../components/ShareCanvas.jsx',
      '../../api/lib/ogView.js', '../../scripts/generate-og-image.mjs']) {
      expect(strip(read(path)), `${path} still sets the title as text`)
        .not.toMatch(/BITCOIN VIBE CHECK/)
    }
  })

  it('gives the header a name a screen reader can read', () => {
    // The drawing is `aria-hidden`, so without this the page's only <h1> has no
    // accessible name at all — which `dashboard.spec.js` asserts and which is
    // the one thing a picture cannot supply. Matched with comments stripped,
    // because the line above the span mentions `sr-only` in prose and a
    // substring check would have passed on the comment alone.
    expect(strip(read('../App.jsx')))
      .toMatch(/<h1>[\s\S]*sr-only[^>]*>\{WORDMARK_TEXT\}[\s\S]*<\/h1>/)
    expect(WORDMARK_TEXT).toBe('Bitcoin Vibe Check')
  })
})
