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
 * The sparklines get the same raster as the chart, **over the series** — the
 * chart's arrangement, and it was the opposite of this until v1.18.0.
 *
 * The alpha is higher than the chart's because it can be: nothing here
 * composites over text, and the band never reaches these cards, so the shared
 * budget above does not apply. What binds instead is the series staying legible
 * against its own ground, and now also the raster staying *invisible on the
 * line* — see `GRAIN_MAX_SERIES_BANDING`.
 *
 * **The raster drifts, where it used to be static, and this file argued for
 * static.** That argument was that the chart carries the movement and a third
 * and fourth rolling raster would compete with the one place motion means
 * something. It was overruled deliberately — see `GRAIN_DRIFT_PERIOD_S`, which
 * is where the version that does not compete is described, because the pace is
 * the whole of the difference between the two readings.
 *
 * What that costs is worth stating rather than dropping: these are no longer
 * free. Each grained box is a clipping frame with a promoted layer inside it,
 * and each is now on the reduced-motion path. Both are still compositor-only —
 * one `transform`, no repaint, no rAF — so the cost is two more layers rather
 * than two more animations that do work per frame.
 *
 * ── Why it moved in front ────────────────────────────────────────────────────
 *
 * **The drift is what made the placement visible, which is the whole report.**
 * A static raster behind a series is indistinguishable from one in front at a
 * glance; a *drifting* one behind it is two planes with the near one holding
 * still, which reads as parallax rather than as a vertical hold slipping. The
 * chart never had that problem, because its overlay is over everything — so
 * three elements built to read as one piece of hardware were split by the one
 * property nobody had reason to look at until something moved.
 *
 * **What put it behind was a claim about a number, and the number had never
 * been measured.** The argument on record was that a 1px line every 3px laid
 * over a 1.5px stroke chops the series into dashes. The measure of that is the
 * stroke's own lit-row-to-scanned-row ratio, and at this alpha it is **1.11 in
 * dark and 1.14 in light** — under `MIN_BANDING_RATIO`, which is the figure this
 * same file uses to decide a raster is visible on the ground at all. So the
 * dashing sits below the visibility floor the module already defines. The
 * corroboration was on screen the whole time: the price chart has drawn its
 * `accent` series under the identical raster since v1.13.0, at a *lower* alpha
 * but with a band stacked on top of it, and nothing has ever called it dashed.
 *
 * **The legibility figure does not move at all, and that is the part that was
 * genuinely surprising.** `GRAIN_MIN_SERIES_CONTRAST` is checked against four
 * combinations once the raster is in front — lit or scanned stroke against lit
 * or scanned ground — and the minimum of those four was the same pair it was
 * when only the ground could be scanned: the series against the grained ground.
 * Both placements, same number, so the *reasoning* that justified this alpha
 * changed and the *measurement* behind it did not.
 *
 * **It came down from 0.12 when the band arrived, and that is the shared-budget
 * rule doing its job rather than a retune.** A pixel can be under the raster
 * *and* under the band at once, so what has to clear
 * `GRAIN_MIN_SERIES_CONTRAST` is the combination — and at 0.12 the largest band
 * that fits is 0.034, which measures fainter than the chart's own band and is
 * therefore not the artifact anyone asked for. A twelfth of the raster's
 * strength buys a band at 0.04: exactly the chart's alpha, and measuring 1.10
 * dark / 1.08 light against the chart band's 1.10 / 1.08. This is the trade
 * `SCANLINE_ALPHA` made when the chart's band arrived, at a twelfth rather than
 * the fifth it paid.
 *
 * **The window is stated rather than smoothed over**: with the band at 0.04 the
 * ground has to band at least `MIN_BANDING_RATIO`, which puts a floor at
 * ~0.075, and the line has to band less than it, which puts a ceiling at
 * ~0.115 — both bounds binding in the light theme, and 0.11 sits at the top of
 * it. What protects it is that `crt.test.js` checks both, so a nudge in either
 * direction fails the build rather than either the reader or the effect.
 */
export const GRAIN_ALPHA = 0.11

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
 * **This paragraph used to rule the pixel shift out for these outright**, on the
 * grounds that the chart's wobble displaces a 264px box by a pixel while the
 * same displacement on a 40px box is proportionally six times the disturbance,
 * on an element whose entire content is a 1.5px line. That reasoning was about
 * displacing the *box*, and it still holds for displacing the box. The slip
 * below moves an element inside the clipping frame instead, so nothing shifts
 * relative to anything outside it and the arithmetic never applies. See
 * `SLIP_OFFSET_PX`.
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
 * ── The sparklines' own faults ──────────────────────────────────────────────
 *
 * The raster above is the *screen*, and it is deliberately shared: one pitch,
 * one speed, three elements. What follows is the other two artifacts the chart
 * has carried since v1.13.0 — a rolling band and a one-pixel tracking slip —
 * given to the two sparklines on cadences that share no beat with each other or
 * with the chart.
 *
 * **Independence is the requirement, not a nicety, and it was already being
 * broken before any of this was added.** Until now the two sparklines were
 * byte-identical in treatment: one class, one 6s drift, mounted in the same
 * frame. For a raster that is invisible — it tiles, so there is no feature to
 * align on and no way to *see* that the two are in phase. For a fault it would
 * be glaring: two boxes twitching in unison read as one mechanism driving both
 * rather than as two screens with two faults, which is the same argument
 * `WOBBLE_PERIOD_S` makes about one element and applied across two.
 */

/**
 * Peak opacity of a sparkline's rolling band.
 *
 * **A measured ceiling, and the constraint that binds it is not the chart's.**
 * `BAND_ALPHA` is held down by the AA budget: the chart's band rolls over 11px
 * axis labels, so what has to clear 4.5:1 is `combinedAlpha` of the two layers.
 * Nothing here composites over a glyph at all — a sparkline is one stroke in an
 * empty box — so the combined figure is free to exceed the chart's (it is
 * 0.1444, against the chart's 0.1168 ceiling) and the binding constraint is
 * `GRAIN_MIN_SERIES_CONTRAST` instead: the stroke against its own ground, read
 * through the raster *and* the band.
 *
 * **It is `BAND_ALPHA` because it measured to `BAND_ALPHA`, from that different
 * constraint, and it is worth stating rather than leaving as a coincidence
 * somebody later "tidies".** Measured across the 4 x 4 cross product of the
 * alphas `ink` can arrive at — none, raster, band, both — for the stroke and
 * the ground independently, at the shipped `GRAIN_ALPHA`:
 *
 *   band α   min contrast dark / light   band visibility dark / light
 *   0.025          4.80 / 4.86                  1.065 / 1.047   ← too faint
 *   0.030          4.72 / 4.81                  1.077 / 1.057
 *   0.040          4.59 / 4.72                  1.105 / 1.077   ← ships
 *   0.045          4.52 / 4.68                  1.118 / 1.087
 *   0.050          4.45 / 4.63                        —         ← fails AA, dark
 *
 * The window is 0.030 to 0.045 and this sits inside it with room on both sides,
 * which is unusual in this file and is bought by the paragraph in `GRAIN_ALPHA`
 * above. The floor is `MIN_BAND_VISIBILITY`; the ceiling is the series.
 *
 * **The binding theme is dark, which is the opposite way round from
 * `GRAIN_ALPHA`**, whose window is pinned by light at both ends. Worth knowing
 * before anyone reasons about this file from memory.
 *
 * **The cross product is deliberately harsher than what can actually happen**,
 * and the gap is large enough to say so rather than leave implied. Both
 * artifacts vary only in *y*, and the band is 13px tall, so a stroke pixel and
 * the ground beside it are under the same band coverage everywhere but its
 * feathered edge — the physically reachable worst case is the 4-cell diagonal,
 * which measures 5.17 dark and 5.09 light. The conservative form is kept
 * because it is the convention already on record for the raster, and because a
 * bound that is only true of today's band height is a bound that stops being
 * true when someone changes the band height.
 *
 * **An exemption was expected here and turned out not to be needed**, which is
 * worth recording as a measurement rather than as an absence. The band lifts the
 * ground toward `ink`, so the obvious worry is that it flattens the raster where
 * it passes and `MIN_BANDING_RATIO` would have to be carved out for it. It does
 * not: under the band the ground still bands 1.41 in dark and 1.24 in light, and
 * the stroke still bands 1.10 and 1.12 — inside both bounds. So both are
 * asserted *under the band* as well, and a future alpha that does flatten the
 * ground fails the build instead of being quietly legal.
 */
export const SPARK_BAND_ALPHA = BAND_ALPHA

/**
 * How tall a sparkline's band is, in CSS pixels, before its edges are feathered
 * away — and the whole point is that it is **pixels, not a percentage of the
 * box**.
 *
 * The two boxes are 40px and 80px. A band expressed as a fraction of each would
 * be 6.7px on one and 13.3px on the other, which asserts two screens of
 * different sizes; the raster is 3px on both for exactly the reason the
 * opposite would be wrong. An artifact of a piece of hardware has a physical
 * height, so both bands get one height.
 *
 * 13px rather than the chart's 44 because 44 does not fit: it exceeds a 40px
 * box outright, and a band taller than its window is not a band sweeping
 * through a picture, it is the picture changing brightness. That the chart's
 * figure cannot be carried across is a real limit rather than a compromise
 * worth hiding — 13px is a third of it, and it is chosen so that after the
 * gradient's 22%/38% feather there is still a ~2px plateau to see.
 */
export const SPARK_BAND_HEIGHT_PX = 13

/**
 * How far a sparkline's band travels, as a percentage of its own height.
 *
 * Sized against the **taller** of the two boxes, because one value has to clear
 * both: 800% of 13px is 104px, against 80 + 13 for Fear & Greed and 40 + 13 for
 * the Vibe trend. `crt.test.js` derives those box heights from the `h-*` class
 * in each component rather than restating them, the same way the chart's bound
 * reads its height out of `PriceChartCard`.
 *
 * The shorter box therefore finishes its pass early and spends the rest of the
 * sweep clipped below, which is not a defect to tune out: a bar crossing a
 * shorter window takes less of the cycle to cross it, which is what it would
 * do on a real screen.
 */
export const SPARK_BAND_TRAVEL_PCT = 800

/**
 * The two sparklines' cadences, one entry per box.
 *
 * A table rather than six loose constants, because the property that matters is
 * a relationship *between* the entries — no two of these may share a beat, and
 * none may share one with `WOBBLE_PERIOD_S` or `BAND_PERIOD_S` — and a property
 * of a set is checked by walking the set. Separate exports would let a third
 * sparkline arrive without anything ever comparing it to the other two, which
 * is precisely how the two that exist came to be identical.
 *
 * All four periods are prime, so nothing realigns inside a session: 11 and 13
 * meet at 143s, 17 and 19 at 323s, and all four at 46,189s. All four are
 * *longer* than the chart's 7 and 9, deliberately — these boxes are small and
 * permanently on screen, and the chart is the one element where movement is
 * meant to carry meaning, so its faults should be the frequent ones.
 *
 * **`bandDelayS` is the half that is easy to leave out and cannot be.** Each
 * band is parked off the top of its box for 60% of its cycle, so two bands
 * started in the same frame are identically parked for the first several
 * seconds of *every* page load. Different periods make them drift apart; they
 * do not make them start apart. A **negative** delay seeks the animation
 * forward — −13s on a 19s period opens at 68% of the cycle, mid-sweep, while
 * the other is still parked at 0. A positive delay does the opposite of what is
 * wanted here, postponing the start and leaving both parked for longer.
 *
 * `boxPx` is in the table so the travel bound above is derived from the box
 * rather than restated. It is cross-checked against the `h-*` class in the
 * component, so changing `h-10` to `h-16` fails a test rather than silently
 * shortening the band's pass.
 */
export const SPARK_FAULTS = Object.freeze([
  Object.freeze({
    what: 'BtcPriceCard — Vibe trend',
    className: 'crt-fault-a',
    boxPx: 40,
    slipPeriodS: 11,
    bandPeriodS: 13,
    bandDelayS: 0,
  }),
  Object.freeze({
    what: 'MarketSentimentCard — Fear & Greed 30d',
    className: 'crt-fault-b',
    boxPx: 80,
    slipPeriodS: 17,
    bandPeriodS: 19,
    bandDelayS: -13,
  }),
])

/**
 * How far a slip displaces the picture, in whole CSS pixels, and how often.
 *
 * **The slip is vertical where the chart's wobble is horizontal, and both
 * halves of that have an argument.**
 *
 * Horizontal is what the chart needs because it has vertical furniture to slide
 * against — gridlines, tick labels, two reference lines. A sparkline has none
 * of it, and its content is a single near-horizontal stroke: displacing that
 * sideways moves it almost exactly onto where it already was. That is not a
 * subtle effect, it is no effect, which is the class of thing this module has
 * shipped before and now measures for.
 *
 * Vertical is *forbidden* on the chart, and the reason is at the top of this
 * file: it moves the series against its own scale, so a decoration would be
 * altering a reading. That objection does not survive the move to a sparkline,
 * which has no axis, no ticks and no reference lines — there is nothing on
 * screen for the line to be displaced relative to, so a vertical step reads as
 * a picture twitching rather than as a number changing.
 *
 * **Downward rather than up**, which is free and not arbitrary: the raster
 * carries one period of headroom at the top and none at the bottom, because it
 * drifts downward. A downward slip is absorbed by headroom that already exists;
 * an upward one drags the raster's bottom edge into view for the duration.
 *
 * One pixel, whole, one displacement per cycle, `steps(1, end)` — the chart's
 * reasoning unchanged. And it is applied to an element **inside** the clipping
 * frame rather than to the frame itself, which is what answers the objection
 * recorded under `GRAIN_DRIFT_PERIOD_S`: the box does not move, so the
 * displacement is not "six times the chart's" against everything sitting beside
 * it. The Vibe sparkline has a bordered section, a grid of right-aligned
 * figures and a 10px caption within a few pixels of it, and none of them move.
 *
 * The raster moves **with** the picture rather than staying on the frame, and
 * that is load-bearing rather than incidental: leaving it behind would displace
 * the stroke against a stationary raster, which is two planes with the near one
 * holding still — the exact parallax reading v1.18.0 removed when it brought
 * the raster in front. See `.crt-picture` in `index.css`.
 */
export const SLIP_OFFSET_PX = 1
export const MAX_SLIP_OFFSETS = MAX_WOBBLE_OFFSETS

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

/**
 * How visible the sparkline raster is allowed to be **on the series itself** —
 * the stroke's own lit-row-to-scanned-row contrast, where 1.0 is a line the
 * raster does not touch.
 *
 * This bound exists only because the raster moved in front of the series in
 * v1.18.0, and it is deliberately the same number as the floor above rather than
 * a second one chosen to fit. One figure used as a floor on the ground and a
 * ceiling on the line states exactly what the effect is for: a raster you can
 * see on the screen and cannot see on the reading. Two constants would let the
 * two halves of that sentence drift apart, and the pair of them is the whole
 * argument for the placement.
 *
 * It declares nothing about perception. 1.15 is this repo's own visibility
 * floor, applied in the direction that turns "it will chop the line into dashes"
 * from a prediction into a measurement. It sits beside `MIN_BANDING_RATIO`
 * rather than beside `GRAIN_ALPHA` for the plainest of reasons — it is derived
 * from it, and a `const` cannot read one declared 300 lines further down.
 */
export const GRAIN_MAX_SERIES_BANDING = MIN_BANDING_RATIO

/**
 * The floor on how visible a *band* has to be, as a contrast ratio between the
 * ground under the band and the same ground at rest, in the weaker theme.
 *
 * **This closes a hole rather than decorating one.** `BAND_ALPHA` has had no
 * floor at all since the chart's band shipped: it could be dropped to 0.005 and
 * every assertion in the file would stay green, which is `MIN_BANDING_RATIO`'s
 * own founding lesson unlearned one constant over. So this applies to both
 * bands, the chart's and the sparklines'.
 *
 * It is a second floor rather than a reuse of `MIN_BANDING_RATIO`, and the
 * honest reason is that the two measure different things and the numbers do not
 * transfer. That one is a hard-edged static raster — one lit row against the
 * dark row beside it. This is a soft edge feathered across 13px and *moving*,
 * and a moving gradient is picked up far below the contrast a static hard edge
 * needs. Holding a band to 1.15 would fail bands that plainly read: the chart's
 * measures 1.10 in dark and 1.08 in light, and the sparklines' 1.08 and 1.06.
 *
 * So it is calibrated the same way `MIN_BANDING_RATIO` is — set just under what
 * the effect already ships at, in the theme where it is weakest — and it
 * declares nothing about perception. What it is *for* is the v1.13.0 failure
 * where an artifact rendered nothing and every other check stayed green. With
 * it, `SPARK_BAND_ALPHA` fails the build in both directions: it cannot rise,
 * because the series stops clearing AA, and it cannot fall, because the band
 * stops being there.
 */
export const MIN_BAND_VISIBILITY = 1.05
