/**
 * The circuit-trace ground — a sparse PCB pattern behind the whole page.
 *
 * **These values mirror the `.circuit-ground` rules in `src/index.css`, which is
 * where the pattern is actually drawn**; `circuitry.test.js` parses that file and
 * fails if the two disagree, the same arrangement `crt.js`, `palette.js` and
 * `typography.js` already use and for the same reason.
 *
 * ── What this is, and what it is deliberately not ────────────────────────────
 *
 * The retro treatment so far is a *screen*: scanlines, a hum bar, phosphor
 * drift, a pixel-grid wordmark, a pixel character. A circuit board is a
 * different object — the inside of the machine rather than its display — so this
 * is the first thing in the product that is not part of the same metaphor. It
 * earns its place only if it stays firmly a *ground*: the moment you read it as
 * a picture rather than as a surface, there are two things on screen competing
 * to be looked at and one of them is not the data.
 *
 * Three things follow from that, and all three are limits rather than features.
 *
 * **1. It does not animate, and that is the single most important line here.**
 * The chart has two moving artifacts, the sparklines now have a third, the
 * supporter ticker scrolls and the block dot breathes. A moving page background
 * is the point at which a dashboard stops being readable, and unlike everything
 * else in the CRT treatment it would be moving *behind the entire page* rather
 * than inside one box. There is no constant to turn up here because there is
 * nothing to turn up.
 *
 * **2. Its strength is a measured ceiling, and the ceiling is what makes this
 * subtle rather than a choice to be subtle.** Every text role in the app is held
 * by `palette.test.js` to 4.5:1 against `ground`; this layer sits *behind* that
 * text, so it moves the ground and leaves the glyph where it is — the harsher of
 * the two composites, the same asymmetry `crt.js` records for the export
 * surfaces. Held to the full `ON_EVERY_SURFACE` list rather than to a
 * hand-derived list of what happens to render on the ground today, because the
 * ground is precisely where a future element lands without anyone thinking about
 * this. That contract caps the layer at about 5% before the tightest role
 * crosses the line, and that cap is the reason the traces read as a whisper.
 *
 * **The honest reading of that is that the cap is doing the design work.** At a
 * strength where a circuit board is legible *as a circuit board*, the header and
 * footer copy fail AA; at a strength where they pass, what you get is texture
 * with a faint suggestion of structure in it. That is a real outcome rather than
 * a compromise to be tuned around — but it means anyone hoping for a visible
 * motif is going to be disappointed by the version that is allowed to ship, and
 * the right response to that is to drop the layer rather than to raise the
 * alpha.
 *
 * **3. It is app-only, and the exception is named rather than left as an
 * omission.** v1.16.0's rule is that the retro treatment reaches the three
 * export surfaces, and this one cannot: it is drawn with `mask-image`, which is
 * how a single tile follows the theme without shipping one asset per theme, and
 * Satori does not implement masking at all while html2canvas's support for it is
 * unmeasured. Baking the colour into the tile instead would mean two literal
 * hexes standing in for `--color-ink` on surfaces nothing re-checks — which is
 * the two-different-oranges bug with extra steps. The share image and both
 * preview cards keep the scanline raster and skip this.
 */

/**
 * Peak opacity of the traces, as a fraction. Mirrors the `color-mix` percentage
 * in `index.css`.
 *
 * **This is a ceiling, not a taste**, and the binding role is `support` in the
 * light theme, which reaches exactly 4.5:1 at 0.0595. Measured against the real
 * palette, behind text rather than over it:
 *
 * | alpha | dark worst   | light worst    | banding (light) |
 * |-------|--------------|----------------|-----------------|
 * | 0.045 | 5.37 (quiet) | 4.62 (support) | 1.092           |
 * | 0.055 | 5.25 (quiet) | 4.54 (support) | 1.112           |
 * | 0.070 | 5.01 (quiet) | 4.42 (support) | 1.142           |
 *
 * 0.045 is what ships, for the headroom rather than for the number: landing on
 * 4.54 makes the next palette tweak a coin toss, and `palette.test.js` already
 * holds the tightest token to *more* than 4.6 for exactly that reason. The 4.62
 * this leaves is the smallest headroom in the app and it is why the ceiling is
 * stated here as a table rather than as one figure — there is nowhere to go.
 */
export const CIRCUIT_ALPHA = 0.045

/**
 * How faint the pattern is allowed to be before it is not there at all.
 *
 * Deliberately *lower* than `MIN_BANDING_RATIO`, which is the floor the scanline
 * raster is held to, and the difference is a property of the drawing rather than
 * a relaxation. A scanline raster is a 3px period: adjacent rows blur into each
 * other at any normal viewing distance, so it needs real luminance separation to
 * be seen as banding at all. These are isolated 2px runs on a 160px tile with
 * tens of pixels of flat ground either side, which is a far easier thing to
 * detect — a line against emptiness rather than a line against another line.
 *
 * It is still a floor and it still exists for v1.13.0's reason: "the colour is a
 * palette token" and "the text still clears AA" are both true of a layer that
 * renders as nothing, so without this the suite could only ever catch the
 * pattern being too strong.
 */
export const CIRCUIT_MIN_BANDING_RATIO = 1.08

/**
 * The tile, in CSS pixels. Square, and large on purpose.
 *
 * A small tile turns the pattern into a texture, which is a different and
 * cheaper effect — the whole reason to draw traces rather than a grid is that a
 * run travels somewhere, and a run cannot travel anywhere inside a 24px cell.
 *
 * **160 was the first answer and it was visibly wrong, which is the finding
 * here.** A tiled pattern gives itself away through whichever of its elements is
 * most distinctive, and the first drawing's three-line bus recurred on a strict
 * 160px grid across the header — a rhythm the eye locks onto in about a second,
 * at which point the ground stops reading as a board and starts reading as
 * wallpaper. The fix was the tile and the drawing together: 240 spreads the
 * repeat to five across a desktop header, and the bus is gone in favour of runs
 * that are individually unremarkable. **Nothing about the alpha was touched** —
 * this was legibility of the *motif*, not of the ink, and turning the pattern
 * down would have hidden the periodicity by hiding the pattern.
 *
 * **What it cannot do is the gutters**, and that is worth knowing before reading
 * the rendering as broken: the ground is visible as a 16px gap between cards for
 * most of the page's area, and a 16px-wide slice of a 160px tile is nearly
 * always blank ground with the occasional fragment. The pattern reads in the
 * header, in the footer, and in the page's own padding — which is the whole of
 * where it was ever going to read.
 */
export const CIRCUIT_TILE_PX = 240

/**
 * The artwork, as one tile.
 *
 * A string rather than a file for `mark.js`'s reason: changing it is then a diff
 * somebody can read on a phone. `index.css` carries this verbatim inside a
 * `url("data:image/svg+xml,…")`, unencoded and quoted with single quotes, so the
 * stylesheet's copy is readable too — the test compares the pair.
 *
 * Two things in the geometry are load-bearing rather than drawn by eye:
 *
 * **The two long runs enter and leave on matching edges** — the horizontal at
 * y=40 on both sides, the vertical at x=64 top and bottom — so a run crosses
 * from one tile into the next instead of stopping at an invisible seam. A trace
 * that dies at a tile boundary is what makes a tiled pattern look tiled, and it
 * is the one thing here that a smaller drawing cannot buy its way out of.
 *
 * **Every other run ends in a pad.** A free end reads as a trace that has been
 * cut off; a pad reads as a trace that has arrived somewhere — including where a
 * stub branches off a run that is passing through, which is a junction and takes
 * a pad for the same reason. That last one was missed in the drawing and found
 * by the test rather than by looking at it, which is the argument for checking
 * artwork structurally at all: at 4.5% opacity a single unterminated 44px stub
 * is not something anybody was going to spot on screen.
 *
 * **Nothing in it is distinctive**, which sounds like a criticism and is the
 * requirement — see `CIRCUIT_TILE_PX`. Any element the eye can name is an
 * element it can then count across the page.
 *
 * Corners are chamfered at 45° because a right-angled trace is an acid trap and
 * no board has been laid out that way since the seventies — which nobody will
 * consciously notice, and which is the difference between the pattern reading as
 * a circuit and reading as a maze.
 */
export const CIRCUIT_TILE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' " +
  "fill='none' stroke='white' stroke-width='2'>" +
  // The two runs that cross the tile edge, and the junction where they meet.
  "<path d='M0 40h96l20 20h56l20-20h48'/>" +
  "<path d='M64 0v56l-24 24v88l24 24v48'/>" +
  // Self-contained runs, each terminating in a pad below.
  "<path d='M104 128h56l20 20v44'/>" +
  "<path d='M40 120h44'/>" +
  "<path d='M216 200h-40l-20-20'/>" +
  "<g fill='white' stroke='none'>" +
  "<circle cx='64' cy='40' r='3.5'/><circle cx='104' cy='128' r='3.5'/>" +
  "<circle cx='180' cy='192' r='3.5'/><circle cx='84' cy='120' r='3'/>" +
  "<circle cx='216' cy='200' r='3.5'/><circle cx='156' cy='180' r='3'/>" +
  "<circle cx='40' cy='120' r='3'/>" +
  '</g></svg>'

/**
 * The tile as a `url()` value.
 *
 * Unencoded, which is legal inside a quoted CSS url and is the point: the
 * alternative is 900 characters of percent-encoding in the stylesheet, and an
 * artwork nobody can read in a diff is an artwork nobody will correct. It works
 * only because the drawing contains no `#` — hence `white` rather than a hex,
 * which is also what keeps `palette.test.js`'s hex ban honest here.
 */
export const circuitTileUri = () =>
  `url("data:image/svg+xml,${CIRCUIT_TILE_SVG}")`
