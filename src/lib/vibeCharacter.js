/**
 * The Vibe Score character — a figure standing in the weather the score names.
 *
 * ── Why this is rects and not a sprite, which changes the whole brief ──────
 *
 * The roadmap specified this as pixel art and then listed, as its first
 * constraint, that "a raster sprite cannot read a CSS variable — so it needs
 * either one set per theme or a palette-limited sprite recoloured at runtime".
 * That constraint dissolves rather than being solved, because the precedent it
 * points at — `scripts/lib/mark.js` — does not draw a raster either. It draws
 * **rects from a character grid**, and rects take `fill` from a palette token
 * like anything else.
 *
 * So: no image asset, no second set per theme and no runtime recolouring. The
 * cost is **9.1 KiB of source** — the precache went 1165.59 → 1174.64 KiB —
 * against seven sprites at two themes, which is what the raster reading of this
 * brief would have committed to. Stated as a measurement rather than as "zero",
 * which is what a first draft of this comment claimed and which the build
 * output disproved: the drawing is not free, it is cheap, and the difference
 * matters on a page whose §1 filter is that it stays free to run.
 *
 * ── Environment, not emotion ───────────────────────────────────────────────
 *
 * The figure is **identical in all seven states**; only the weather around it
 * changes. That is not a stylistic choice, it is what keeps the dashboard from
 * editorialising: a character who looks *panicked* at Ice Cold is this product
 * having a feeling about the market, which §7 rules out. A character standing
 * in frost says exactly what the words "Ice Cold" already say, and nothing more.
 *
 * `figure.test.js`-style enforcement of that lives in `vibeCharacter.test.js`:
 * the `#` cells are asserted byte-identical across every state, so a future
 * edit cannot quietly give the character an expression.
 *
 * ── Seven states, because the seventh is the one that gets forgotten ───────
 *
 * `computeVibeScore` returns `null` below three dimensions or 0.6 of the
 * weight, and the card already says "Not enough live data to score". The
 * character has to have something to be in that case, and what it is is
 * **weather-less**: the figure and the ground, nothing else. An unknown reading
 * draws no environment rather than a neutral one, because a mild day and a day
 * we could not measure are different claims.
 *
 * ── What it does not do ────────────────────────────────────────────────────
 *
 * **It does not move.** v1.7.12's reduced-motion rule is blanket, so anything
 * animated here would need a still frame carrying the same reading — at which
 * point the still frame is the feature and the animation is decoration with a
 * media query attached. The weather is legible standing still.
 *
 * **It is `aria-hidden`.** This inverts the `seriesLabel.js` precedent
 * deliberately: there, the drawing was the only source of the reading, so it
 * needed a text alternative. Here the score and its label are already text
 * directly beside it, so describing the character makes a screen reader say the
 * same thing twice.
 */

/**
 * The grid. 32 × 32, one character per cell:
 *
 *   `K`  the figure's outline — wherever it meets air
 *   `S`  shadow      `M`  midtone      `H`  highlight
 *   `F`  the face — blank, and brighter than the hood, as a polished surface
 *   `o`  the weather — takes the band's own colour, the same token the label
 *        beside it already uses, so the two cannot disagree
 *   `.`  nothing
 *
 * Strings rather than coordinates, for `mark.js`'s reason: changing the artwork
 * should be a diff somebody can read on a phone.
 */
export const GRID_WIDTH = 32
export const GRID_HEIGHT = 32

/**
 * The seven states. The figure occupies the same cells in every one of them —
 * `vibeCharacter.test.js` asserts that byte-for-byte, so a future edit cannot
 * quietly give the character an expression.
 *
 * The weather ladder, in order: frost and visible breath, thinning frost, a
 * passing cloud, sun and a sprout, a bigger sun, and finally the sun dominant
 * with heat haze and the sprout wilted. **The wilt is the sprout inverted** —
 * leaves reaching up become leaves hanging down — because at a 3px cell a stem
 * bent by one cell is invisible, which the first two drafts of this artwork
 * both were. That was found by rasterising it and looking, not by reasoning.
 */
const ICE_COLD = Object.freeze([
  '................................',
  '...........................o....',
  '...o.....................o.o.o..',
  '.o.o.o....................ooo...',
  '..ooo....................o.o.o..',
  '.o.o.o.........KKKKKK......o....',
  '...o..........KMMMMMMK..........',
  '.........o...KKKKKKKKKK.........',
  '.......o.o.oKKKFFFFFFKKK........',
  '........ooo.KHFFFFFFFFMK..ooo...',
  '.......o.o.oKMFFFFFFFFMK.ooooo..',
  '.........o..KMFFFFFFFFMK..ooo...',
  '....o.......KMFFFFFFFFSK...o....',
  '..o.o.o.....KMMFFFFFFSSK........',
  '...ooo.......KMMFFFFMSK.........',
  '..o.o.o.......KKKKKKKK..........',
  '....o.......KKMMMMMMSSKK........',
  '...........KMMMMMMMSSSSSK.......',
  '...........KKMMMMMSSSSSKK.......',
  '..........KK.KMMMMSSSSK.KK......',
  '..........KK.KMMMSSSSSK.KK......',
  '..........KK.KMMMSSSSSK.KK......',
  '..........KK.KMMSSSSSSK.KK......',
  '..........KK.KMSSSSSSSK.KK......',
  '.............KMSSKKSSSK.........',
  '..............KSK..KSK..........',
  '..............KSK..KSK..........',
  '..............KSK..KSK..........',
  '.............KKKKKKKKKK.........',
  '.oooooooooooooooooooooooooooooo.',
  '.oooooooooooooooooooooooooooooo.',
  '..o.o..o.o...o..o.o..o.o..o.o...',
])

const COLD = Object.freeze([
  '................................',
  '................................',
  '............................o...',
  '....o.....................o.o.o.',
  '..o.o.o....................ooo..',
  '...ooo.........KKKKKK.....o.o.o.',
  '..o.o.o.......KMMMMMMK......o...',
  '....o........KKKKKKKKKK.........',
  '............KKKFFFFFFKKK........',
  '............KHFFFFFFFFMK........',
  '............KMFFFFFFFFMK...oo...',
  '............KMFFFFFFFFMK..oooo..',
  '............KMFFFFFFFFSK...oo...',
  '............KMMFFFFFFSSK........',
  '.............KMMFFFFMSK.........',
  '..............KKKKKKKK..........',
  '............KKMMMMMMSSKK........',
  '...........KMMMMMMMSSSSSK.......',
  '...........KKMMMMMSSSSSKK.......',
  '..........KK.KMMMMSSSSK.KK......',
  '..........KK.KMMMSSSSSK.KK......',
  '..........KK.KMMMSSSSSK.KK......',
  '..........KK.KMMSSSSSSK.KK......',
  '..........KK.KMSSSSSSSK.KK......',
  '.............KMSSKKSSSK.........',
  '..............KSK..KSK..........',
  '..............KSK..KSK..........',
  '..............KSK..KSK..........',
  '.............KKKKKKKKKK.........',
  '.oooooooooooooooooooooooooooooo.',
  '.oooooooooooooooooooooooooooooo.',
  '................................',
])

const COOL = Object.freeze([
  '................................',
  '.....oooo.......................',
  '...oooooooo.....................',
  '..oooooooooo....................',
  '.oooooooooooo...................',
  '...............KKKKKK...........',
  '..............KMMMMMMK..........',
  '.............KKKKKKKKKK.........',
  '............KKKFFFFFFKKK........',
  '............KHFFFFFFFFMK........',
  '............KMFFFFFFFFMK........',
  '............KMFFFFFFFFMK........',
  '............KMFFFFFFFFSK........',
  '............KMMFFFFFFSSK........',
  '.............KMMFFFFMSK.........',
  '..............KKKKKKKK..........',
  '............KKMMMMMMSSKK........',
  '...........KMMMMMMMSSSSSK.......',
  '...........KKMMMMMSSSSSKK.......',
  '..........KK.KMMMMSSSSK.KK......',
  '..........KK.KMMMSSSSSK.KK......',
  '..........KK.KMMMSSSSSK.KK......',
  '..........KK.KMMSSSSSSK.KK......',
  '..........KK.KMSSSSSSSK.KK......',
  '.............KMSSKKSSSK.........',
  '..............KSK..KSK..........',
  '..............KSK..KSK..........',
  '..............KSK..KSK..........',
  '.............KKKKKKKKKK.........',
  '.oooooooooooooooooooooooooooooo.',
  '.oooooooooooooooooooooooooooooo.',
  '................................',
])

const WARM = Object.freeze([
  '................................',
  '...........................o....',
  '.........................o.o.o..',
  '..........................ooo...',
  '........................ooooooo.',
  '...............KKKKKK.....ooo...',
  '..............KMMMMMMK...o.o.o..',
  '.............KKKKKKKKKK....o....',
  '............KKKFFFFFFKKK........',
  '............KHFFFFFFFFMK........',
  '............KMFFFFFFFFMK........',
  '............KMFFFFFFFFMK........',
  '............KMFFFFFFFFSK........',
  '............KMMFFFFFFSSK........',
  '.............KMMFFFFMSK.........',
  '..............KKKKKKKK..........',
  '............KKMMMMMMSSKK........',
  '...........KMMMMMMMSSSSSK.......',
  '...........KKMMMMMSSSSSKK.......',
  '..........KK.KMMMMSSSSK.KK......',
  '..........KK.KMMMSSSSSK.KK......',
  '..o.......KK.KMMMSSSSSK.KK......',
  '...o.....oKK.KMMSSSSSSK.KK......',
  '....o...o.KK.KMSSSSSSSK.KK......',
  '.....ooo.....KMSSKKSSSK.........',
  '......o.......KSK..KSK..........',
  '......o.......KSK..KSK..........',
  '......o.......KSK..KSK..........',
  '......o......KKKKKKKKKK.........',
  '.oooooooooooooooooooooooooooooo.',
  '.oooooooooooooooooooooooooooooo.',
  '................................',
])

const HOT = Object.freeze([
  '........................o.o.....',
  '......................o.ooo.o...',
  '.......................ooooo....',
  '.....................o.ooooo.o..',
  '....................ooooooooooo.',
  '...............KKKKKKo.ooooo.o..',
  '..............KMMMMMMK.ooooo....',
  '.............KKKKKKKKKK.ooo.o...',
  '............KKKFFFFFFKKKo.o.....',
  '............KHFFFFFFFFMK........',
  '............KMFFFFFFFFMK........',
  '............KMFFFFFFFFMK........',
  '............KMFFFFFFFFSK........',
  '............KMMFFFFFFSSK........',
  '.............KMMFFFFMSK.........',
  '..............KKKKKKKK..........',
  '............KKMMMMMMSSKK........',
  '...........KMMMMMMMSSSSSK.......',
  '...........KKMMMMMSSSSSKK.......',
  '..........KK.KMMMMSSSSK.KK......',
  '..........KK.KMMMSSSSSK.KK......',
  '..o.......KK.KMMMSSSSSK.KK......',
  '...o.....oKK.KMMSSSSSSK.KK......',
  '....o...o.KK.KMSSSSSSSK.KK......',
  '.....ooo.....KMSSKKSSSK.........',
  '......o.......KSK..KSK..........',
  '......o.......KSK..KSK..........',
  '......o.......KSK..KSK..........',
  '......o......KKKKKKKKKK.........',
  '.oooooooooooooooooooooooooooooo.',
  '.oooooooooooooooooooooooooooooo.',
  '................................',
])

const OVERHEATED = Object.freeze([
  '........................o.o.....',
  '......................o.ooo.o...',
  '.......................ooooo....',
  '.....................o.ooooo.o..',
  '....................ooooooooooo.',
  '...............KKKKKKo.ooooo.o..',
  '..............KMMMMMMK.ooooo....',
  '.............KKKKKKKKKK.ooo.o...',
  '............KKKFFFFFFKKKo.o.....',
  '............KHFFFFFFFFMK........',
  '............KMFFFFFFFFMK........',
  '............KMFFFFFFFFMK........',
  '............KMFFFFFFFFSK........',
  '............KMMFFFFFFSSK........',
  '.............KMMFFFFMSK.........',
  '..............KKKKKKKK..........',
  '............KKMMMMMMSSKK........',
  '...........KMMMMMMMSSSSSK.......',
  '...........KKMMMMMSSSSSKK.......',
  '..........KK.KMMMMSSSSK.KK......',
  '..........KK.KMMMSSSSSK.KK......',
  '..........KK.KMMMSSSSSK.KK......',
  '......o...KK.KMMSSSSSSK.KK......',
  '.....ooo..KK.KMSSSSSSSK.KK......',
  '....o...o....KMSSKKSSSK.........',
  '...o.....o....KSK..KSK..........',
  '..o.......o...KSK..KSKo..oo..oo.',
  '......o.......KSK..KSK..oo..oo..',
  '......o......KKKKKKKKKK.........',
  '.oooooooooooooooooooooooooooooo.',
  '.oooooooooooooooooooooooooooooo.',
  '................................',
])

const NO_READING = Object.freeze([
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '...............KKKKKK...........',
  '..............KMMMMMMK..........',
  '.............KKKKKKKKKK.........',
  '............KKKFFFFFFKKK........',
  '............KHFFFFFFFFMK........',
  '............KMFFFFFFFFMK........',
  '............KMFFFFFFFFMK........',
  '............KMFFFFFFFFSK........',
  '............KMMFFFFFFSSK........',
  '.............KMMFFFFMSK.........',
  '..............KKKKKKKK..........',
  '............KKMMMMMMSSKK........',
  '...........KMMMMMMMSSSSSK.......',
  '...........KKMMMMMSSSSSKK.......',
  '..........KK.KMMMMSSSSK.KK......',
  '..........KK.KMMMSSSSSK.KK......',
  '..........KK.KMMMSSSSSK.KK......',
  '..........KK.KMMSSSSSSK.KK......',
  '..........KK.KMSSSSSSSK.KK......',
  '.............KMSSKKSSSK.........',
  '..............KSK..KSK..........',
  '..............KSK..KSK..........',
  '..............KSK..KSK..........',
  '.............KKKKKKKKKK.........',
  '.oooooooooooooooooooooooooooooo.',
  '.oooooooooooooooooooooooooooooo.',
  '................................',
])

/**
 * Keyed by the label `vibeLabelForScore` returns, plus `null` for no reading.
 * Keying on the *label* rather than on the score means this ladder and the
 * coloured word beside it cannot drift apart — the same argument `scales.js`
 * makes for the Fear & Greed bands.
 */
export const VIBE_CHARACTERS = Object.freeze({
  'Ice Cold':   ICE_COLD,
  'Cold':       COLD,
  'Cool':       COOL,
  'Warm':       WARM,
  'Hot':        HOT,
  'Overheated': OVERHEATED,
})

export const NO_READING_CHARACTER = NO_READING

/** The grid for a label, falling back to the weather-less figure. */
export function vibeCharacterFor(label) {
  return VIBE_CHARACTERS[label] ?? NO_READING_CHARACTER
}

/**
 * The figure's base tone. Everything else is derived from it.
 *
 * `muted` in every state — the point of the figure being one *hue* is that it
 * carries no reading at all; the shading is depth, not information. The weather
 * takes the band's own token, so the picture and the word beside it are
 * literally the same colour.
 */
export const FIGURE_TOKEN = 'muted'

/** Relative luminance, for ordering a ramp rather than guessing at it. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const mix = (from, to, t) => '#' + [1, 3, 5].map(i => {
  const a = parseInt(from.slice(i, i + 2), 16)
  const b = parseInt(to.slice(i, i + 2), 16)
  return Math.round(a + (b - a) * t).toString(16).padStart(2, '0')
}).join('')

/**
 * The five figure tones for a theme, derived from `muted`.
 *
 * **Derived rather than declared, deliberately.** Five tones × two themes is
 * ten values that exist for one drawing and would have to be chosen, named and
 * contrast-checked like every other token — for shading, which carries no
 * reading and therefore has nothing to be legible *about*. Deriving them keeps
 * `palette.js` the single source of the hue and leaves nothing to drift.
 *
 * **The ordering comes from lightness, not from token names, and that is the
 * bug this function exists to prevent.** A first draft mixed shadow toward
 * `ground` and highlight toward `ink` — correct in dark mode, and exactly
 * inverted in light mode, where `ground` is near-white. The shading looked
 * broken and nothing would have failed. So the darker of the two ends is
 * found by measuring, and the ramp is asserted monotonic in
 * `vibeCharacter.test.js`.
 */
export function figureTones(palette) {
  const base = palette[FIGURE_TOKEN]
  const darkEnd = luminance(palette.ground) < luminance(palette.ink) ? palette.ground : palette.ink
  const lightEnd = darkEnd === palette.ground ? palette.ink : palette.ground
  return {
    K: mix(base, darkEnd, 0.55),   // outline
    S: mix(base, darkEnd, 0.22),   // shadow
    M: base,                        // midtone
    H: mix(base, lightEnd, 0.38),  // highlight
    F: mix(base, lightEnd, 0.62),  // the blank face, brighter than the hood
  }
}

/** The tones in order, darkest first — what the ramp assertion checks. */
export const TONE_ORDER = Object.freeze(['K', 'S', 'M', 'H', 'F'])

/**
 * The sizes it is displayed at — 60px on a phone, 80px from `md:` up.
 *
 * **Both were chosen by rasterising the set and looking at it**, which is the
 * only way this question has an answer — and the answer moved when the grid
 * did. At 20 × 20 flat, 60px worked. At 32 × 32 shaded it does not: 64px is
 * mush and 80px is marginal, because detail and display size are one decision
 * rather than two. 96 (3px cells) is the floor and 128 (4px) is comfortable.
 * Both divide 32 whole; a fractional cell antialiases every edge in the artwork
 * into a smear that nothing reports, which is `mark.js`'s hard-won lesson.
 */
export const CHARACTER_SIZES = Object.freeze({ base: 96, md: 128 })

/**
 * Cells must land on whole pixels. Asserted over the declared sizes rather
 * than trusted, because the failure is silent — nothing errors, the artwork
 * just goes soft.
 */
export function cellsAreWhole(size) {
  return Number.isInteger(size / GRID_WIDTH) && Number.isInteger(size / GRID_HEIGHT)
}

/**
 * Runs of the same tone along a row, merged into one rect.
 *
 * Not a file-size nicety — it is the difference between ~350 DOM nodes per
 * render and ~140, on an element that re-renders whenever the score ticks or
 * the theme flips. `scripts/lib/mark.js` merges for the same reason and adds
 * the other one: adjacent rects at fractional coordinates show hairline seams
 * between them, and a merged run has no interior edges to seam.
 */
export function toneRuns(grid) {
  const runs = []
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const tone = row[x]
      let width = 1
      while (row[x + width] === tone) width++
      if (tone !== '.') runs.push({ x, y, width, tone })
      x += width
    }
  })
  return runs
}
