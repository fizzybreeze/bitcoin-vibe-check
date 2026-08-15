/**
 * The CRT treatment on the price chart — a scanline roll and a tracking wobble.
 *
 * **These values mirror the `.crt-*` rules in `src/index.css`, which is where
 * the effect is actually drawn**; `crt.test.js` parses that file and fails if
 * the two disagree, the same arrangement the palette and the type stacks use and
 * for the same reason — the stylesheet is the only thing a browser reads, and a
 * constant nothing checks is a comment.
 *
 * Three decisions here are load-bearing rather than taste, and all three are
 * about what the effect is *not* allowed to cost.
 *
 * **1. It is composited, so it is very nearly free.** Both animations move only
 * `transform`, on layers the compositor owns: no layout, no repaint, no React
 * render, no `requestAnimationFrame`. The tempting version of a scanline roll
 * animates `background-position` on a `repeating-linear-gradient`, which repaints
 * the whole layer every frame — the same picture at a real per-frame cost. The
 * scanlines therefore translate by exactly one gradient period, which is both
 * seamless at any container height and the reason the element only has to be a
 * few pixels over-tall rather than doubled.
 *
 * A CSS animation rather than a JS one is also what keeps the visual baselines
 * honest: Playwright's `toHaveScreenshot` resets infinite CSS animations to their
 * initial frame before capturing, so the effect is deterministic under test. An
 * rAF loop would be outside that guarantee and would flake every baseline it
 * touched. `page.clock.setFixedTime` would not help — CSS animations run off the
 * compositor's timeline, not `Date.now()`.
 *
 * **2. The overlay is held to WCAG AA, and nothing else in the suite can see
 * that.** `palette.test.js` proves every token clears 4.5:1 on the surface it
 * sits on; it computes those ratios from the tokens themselves, so a translucent
 * layer composited *over* the text is completely invisible to it. A scanline
 * shifts the glyph and the ground under it by the same amount, which does not
 * preserve the ratio — it compresses it. The alphas are measured answers rather
 * than chosen ones, and **the figure that matters is the two layers combined**,
 * since the band rolls over the scanlines: `combinedAlpha` is 0.1168 here, where
 * the quiet tier holds 4.61:1 in dark and 4.87:1 in light. `SCANLINE_ALPHA` is
 * 0.08 rather than the 0.10 it started at for exactly that reason — see its own
 * docblock. `crt.test.js` recomputes all of it through the composite, so
 * strengthening the effect to taste fails the build rather than the reader.
 *
 * **3. The wobble moves the whole chart, never the series alone.** Displacing
 * the price line relative to its own gridlines and the high/low reference lines
 * changes where a reading appears to sit against the axis — a decorative effect
 * quietly altering a factual one, which is the version of this that would be a
 * correctness bug rather than a style. It is applied to the chart wrapper, so
 * the axes, the gridlines and the line all move together and the reading stays
 * internally consistent.
 *
 * The amplitude is whole pixels for a reason that is not aesthetic: a fractional
 * translate on a composited layer resamples the text inside it, and the chart's
 * axis labels are 11px. Crisp and slightly jerky beats smooth and soft on the
 * one element whose job is to be read.
 *
 * Reduced motion needs nothing here. The blanket rule in `index.css` already
 * stops every animation in the app, and this degrades the way that rule assumes:
 * the scanlines stop rolling and stay as a static texture, so the decoration
 * survives and only the movement goes.
 */

/**
 * Peak opacity of a scanline, as a fraction. Mirrors the `color-mix` percentage
 * in `index.css`. This is a ceiling established by measurement — see the header,
 * and see `crt.test.js`, which will not let it rise past what AA allows.
 *
 * **It came down from 0.10 when the rolling band was added, and that is the
 * shared-budget rule below doing its job rather than a retune.** A pixel can be
 * under a scanline *and* under the band at once, so what has to clear AA is the
 * combination — and at 0.10 the largest band that fits is 0.03, which is too
 * faint to read as an artifact. The scanlines gave up about a fifth of their
 * strength to buy a band worth having.
 */
export const SCANLINE_ALPHA = 0.08

/** Gradient period in CSS pixels: one lit row plus one dark line. */
export const SCANLINE_PITCH_PX = 3

/** How much of that period is the dark line. */
export const SCANLINE_LINE_PX = 1

/**
 * Peak opacity of the rolling band — the soft luminance bar that sweeps down the
 * chart, the hum bar of a mistuned terrestrial picture.
 *
 * **It carries no texture of its own on purpose.** The obvious way to draw
 * "static" is a fine noise pattern inside the band, and that is a third layer
 * stacking into the same budget as the scanlines and the band wash. Left plain,
 * the base scanlines show *through* the band and supply the texture for free —
 * which is both cheaper and the more faithful artifact, since a hum bar is a
 * brightness disturbance rolling over the picture rather than a patch of noise
 * pasted onto it.
 */
export const BAND_ALPHA = 0.04

/** How tall the band is, in CSS pixels, before its edges are feathered away. */
export const BAND_HEIGHT_PX = 44

/**
 * How far the band travels, as a percentage of its own height — a `translateY`
 * percentage resolves against the element, not its container, so this is the one
 * unit that does not silently assume a chart height.
 *
 * It still has to *exceed* the plot area plus the band, or the band stops short
 * of the bottom and the pass never completes. `crt.test.js` reads the chart's
 * height out of `PriceChartCard` and checks that, rather than leaving the two
 * numbers to agree by memory.
 */
export const BAND_TRAVEL_PCT = 700

/**
 * The two cycle lengths, in seconds. **Deliberately different, and deliberately
 * not multiples of each other**: at 7 and 9 they realign only once every 63
 * seconds, so the wobble and the band drift in and out of phase instead of
 * arriving together on a beat the eye can learn. Equal periods — or 6 and 12 —
 * would read as one mechanism firing twice rather than as two faults.
 */
export const WOBBLE_PERIOD_S = 7
export const BAND_PERIOD_S = 9

/**
 * How long the scanline raster takes to travel one period — the third cadence,
 * and the only one that is not a *fault*: the raster drifts continuously the way
 * a real one does, where the wobble and the band are occasional disturbances.
 *
 * It is declared here for the same reason as the other two rather than because
 * it interacts with them. Left in the stylesheet alone it was the one timing in
 * the effect with no constant and no assertion behind it, which is how a number
 * ends up being changed by whoever is nearest.
 */
export const SCANLINE_PERIOD_S = 1.2

/**
 * How many times per cycle the wobble is allowed to displace the chart.
 *
 * One. The first version fired three times in seven seconds, which stopped
 * reading as an occasional tracking fault and started reading as a nervous tic
 * on a chart someone is trying to read a number off.
 */
export const MAX_WOBBLE_OFFSETS = 1

/**
 * Two source-over layers at these alphas, as the compositor resolves them.
 *
 * This exists as a function rather than a constant because it is the thing the
 * AA check actually has to be run against: neither `SCANLINE_ALPHA` nor
 * `BAND_ALPHA` is the number that lands on a glyph when the band rolls over a
 * scanline, and checking them separately would clear both while the overlap
 * fails.
 */
export const combinedAlpha = (a, b) => 1 - (1 - a) * (1 - b)

/**
 * The sparklines get the same raster as a **ground behind the series**, not as
 * an overlay on top of it, and that single difference is what makes them
 * possible at all.
 *
 * The first read of this was that the sparklines could not have scanlines:
 * they are 40px and 80px tall, the stroke is 1.5px, and a 1px dark line every
 * 3px chops a line that thin into dashes. That is true of an *overlay* and is
 * simply not true of a background — the SVG paints over it, so the series keeps
 * its full strength and its crisp edges while the box behind it reads as a
 * little screen. Same pitch and same token as the price chart, deliberately, so
 * the three of them read as one piece of hardware rather than three effects.
 *
 * The alpha is higher than the chart's because it can be: nothing here
 * composites over text, and the band never reaches these cards, so the shared
 * budget above does not apply. What binds instead is the series staying legible
 * against its own ground.
 *
 * **The raster drifts now, where it used to be static, and this file argued for
 * static.** That argument was that the chart carries the movement and a third
 * and fourth rolling raster would compete with the one place motion means
 * something. It was overruled deliberately — see `GRAIN_DRIFT_PERIOD_S`, which
 * is where the version that does not compete is described, because the pace is
 * the whole of the difference between the two readings.
 *
 * What the change costs is the *other* half of that paragraph, and it is worth
 * stating rather than dropping: these are no longer free. Each grained box is a
 * clipping frame with a promoted layer inside it, and each is now on the
 * reduced-motion path. Both are still compositor-only — one `transform`, no
 * repaint, no rAF — so the cost is two more layers rather than two more
 * animations that do work per frame.
 */
export const GRAIN_ALPHA = 0.12

/**
 * How long the sparkline raster takes to travel one period.
 *
 * **This is the whole of the "does it compete with the chart" question, and it
 * is a pace rather than a presence.** The objection to animating these at all
 * was that a second and third rolling raster would pull attention off the one
 * element where movement carries meaning. At the chart's own 1.2s the objection
 * is correct — and it is worse than it sounds on a small box, because a raster
 * drifts at an absolute speed while a box is a fixed height: 2.5px/s crosses the
 * 264px chart in a slow two minutes and crosses a 40px sparkline in sixteen
 * seconds. The identical declaration reads as an idling screen on one and as
 * something scrolling on the other.
 *
 * At 6s the drift is 0.5px/s. A row takes six seconds to move into the place the
 * row above it just left, which is slow enough that nothing in peripheral vision
 * registers it as motion and fast enough that it is plainly moving once you look
 * at it — a vertical hold very slightly out, which is the whole artifact. It is
 * deliberately **not** coprime with anything: the two sparklines and the chart
 * are meant to read as one piece of hardware, and two rasters drifting at
 * unrelated speeds side by side is what would say otherwise. That is the
 * opposite of the wobble-and-band rule above and for the opposite reason — those
 * are two independent *faults*, and this is one screen.
 *
 * The pixel shift was ruled out for these outright. The chart's wobble displaces
 * a 264px box by a pixel; the same displacement on a 40px box is proportionally
 * six times the disturbance, on an element whose entire content is a 1.5px line.
 */
export const GRAIN_DRIFT_PERIOD_S = 6

/**
 * How much contrast the sparkline series must keep against the grained ground.
 *
 * A data line is a graphical object, so WCAG 1.4.11 asks 3:1 — this is the text
 * threshold instead, held deliberately because it is free here (the measured
 * figure is about 5:1 in both themes) and because a sparkline is a reading
 * rather than an ornament. Pinning the stricter bar costs nothing today and
 * stops the grain being turned up later to the point where it does.
 */
export const GRAIN_MIN_SERIES_CONTRAST = 4.5

/**
 * ── The export surfaces ─────────────────────────────────────────────────────
 *
 * The treatment above stops at the edge of the app. The share image, the live
 * link preview and its static fallback all carry the wordmark and the palette
 * and none of the screen, which means the three surfaces seen by people who
 * have *not* visited the site are the three that do not look like it.
 *
 * **The raster below is the same raster, and it is expressed a third way
 * because neither rasteriser can read the first two.** That is a measurement
 * rather than a precaution — probed against html2canvas 1.4.1 in Chromium and
 * against Satori, each with a positive and a negative control, counting mean
 * luminance per pixel row of the actual output:
 *
 * | mechanism                                  | browser | html2canvas | Satori |
 * |--------------------------------------------|---------|-------------|--------|
 * | `repeating-linear-gradient`, shorthand      | correct | **nothing** | **wrong** |
 * | `repeating-linear-gradient`, long-form      | correct | **nothing** | correct |
 * | data-URI SVG tile + `background-repeat`     | correct | correct     | correct |
 *
 * Two of those cells are the reason this is a function and not a copied string.
 * **html2canvas draws no repeating gradient at all** — the element is present,
 * correctly sized, and empty, which is precisely the `color-mix` failure
 * `crt.spec.js` already guards in the browser, met again one layer out. And
 * **Satori draws the shorthand as something else entirely**: given
 * `transparent 0 2px, ink 2px 3px` it discards the double-position stops and
 * emits a *smooth two-pixel ramp*, measured as alternating rows of 16 and 143
 * where the correct raster is 0 and 255. That is worse than drawing nothing,
 * because a soft two-pixel wash looks like a deliberate texture and nothing
 * anywhere reports that the picture is not the one this file describes.
 *
 * So the export surfaces get a 1×`SCANLINE_PITCH_PX` SVG tile, repeated — the
 * one form all three agree on. The app keeps the `color-mix` shorthand in
 * `index.css`, because that is the only form that can follow a theme without
 * JavaScript, and `crt.test.js` asserts the two describe the same raster.
 */

/**
 * Peak opacity of the raster on an export surface.
 *
 * **The chart's ceiling does not transfer here, and assuming it did was wrong
 * in the direction that matters.** The two effects composite differently: the
 * chart overlay sits *over* the text as well as the ground, so a scanline moves
 * the glyph and the ground under it together and merely compresses the ratio.
 * This raster is a `background-image` — it is *behind* the text, so the ground
 * moves and the glyph does not. Measured on dark `quiet` over `surface` at this
 * alpha: **4.95:1 when the layer is over both, 4.44:1 when it is behind the
 * text.** The first clears AA and the second does not, from one number applied
 * to two arrangements.
 *
 * So the placement was decided by the contrast rather than the contrast being
 * tuned to a placement — see `EXPORT_GRAIN_LAYERS`. With the raster on the
 * *ground* and the cards opaque on top of it, 0.08 clears AA at 4.56:1 and
 * still bands at 1.16, both in the worse of the two themes.
 *
 * **The window is narrow and that is stated rather than smoothed over**: AA
 * fails above ~0.084 and the banding floor fails below ~0.075. Both bounds are
 * real and they point at each other, which is the same squeeze the scanlines
 * and the band are already in. There is no headroom assertion for this one
 * because there is no headroom; what protects it is that `crt.test.js` checks
 * *both* bounds, so a nudge in either direction fails the build rather than
 * either the reader or the effect.
 *
 * The band never reaches these surfaces, so this is the whole composite and
 * `combinedAlpha` does not apply.
 */
export const EXPORT_GRAIN_ALPHA = SCANLINE_ALPHA

/**
 * Where the export raster is laid, and what sits on top of it there.
 *
 * **This is a table rather than a role list because the constraint is genuinely
 * per surface**, and flattening it produces a false failure: `up` on a *light*
 * ground measures 4.44:1 through the raster, which would rule the whole
 * treatment out — except that nothing draws `up` on a light ground. The share
 * card's ground carries only the header and footer lines; the preview card
 * draws its values on the ground but is dark-only, by the same decision that
 * has kept it dark since v1.8.0. A union across both would hold each surface to
 * the other's worst case and neither to its own.
 *
 * **`ShareCanvas` grains the ground and not the card bodies**, which is the
 * sparkline rule reached a second time: put the raster behind the content, not
 * behind the reading. The cards are opaque `surface`, so they sit on the screen
 * rather than each being one — which is also the better picture, since eight
 * separately-grained boxes read as a texture applied to everything rather than
 * as one piece of hardware.
 *
 * A role drawn on a grained ground without being listed here is a role this
 * treatment is dimming with nothing checking it — the contract `CRT_INK_ROLES`
 * holds for the chart, in a second place.
 */
export const EXPORT_GRAIN_LAYERS = Object.freeze([
  Object.freeze({
    what: 'ShareCanvas',
    surface: 'ground',
    themes: Object.freeze(['dark', 'light']),
    // The header's tagline and summary, and the footer's domain and timestamp.
    // Everything else in the image is inside an opaque card.
    roles: Object.freeze(['quiet', 'muted']),
  }),
  Object.freeze({
    what: 'ogView',
    surface: 'ground',
    themes: Object.freeze(['dark']),
    // This card has no inner panel over most of its area, so its figures do sit
    // on the raster — `ink` is the price, `accent` the rule, `up`/`down` the
    // change and ATH lines.
    roles: Object.freeze(['ink', 'muted', 'quiet', 'accent', 'up', 'down']),
  }),
])

/** `#rrggbb` → `[r, g, b]`. */
const rgbOf = hex =>
  [0, 2, 4].map(i => parseInt(hex.replace('#', '').slice(i, i + 2), 16))

/**
 * One tile of the raster: `SCANLINE_LINE_PX` lit rows at the bottom of a
 * `SCANLINE_PITCH_PX`-tall cell, the rest clear.
 *
 * The line sits at the *end* of the period so this tile and the stylesheet's
 * gradient (`transparent 0 2px, ink 2px 3px`) put their lit row in the same
 * place — a tile that led with the line would draw an identical-looking raster
 * one pixel out of phase with the app, which is invisible on either surface
 * alone and wrong when the two are seen together.
 *
 * `fill` plus `fill-opacity` rather than an `rgba()` fill: `rgba()` in a
 * presentation attribute is CSS Color rather than SVG 1.1, and the failure mode
 * if a rasteriser declines it is a raster at *full* opacity — a black bar every
 * three pixels across a posted image.
 */
export function grainTileSvg(hex, alpha = EXPORT_GRAIN_ALPHA) {
  const [r, g, b] = rgbOf(hex)
  const y = SCANLINE_PITCH_PX - SCANLINE_LINE_PX
  return '<svg xmlns="http://www.w3.org/2000/svg" ' +
    `width="1" height="${SCANLINE_PITCH_PX}">` +
    `<rect x="0" y="${y}" width="1" height="${SCANLINE_LINE_PX}" ` +
    `fill="rgb(${r},${g},${b})" fill-opacity="${alpha}"/></svg>`
}

/**
 * That tile as a `url(…)` value, ready for `background-image`.
 *
 * Percent-encoded rather than base64: `btoa` is a browser global that Node only
 * carries as a deprecated shim, and this runs in a browser (`ShareCanvas`), in
 * a serverless function (`ogView`) and in a build script. Both encodings were
 * measured drawing the identical raster in both rasterisers, so the isomorphic
 * one wins on having no environment to be wrong about.
 */
export const grainTileUri = (hex, alpha) =>
  `url("data:image/svg+xml,${encodeURIComponent(grainTileSvg(hex, alpha))}")`

/**
 * The raster as inline-style properties, which is the only form `ShareCanvas`
 * and `ogView` can take — both are styled with objects rather than classes.
 *
 * Returned as a pair rather than a single shorthand string because Satori reads
 * individual properties and ignores the `background` shorthand.
 */
export function grainBackground(hex, alpha) {
  return {
    backgroundImage: grainTileUri(hex, alpha),
    backgroundRepeat: 'repeat',
  }
}

/**
 * The roles that actually render *inside* the chart box, and therefore the ones
 * the overlay is laid over. Derived from `PriceChartCard` rather than assumed:
 * `quiet` is both axes' tick labels, `up` and `down` are the high/low reference
 * lines and their labels, `accent` is the price series and `support` is the
 * volume bars. A role added to that card without being added here is a role this
 * effect is dimming with nothing checking it.
 */
export const CRT_INK_ROLES = ['quiet', 'up', 'down', 'accent', 'support']

/**
 * The one role inside that box the AA check deliberately skips, named rather
 * than quietly omitted so the exemption can be re-checked instead of trusted.
 *
 * `line` is the Cartesian gridline. It is neither text nor a user interface
 * component, so WCAG sets no minimum ratio for it at all — and it is drawn a
 * hair off the surface on purpose, sitting far below 3:1 before this effect
 * exists. Holding it to a threshold it was never meant to meet would fail the
 * build over a decision made two versions ago; dimming it a further 10% is not a
 * regression against anything it currently claims.
 */
export const CRT_DECORATIVE_ROLES = ['line']

/**
 * The surface the chart box sits on. Every card root is `bg-surface`, so this is
 * what the overlay composites against.
 */
export const CRT_SURFACE_ROLE = 'surface'

/**
 * The token the scanlines are drawn in — the one that always opposes the
 * surface, so the banding is visible whichever theme is on.
 *
 * **This started as `scrim` on the reasoning that a scanline is the unlit gap
 * between rows and therefore has to be dark in both themes, and that was wrong
 * in the way that matters: it described the drawing instead of predicting what
 * you would see.** Measured against the real palette, `scrim` at this alpha
 * produces a lit-row-to-dark-row contrast of 1.013 in dark mode — 1.000 is no
 * banding at all — because the dark theme's `surface` and `scrim` sit almost
 * on top of each other in luminance. There is no room *below* an already-near-
 * black plot area, and raising the alpha does not rescue it: even at 0.34, far
 * past the point where the axis labels fail AA, dark reaches only 1.050. The
 * effect was invisible in the product's default theme and clearly visible in the
 * other, from one value that looked perfectly reasonable.
 *
 * `ink` is white in dark mode and near-black in light, so the scanlines darken a
 * light plot area and brighten a dark one — which is also the more faithful
 * reading of a CRT, where the rows are lit phosphor and the gaps are the
 * absence of it. On a dark screen you see bright lines, not dark ones.
 *
 * The switch is narrower than it looks: in the light theme `ink` and `scrim` are
 * declared to the same value, so nothing about light mode moves — which is worth
 * knowing before reading this as a re-skin. Dark mode goes from 1.013 to 1.329
 * banding, and its AA headroom *improves*, because white at this alpha lifts the
 * surface less than it lifts the text sitting on it.
 */
export const CRT_SCANLINE_ROLE = 'ink'

/**
 * The floor on how visible the banding has to be, as a contrast ratio between a
 * lit row and a scanline row. 1.0 is a flat field.
 *
 * This exists because the bug above passed every test in the file. "Is the
 * scanline colour a palette token" and "does the text still clear AA" were both
 * true of an effect that did not render, so the suite could only ever catch the
 * overlay being too strong and never it being pointless. Set just under the
 * weaker of the two themes at the shipped alpha, so a palette change that
 * flattens the effect fails rather than quietly removing it.
 */
export const MIN_BANDING_RATIO = 1.15
