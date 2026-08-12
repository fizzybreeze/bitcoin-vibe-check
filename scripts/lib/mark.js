// The mark — a pixel-art ₿, drawn as a grid rather than set as type.
//
// **Why it is artwork and not a glyph.** Every icon this project shipped before
// drew U+20BF as `<text>` in a system font stack, which meant the app's own
// identity was resolved on whatever machine happened to run the generator.
// `generate-icons.mjs` had to *probe* for the glyph and refuse to run without
// it, because rasterising on a machine without U+20BF bakes a tofu box into a
// committed binary. That guard was correct and it was treating the symptom: a
// logo that depends on a font is a logo somebody else controls, and it is the
// same trap v1.6.0 hit with Satori and v1.7.7 hit with the icons. Drawing the
// mark as rects removes the dependency instead of checking for it, so the probe
// is gone and this file is the whole artwork.
//
// **Why pixel art.** The roadmap's Vibe Score character is specified as pixel
// art — "the first piece of actual artwork in a product whose graphics have so
// far been lines and arcs" — and a logo in a different idiom from the only other
// artwork in the product is two visual languages for one small app. It also
// happens to be the idiom that survives a favicon: the grid is coarse enough
// that a cell is about one device pixel at 16px, which is what a legible favicon
// has always been, and chunky enough at 512 to read as a decision.
//
// **The grid is 9 × 13 for a reason that is not aesthetic.** A favicon is
// painted at 16–32px however large the file is. At 16px a 13-row mark spends
// roughly one pixel per row, so the strokes survive; a finer grid renders the
// same artwork as mush, and nothing on screen would say why. That constraint
// fixed the size, and the drawing was fitted to it rather than the other way
// round.
//
// **It is one tone on a fuchsia ground, and that is the considered outcome
// rather than the easy one.** Four shaded variants were drawn and rasterised
// before this was settled — a top-lit one, a top-left-lit one, a sparse
// six-cell highlight and a cyan base — and each was rejected by looking at it
// at 16px next to the others: whole-row highlights read as banding across the
// letter, the top-left "L" reads as a rendering error, and the cyan base reads
// as a separate object the ₿ is standing in. The deciding argument is that a
// favicon is identified as a *colour* before it is identified as a *shape* —
// nobody resolves a 16px letterform in a tab strip, they find the pink chip —
// so the mark that carries the brand best is the one where the fuchsia is the
// tile rather than the tenant. Which is also, literally, a fuchsia logo.

import { PALETTE } from '../../src/lib/palette.js'

/**
 * The artwork. Each character is a tone, each line a row.
 *
 *   `#`  the mark itself, knocked out of the fuchsia ground
 *   `.`  nothing; the accent shows through
 *
 * It is a string rather than a list of coordinates so that changing the logo is
 * a diff somebody can read on a phone. The two ticks on the first and last rows
 * are the whole reason this is a ₿ and not a B, so they are load-bearing rather
 * than decorative — `appMark.test.js` asserts they are still there and still
 * aligned to the stem.
 */
export const MARK = Object.freeze([
  '##..##...',
  '#######..',
  '########.',
  '##....##.',
  '##....##.',
  '########.',
  '#########',
  '##.....##',
  '##.....##',
  '##.....##',
  '#########',
  '########.',
  '##..##...',
])

/**
 * Tone character → palette token. Nothing here names a hex; that is the rule
 * the whole Afterglow scheme is built on.
 *
 * `accent-ink` rather than `ground`, even though the two are the same value in
 * the dark theme: the palette already has a token whose entire job is "the
 * readable thing sitting on the accent fill", and using it means the icon is
 * covered by the contrast assertion that pair already carries rather than by a
 * coincidence between two unrelated tokens.
 */
export const TONES = Object.freeze({ '#': 'accent-ink' })

/** The ground the mark is knocked out of. Pairs with `accent-ink` by design. */
export const GROUND_TOKEN = 'accent-fill'

/** The one character that draws nothing. */
export const EMPTY = '.'

export const MARK_COLS = MARK[0].length
export const MARK_ROWS = MARK.length

/**
 * An icon is one artefact for both themes — an OS has no idea which theme the
 * visitor picked, and a home screen does not repaint when they switch. So the
 * mark is always drawn from the dark theme's values, which is the same call
 * `api/lib/ogView.js` makes for the link preview.
 *
 * **That reasoning is about surfaces with no visitor to ask, and `ShareCanvas`
 * is not one of them** — it follows the theme the reader is actually looking
 * at, so `markSvg` takes a theme and defaults to this rather than pinning it.
 * A light card drawn with the dark tile puts two different brand pinks side by
 * side in the same image, permanently, in something somebody has posted.
 */
export const MARK_THEME = 'dark'

/**
 * The drawing as rectangles, in grid units.
 *
 * Runs of the same tone are merged along each row. That is not a file-size
 * optimisation worth having on its own — it is what stops adjacent cells
 * showing a hairline seam where two rects share an edge, which is the classic
 * way grid artwork betrays itself the moment a rasteriser antialiases.
 *
 * @returns {Array<{x: number, y: number, width: number, tone: string}>}
 */
export function markRuns(rows = MARK) {
  const runs = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const tone = row[x]
      let width = 1
      while (x + width < row.length && row[x + width] === tone) width += 1
      if (tone !== EMPTY) runs.push({ x, y, width, tone })
      x += width
    }
  })
  return runs
}

/**
 * Where the grid sits on a canvas of `size`, at a whole-number cell size.
 *
 * **Integer cells are the correctness property of this file.** A cell of
 * 11.25px does not fail — it renders, and every edge in the mark lands on a
 * fraction of a pixel and is antialiased into a smear. Pixel art with soft
 * edges is not pixel art, and nothing about it looks broken enough to be caught
 * in review. So the cell is rounded to a whole number *first* and the artwork is
 * centred on whatever that leaves over, rather than the coverage being honoured
 * exactly and the grid paying for it. 180 is the size that forces the issue:
 * no useful coverage fraction of it divides by 13.
 *
 * `coverage` is the fraction of the canvas the mark's *tallest* axis should
 * span — height rather than width, because the mark is taller than it is wide
 * and an icon is budgeted by the dimension that runs out first.
 */
export function markGeometry(size, coverage) {
  const cell = Math.max(1, Math.round((size * coverage) / MARK_ROWS))
  return {
    cell,
    x: Math.round((size - cell * MARK_COLS) / 2),
    y: Math.round((size - cell * MARK_ROWS) / 2),
  }
}

/**
 * Every icon this project ships, and the one place the sizes are written down.
 *
 * Here rather than in `generate-icons.mjs` so the geometry claims can be
 * asserted against the real list: that script launches a browser at import, so
 * a test that reached for its targets would either start Chromium or be
 * asserting against a copy — and a copy of a list is exactly how the manifest
 * came to name files that were not there.
 */
export const ICON_TARGETS = Object.freeze([
  { file: 'public/icons/icon-192.png', size: 192, coverage: 0.625 },
  { file: 'public/icons/icon-512.png', size: 512, coverage: 0.625 },
  // Android's safe zone is a circle of 80% diameter, so what has to fit inside
  // radius 0.40 is the mark's half-*diagonal*, not its height: 0.5·√(h² + w²)
  // with w = h·9/13 comes to 0.608·h, so h ≤ 0.658 survives the crop and 0.52
  // leaves the margin that stops it looking cramped against a circular mask.
  { file: 'public/icons/icon-512-maskable.png', size: 512, coverage: 0.52, maskable: true },
  // 180 is what current iOS asks for; it downscales cleanly for older sizes.
  // Full-bleed like the maskable one, because iOS applies its own squircle and
  // does not honour transparency — corners of our own would be double-masked.
  { file: 'public/apple-touch-icon.png', size: 180, coverage: 0.58, maskable: true },
  // The browser tab. Rounded rather than full-bleed, because nothing masks a
  // favicon and a bare square reads heavier than the tab strip wants. 64 rather
  // than 32: browsers downscale, and a 32 upscales badly on the high-DPI
  // displays where the tab strip is actually painted at 2x.
  { file: 'public/favicon.png', size: 64, coverage: 0.625 },
])

/** Android guarantees only a circle of this diameter survives its mask. */
export const MASK_SAFE_ZONE = 0.8

/**
 * One icon, as SVG.
 *
 * @param {object} opts
 * @param {number} opts.size            canvas edge, in px
 * @param {number} opts.coverage        fraction of the canvas the mark spans
 * @param {boolean} [opts.maskable]     Android masks these to its own shape and
 *   guarantees only the central 80%, so a maskable icon is full-bleed — corners
 *   of its own would be visibly clipped — and the caller passes a smaller
 *   `coverage` to keep the mark inside that safe zone.
 * @param {string} [opts.theme]         Which half of the palette to draw from.
 *   Every icon target leaves this alone — see `MARK_THEME`. `ShareCanvas` does
 *   not, because that image follows the reader's theme and a fixed tile there
 *   is a second accent colour beside the one the rest of the card uses.
 */
export function markSvg({ size, coverage, maskable = false, theme = MARK_THEME }) {
  const colours = PALETTE[theme]
  const { cell, x, y } = markGeometry(size, coverage)
  // The corner radius is snapped to the cell grid rather than left as a
  // fraction of the canvas. It is the only curve in the artwork, and a curve
  // starting half a cell out of step with everything beside it is the detail
  // that makes a grid look accidental rather than drawn.
  const radius = maskable ? 0 : Math.round((size * 0.1667) / cell) * cell

  const rects = markRuns()
    .map(run =>
      `<rect x="${x + run.x * cell}" y="${y + run.y * cell}" ` +
      `width="${run.width * cell}" height="${cell}" fill="${colours[TONES[run.tone]]}"/>`)
    .join('\n  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${colours[GROUND_TOKEN]}"/>
  ${rects}
</svg>`
}
