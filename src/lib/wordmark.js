/**
 * The wordmark — "BITCOIN VIBE CHECK", drawn rather than set.
 *
 * ── Why it is drawn ────────────────────────────────────────────────────────
 *
 * This was the last piece of the product's identity still resolved on the
 * visitor's machine. The app mark stopped being a system-font `<text>` glyph in
 * v1.8.1 for exactly that reason — "a logo that depends on a font is a logo
 * somebody else controls" — and the Vibe Score character was drawn as rects for
 * the same reason. The header was the remaining exception: `font-bold` on the
 * platform UI face, which is SF on one device, Segoe UI on another and whatever
 * the CI container falls through to on a third.
 *
 * Drawing it removes the dependency instead of managing it. There is no font
 * file, so there is nothing to load, nothing to fall back from, no FOUT and no
 * per-device variation — and it renders identically on all four surfaces that
 * carry it, which a webfont could only do by being supplied to each of them.
 *
 * A display webfont was the alternative and was costed: the smallest pixel face
 * that fitted (Pixelify Sans, latin subset) is 7.9 KB, would have needed
 * supplying to Satori *and* html2canvas in the same change per the standing
 * requirement in `typography.js`, and would still have had a fallback state.
 * This is ~1.5 KB of source with no fallback state at all.
 *
 * ── The alphabet ───────────────────────────────────────────────────────────
 *
 * Ten glyphs, because "BITCOIN VIBE CHECK" needs ten. That is the whole reason
 * this is tractable: a general pixel font is 60+ glyphs of work and a wordmark
 * is not a font. `wordmark.test.js` holds the alphabet to covering exactly the
 * letters the title uses — no more, so it cannot rot into a half-finished
 * typeface, and no fewer, so the title cannot render with a hole in it.
 *
 * **Widths are per glyph rather than fixed.** A 5-wide `I` next to a 5-wide `T`
 * puts three empty columns between two stems and the word falls apart; the
 * first draft did that and read as airy. `I` is 3 wide, the rest are 5, and the
 * gap between letters is one cell.
 */

/** Rows per glyph. Caps only — there are no descenders to accommodate. */
export const GLYPH_HEIGHT = 7

/** One cell of space between letters, three between words. */
export const LETTER_GAP = 1
export const WORD_GAP = 3

/**
 * The glyphs, as rows of `#` and `.`.
 *
 * Strings rather than coordinates, the same reason `mark.js` gives: changing
 * a letterform should be a diff somebody can read on a phone.
 */
export const GLYPHS = Object.freeze({
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  // 3 wide, not 5. Two of them sit inside BITCOIN and at 5 they opened holes
  // either side of the stem.
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  // A single-cell diagonal stepping down, rather than the two-cell slab the
  // first draft had — that one read as a blot rather than as a letter.
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#.#.#', '#..##', '#...#'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
})

/** The two lines. `CHECK` is its own line so it can carry the accent. */
export const WORDMARK_LINES = Object.freeze(['BITCOIN VIBE', 'CHECK'])

/** One blank row between the two lines. */
export const LINE_GAP = 1

/**
 * What the wordmark *says*, in prose.
 *
 * The drawing is `aria-hidden` and this is what sits in the `<h1>` beside it.
 * Exported rather than written at the call site so the picture and the text
 * cannot come to disagree — a heading that announces something other than what
 * is on screen is worse than one that announces nothing.
 */
export const WORDMARK_TEXT = 'Bitcoin Vibe Check'

/** Every letter the wordmark actually uses — what the alphabet is held to. */
export const REQUIRED_LETTERS = Object.freeze(
  [...new Set(WORDMARK_LINES.join('').replace(/ /g, ''))].sort()
)

/**
 * A line of text as a grid of `#` and `.`.
 *
 * Throws on a letter the alphabet does not have, rather than dropping it: a
 * wordmark with a missing letter is the silent-failure shape this repo keeps
 * meeting — it looks deliberate, and reviews clean.
 */
export function layoutLine(text) {
  const rows = Array.from({ length: GLYPH_HEIGHT }, () => '')
  ;[...text].forEach((char, i) => {
    if (char === ' ') {
      for (let y = 0; y < GLYPH_HEIGHT; y++) rows[y] += '.'.repeat(WORD_GAP)
      return
    }
    const glyph = GLYPHS[char]
    if (!glyph) throw new Error(`Wordmark: no glyph for "${char}"`)
    const gap = i === 0 || text[i - 1] === ' ' ? '' : '.'.repeat(LETTER_GAP)
    for (let y = 0; y < GLYPH_HEIGHT; y++) rows[y] += gap + glyph[y]
  })
  return rows
}

/**
 * Runs of ink along each row, merged into one rect each.
 *
 * `mark.js`'s reasoning, third time: fewer nodes, and no interior edges to show
 * hairline seams between adjacent rects.
 */
export function inkRuns(grid) {
  const runs = []
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      let width = 1
      while (row[x + width] === row[x]) width++
      if (row[x] === '#') runs.push({ x, y, width })
      x += width
    }
  })
  return runs
}

/** Width of a laid-out line, in cells. */
export const lineWidth = (text) => layoutLine(text)[0].length

/** The widest line — what the wordmark's own width is measured by. */
export const WORDMARK_WIDTH = Math.max(...WORDMARK_LINES.map(lineWidth))

/** Both lines stacked, in cells. */
export const WORDMARK_HEIGHT =
  WORDMARK_LINES.length * GLYPH_HEIGHT + (WORDMARK_LINES.length - 1) * LINE_GAP

/**
 * Cell sizes, in CSS pixels, at the two breakpoints the header renders at.
 *
 * Whole numbers for `mark.js`'s reason: a fractional cell does not throw, it
 * antialiases every edge in the drawing, and pixel art with soft edges reads as
 * a bad export rather than as a bug. 3px keeps the long line inside a 390px
 * phone with margin either side; 4px is the desktop size.
 */
export const WORDMARK_SIZES = Object.freeze({ base: 3, md: 4 })

/**
 * Every run in the wordmark, both lines, with the line each belongs to.
 *
 * The line index is what carries the colour — line 1 is the ink, line 2 is the
 * accent — so a consumer picks two fills rather than reimplementing the split.
 */
export function wordmarkRuns() {
  return WORDMARK_LINES.flatMap((text, line) =>
    inkRuns(layoutLine(text)).map(run => ({
      ...run,
      y: run.y + line * (GLYPH_HEIGHT + LINE_GAP),
      line,
    }))
  )
}

/**
 * A standalone SVG string for one line.
 *
 * This is the form the export surfaces need: Satori draws `api/lib/ogView.js`
 * and takes an `<img>` with a data URI, and `generate-og-image.mjs` rasterises
 * through a browser. Both consume this rather than reimplementing the layout,
 * so the four places this wordmark appears cannot drift into four wordmarks.
 */
export function lineSvg(text, { cell = 1, fill = '#000' } = {}) {
  const grid = layoutLine(text)
  const width = grid[0].length * cell
  const height = GLYPH_HEIGHT * cell
  const rects = inkRuns(grid)
    .map(r => `<rect x="${r.x * cell}" y="${r.y * cell}" width="${r.width * cell}" height="${cell}" fill="${fill}"/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rects}</svg>`
}

/** The same, as a data URI — the form Satori accepts. */
export const lineDataUri = (text, opts) =>
  `data:image/svg+xml;base64,${btoa(lineSvg(text, opts))}`
