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
 * darkens the glyph and the ground under it by the same amount, which does not
 * preserve the ratio — it compresses it. `SCANLINE_ALPHA` is the measured answer
 * rather than a chosen one: at 0.15 the quiet tier drops to 4.30:1 in dark mode
 * and fails, and 0.10 leaves every role that renders inside the chart box above
 * 4.7:1 in both themes. `crt.test.js` recomputes that through the composite, so
 * darkening the effect to taste fails the build rather than the reader.
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
 */
export const SCANLINE_ALPHA = 0.1

/** Gradient period in CSS pixels: one lit row plus one dark line. */
export const SCANLINE_PITCH_PX = 3

/** How much of that period is the dark line. */
export const SCANLINE_LINE_PX = 1

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
