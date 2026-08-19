// The CRT treatment on the price chart, held to the three claims it makes: that
// it is composited rather than repainted, that it does not dim the chart's own
// labels below WCAG AA, and that it does not take the tooltip away.
//
// The contrast half is the reason this file exists rather than a few lines in
// `palette.test.js`. That suite computes ratios from the tokens themselves, so a
// translucent layer composited *over* the text is structurally invisible to it —
// every token can clear 4.5:1 on paper while the chart is unreadable on screen.
// The ratios here are recomputed through the composite, which is the only place
// in the suite that models the overlay at all.
//
// The stylesheet is parsed rather than trusted, on the palette and typography
// precedent: `crt.js` is the file a person reads and `index.css` is the file the
// browser reads, and nothing but an assertion across the pair keeps them saying
// the same thing.
import { describe, it, expect } from 'vitest'
import { ogElement } from '../../api/lib/ogView.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PALETTE, THEMES } from '../lib/palette.js'
import {
  SCANLINE_ALPHA, SCANLINE_PITCH_PX, SCANLINE_LINE_PX, MIN_BANDING_RATIO,
  BAND_ALPHA, BAND_HEIGHT_PX, BAND_TRAVEL_PCT, combinedAlpha,
  GRAIN_ALPHA, GRAIN_MIN_SERIES_CONTRAST, GRAIN_DRIFT_PERIOD_S,
  GRAIN_MAX_SERIES_BANDING,
  EXPORT_GRAIN_ALPHA, EXPORT_GRAIN_LAYERS, grainTileSvg, grainTileUri,
  WOBBLE_PERIOD_S, BAND_PERIOD_S, SCANLINE_PERIOD_S, MAX_WOBBLE_OFFSETS,
  CRT_INK_ROLES, CRT_DECORATIVE_ROLES, CRT_SURFACE_ROLE, CRT_SCANLINE_ROLE,
  SPARK_BAND_ALPHA, SPARK_BAND_HEIGHT_PX, SPARK_BAND_TRAVEL_PCT, SPARK_FAULTS,
  SLIP_OFFSET_PX, MAX_SLIP_OFFSETS, MIN_BAND_VISIBILITY,
} from '../lib/crt.js'

const SRC = resolve('src')
const css = readFileSync(join(SRC, 'index.css'), 'utf8')
const chartCard = readFileSync(join(SRC, 'components/PriceChartCard.jsx'), 'utf8')

const AA_NORMAL_TEXT = 4.5
const FAULT_CLASSES = SPARK_FAULTS.map(f => f.className)

// ── sRGB compositing and contrast ────────────────────────────────────────────
const chan = v => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const rgb = hex => [0, 2, 4].map(i => parseInt(hex.replace('#', '').slice(i, i + 2), 16))
const luminance = hex => { const [r, g, b] = rgb(hex); return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b) }

function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** `top` laid over `base` at alpha `a`, as source-over compositing does it. */
function composite(base, top, a) {
  const [tr, tg, tb] = rgb(top)
  return '#' + rgb(base)
    .map((c, i) => Math.round(c * (1 - a) + [tr, tg, tb][i] * a).toString(16).padStart(2, '0'))
    .join('')
}

describe('the compositing model itself', () => {
  // Without this, a bug in `composite` makes every assertion below pass for the
  // wrong reason — the failure mode of a suite that computes its own oracle.
  it('is a no-op at zero and a replacement at one', () => {
    expect(composite('#ffffff', '#000000', 0)).toBe('#ffffff')
    expect(composite('#ffffff', '#000000', 1)).toBe('#000000')
  })

  it('lands halfway at a half', () => {
    expect(composite('#ffffff', '#000000', 0.5)).toBe('#808080')
  })

  it('agrees with contrast values of known ratio', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
    expect(contrastRatio('#808080', '#ffffff')).toBeCloseTo(3.95, 1)
  })
})

describe.each(THEMES)('%s theme, read through the overlay', (theme) => {
  const at = name => PALETTE[theme][name]
  // **The worst case is both layers at once, not either one.** The band rolls
  // over the scanlines, so a glyph pixel can be under a scanline *and* under the
  // band's peak, and the two composite to more than either alone. Checking them
  // separately would clear both while the overlap fails — which is the whole
  // reason `combinedAlpha` is a function in `crt.js` rather than two constants
  // that happen to sit near each other.
  //
  // Worst case rather than average within each layer, too: a scanline covers a
  // third of the box, but the pixels it does cover are covered fully, and a
  // glyph stem is one pixel wide.
  const WORST = combinedAlpha(SCANLINE_ALPHA, BAND_ALPHA)
  const dim = hex => composite(hex, at(CRT_SCANLINE_ROLE), WORST)
  const ground = dim(at(CRT_SURFACE_ROLE))

  it.each(CRT_INK_ROLES)('%s still clears AA under a scanline inside the band', (role) => {
    expect(contrastRatio(dim(at(role)), ground), `${role} under both layers`)
      .toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it('keeps headroom, so a nudge to either opacity cannot silently cross the line', () => {
    // The same argument `palette.test.js` makes for the quiet tier: landing on
    // exactly 4.5 makes the next tweak a coin toss. Measured, the binding
    // constraint is `quiet` in dark mode — 4.61:1 at the combined alpha, and it
    // is what forced the scanlines down from 0.10 when the band was added.
    const worst = Math.min(...CRT_INK_ROLES.map(r => contrastRatio(dim(at(r)), ground)))
    expect(worst).toBeGreaterThan(4.6)
  })

  it('draws banding you can actually see in this theme', () => {
    // The assertion this replaces checked that the scanline colour was *darker*
    // than the surface, which is a claim about the drawing rather than about
    // what renders — and it was true of a dark theme whose banding measured
    // 1.013, where 1.000 is a flat field. Every other test in this file passed:
    // the colour was a palette token, the alpha was under the AA ceiling, the
    // animation was composited. The suite could see the overlay being too strong
    // and was structurally blind to it being pointless.
    const lit = at(CRT_SURFACE_ROLE)
    const scanned = composite(lit, at(CRT_SCANLINE_ROLE), SCANLINE_ALPHA)
    expect(contrastRatio(lit, scanned), 'the scanlines are invisible in this theme')
      .toBeGreaterThan(MIN_BANDING_RATIO)
  })

})

describe('one alpha serving both themes', () => {
  it('bands them within sight of each other', () => {
    // Not a per-theme property, so it sits outside the block above. The check
    // that matters is not only that each theme is visible but that neither is
    // doing something the other is not: the `scrim` version measured 1.013
    // against 1.212 — one declaration reading as a texture in one theme and as
    // nothing at all in the default one, with no test able to tell.
    const banding = t => {
      const s = PALETTE[t][CRT_SURFACE_ROLE]
      return contrastRatio(s, composite(s, PALETTE[t][CRT_SCANLINE_ROLE], SCANLINE_ALPHA))
    }
    const [lo, hi] = THEMES.map(banding).sort((a, b) => a - b)
    expect((hi - 1) / (lo - 1), 'one theme bands far harder than the other').toBeLessThan(2)
  })
})

describe('the stylesheet mirrors crt.js', () => {
  // Bounded to the `::before` rule: the band's `::after` sits directly below it
  // and carries a `color-mix` of its own, so an unbounded slice would let the
  // scanline assertions pass by matching the band's numbers.
  const scanlineRule = css.slice(css.indexOf('.crt-overlay::before'), css.indexOf('.crt-overlay::after'))
  // Bounded at both ends for the same reason: `.crt-grain` below carries a
  // `color-mix` too, and an open-ended slice let the band's assertions collect
  // the grain's percentage alongside its own.
  const bandRule = css.slice(css.indexOf('.crt-overlay::after'), css.indexOf('.crt-wobble {'))

  it('mixes the scanline to the alpha the contrast check was run against', () => {
    // If these two separate, every ratio proved above is a ratio of a colour
    // that is not on screen.
    const pct = scanlineRule.match(/color-mix\(in srgb, var\(--color-[a-z-]+\) (\d+)%, transparent\)/)?.[1]
    expect(pct, 'no color-mix found in the scanline gradient').toBeDefined()
    expect(Number(pct)).toBe(SCANLINE_ALPHA * 100)
  })

  it('draws them in the token crt.js names, not a colour of its own', () => {
    expect(scanlineRule).toContain(`var(--color-${CRT_SCANLINE_ROLE})`)
  })

  it('repeats on the declared pitch, with the declared line thickness', () => {
    const stops = scanlineRule.match(/transparent 0 (\d+)px,[\s\S]*?transparent\) (\d+)px (\d+)px/)
    expect(stops, 'the gradient stops are not in the expected shape').not.toBeNull()
    const [, lit, lineStart, period] = stops.map(Number)
    expect(period).toBe(SCANLINE_PITCH_PX)
    expect(period - lineStart).toBe(SCANLINE_LINE_PX)
    expect(lit).toBe(SCANLINE_PITCH_PX - SCANLINE_LINE_PX)
  })

  it('mixes the band to the alpha the combined contrast check was run against', () => {
    const pcts = [...bandRule.matchAll(/var\(--color-[a-z-]+\) (\d+)%, transparent\)/g)].map(m => Number(m[1]))
    expect(pcts.length, 'no color-mix found in the band gradient').toBeGreaterThan(0)
    // Every stop at one value: a band whose peak differs from what `crt.js`
    // declares is a band the AA maths above does not describe.
    expect([...new Set(pcts)]).toEqual([BAND_ALPHA * 100])
  })

  it('gives the band the height crt.js declares, in both places it is stated', () => {
    // `height` and the parked `top` have to agree, or the band starts partly on
    // screen and the loop shows a seam at the top of every cycle.
    expect(Number(bandRule.match(/height: (\d+)px;/)?.[1])).toBe(BAND_HEIGHT_PX)
    expect(Number(bandRule.match(/top: -(\d+)px;/)?.[1])).toBe(BAND_HEIGHT_PX)
  })

  it('draws every band stop in the same token as the scanlines', () => {
    // Two artifacts on one screen lit by two different colours reads as a bug
    // rather than as a fault in the same signal — and a gradient is several
    // stops, so "contains the right token" is not the same claim as "uses only
    // the right token". Recolouring one stop and leaving the other passed the
    // first version of this while drawing a two-tone band.
    const tokens = [...bandRule.matchAll(/var\(--color-([a-z-]+)\)/g)].map(m => m[1])
    expect(tokens.length, 'no tokens found in the band gradient').toBeGreaterThan(0)
    expect([...new Set(tokens)]).toEqual([CRT_SCANLINE_ROLE])
  })
})

describe('the two cadences', () => {
  const wobbleRule = css.slice(css.indexOf('.crt-wobble {'), css.indexOf('.crt-wobble:hover'))
  // Bounded at both ends for the same reason: `.crt-grain` below carries a
  // `color-mix` too, and an open-ended slice let the band's assertions collect
  // the grain's percentage alongside its own.
  const bandRule = css.slice(css.indexOf('.crt-overlay::after'), css.indexOf('.crt-wobble {'))

  it('runs each at the period crt.js declares', () => {
    const scanlineRule = css.slice(css.indexOf('.crt-overlay::before'), css.indexOf('.crt-overlay::after'))
    expect(wobbleRule).toContain(`crt-wobble ${WOBBLE_PERIOD_S}s`)
    expect(bandRule).toContain(`crt-band-roll ${BAND_PERIOD_S}s`)
    // All three, not just the two that beat against each other: the raster's
    // own period was the one timing in the effect with no constant behind it.
    expect(scanlineRule).toContain(`crt-scanline-roll ${SCANLINE_PERIOD_S}s`)
  })

  it('does not let the two land on a common beat', () => {
    // Equal periods, or one a multiple of the other, would make the wobble and
    // the band arrive together every cycle and read as a single mechanism firing
    // twice. At 7 and 9 they realign once a minute.
    expect(WOBBLE_PERIOD_S).not.toBe(BAND_PERIOD_S)
    const [lo, hi] = [WOBBLE_PERIOD_S, BAND_PERIOD_S].sort((a, b) => a - b)
    expect(hi % lo, 'one period is a multiple of the other').not.toBe(0)
  })

  it('displaces the chart at most once per wobble cycle', () => {
    // Three flicks in seven seconds stopped reading as an occasional tracking
    // fault and started reading as a tic. Counted as *runs* of non-zero
    // keyframes rather than as non-zero keyframes, because one disturbance may
    // legitimately overshoot through two adjacent frames before settling.
    //
    // The `(?:px)?` is load-bearing and the first draft did not have it: a
    // resting keyframe is written `translate3d(0, 0, 0)` with a bare zero, so a
    // px-only pattern matched the displacements and none of the rests. With no
    // zeros in the array no run could ever begin, the count was 0 whatever the
    // stylesheet said, and restoring all three twitches left the suite green.
    const frames = [...css
      .slice(css.indexOf('@keyframes crt-wobble'), css.indexOf('@keyframes crt-band-roll'))
      .matchAll(/translate3d\((-?[\d.]+)(?:px)?, 0, 0\)/g)].map(m => Number(m[1]))
    expect(frames.length, 'no wobble keyframes found').toBeGreaterThan(0)
    expect(frames, 'no resting keyframes matched — the pattern is too strict').toContain(0)

    const runs = frames.filter((v, i) => v !== 0 && (i === 0 || frames[i - 1] === 0)).length
    expect(runs, `the wobble fires ${runs} times per cycle`).toBeLessThanOrEqual(MAX_WOBBLE_OFFSETS)
  })

  it('keeps the declared budget to one displacement per seven seconds', () => {
    // The bound above is only as good as its constant, and a test cannot defend
    // its own oracle: raising `MAX_WOBBLE_OFFSETS` would let three twitches back
    // in with everything still green. This pins the *rate* that was actually
    // asked for, so a higher count is legal only on a proportionally longer
    // cycle — which is the same request, not a louder one.
    expect(MAX_WOBBLE_OFFSETS / WOBBLE_PERIOD_S).toBeLessThanOrEqual(1 / 7)
  })

  // Bounded, both of them. There is a second band keyframe below this one now,
  // with the same parked shape and a travel of its own, so a slice running to
  // end-of-file lets the sparklines' keyframe answer for the chart's — the
  // assertion stays green with the chart's park or its travel deleted outright.
  const chartBandRoll = css.slice(
    css.indexOf('@keyframes crt-band-roll'),
    css.indexOf('.crt-overlay {'),
  )

  it('sweeps the band clear across the plot area', () => {
    // A `translateY` percentage resolves against the element, so the travel is
    // stated in band-heights — and it has to exceed the chart plus the band or
    // the pass stops short and never reaches the bottom. The chart's height is
    // read from the card rather than restated, since that is the number that
    // would move.
    const chartHeight = Number(chartCard.match(/ResponsiveContainer width="100%" height=\{(\d+)\}/)?.[1])
    expect(chartHeight, 'could not read the chart height from PriceChartCard').toBeGreaterThan(0)
    const travelPx = (BAND_TRAVEL_PCT / 100) * BAND_HEIGHT_PX
    expect(travelPx).toBeGreaterThanOrEqual(chartHeight + BAND_HEIGHT_PX)
    // Bounded to the chart's own keyframe. Unbounded this was `expect(css)`,
    // which the sparklines' band keyframe would have satisfied on the chart's
    // behalf the moment it declared a travel of its own.
    expect(chartBandRoll).toContain(`translate3d(0, ${BAND_TRAVEL_PCT}%, 0)`)
  })

  it('parks the band off screen at both ends of its cycle', () => {
    // Both endpoints outside the clipping frame is what makes the loop seamless
    // without a fade. A band that is still visible at 100% snaps back to the top
    // in full view once every cycle.
    expect(chartBandRoll).toMatch(/0%,\s*\d+%\s*\{ transform: translate3d\(0, 0, 0\); \}/)
  })
})

describe('the effect is composited rather than repainted', () => {
  // The whole performance claim, and the one that is invisible on a desktop:
  // animating `background-position` draws the identical picture at a real
  // per-frame cost, and looks perfectly correct in a screenshot and in review.
  const REPAINTING = /animation[^;]*;|@keyframes crt-[\s\S]*?\n\}/g

  it('animates nothing but transform', () => {
    const crt = css.slice(css.indexOf('@keyframes crt-scanline-roll'))
    for (const block of crt.match(REPAINTING) ?? []) {
      expect(block, 'a CRT animation moves a property the compositor cannot').not.toMatch(
        /background-position|background-size|top:|left:|filter:/,
      )
    }
    expect(crt).toContain('translate3d')
  })

  it('rolls by exactly one gradient period, so the loop is seamless at any height', () => {
    // The alternative — an over-tall element translated by 50% — is only
    // seamless when the container height happens to divide by the pitch, which
    // is true of today's 264px chart and is not a property anyone would notice
    // losing.
    const roll = css.slice(css.indexOf('@keyframes crt-scanline-roll'))
    const to = roll.match(/to\s*\{\s*transform: translate3d\(0, (\d+)px, 0\);/)?.[1]
    expect(Number(to)).toBe(SCANLINE_PITCH_PX)
  })

  it('gives the scanline layer one period of headroom in the direction it travels', () => {
    // Without it the roll exposes an unpainted strip at the top of the chart on
    // every cycle — which reads as a flicker, not as a missing rule.
    const inset = css.slice(css.indexOf('.crt-overlay::before')).match(/inset: (-?\d+)px 0 0 0;/)?.[1]
    expect(Number(inset)).toBe(-SCANLINE_PITCH_PX)
  })

  it('holds the wobble to whole pixels and does not interpolate between them', () => {
    // A fractional transform on a composited layer resamples the 11px axis
    // labels inside it. `steps(1, end)` is what keeps the keyframe values the
    // only positions the layer is ever drawn at.
    const wobble = css.slice(css.indexOf('@keyframes crt-wobble'), css.indexOf('.crt-overlay {'))
    for (const [, px] of wobble.matchAll(/translate3d\((-?[\d.]+)px, 0, 0\)/g)) {
      expect(Number.isInteger(Number(px)), `wobble offset ${px}px is fractional`).toBe(true)
    }
    expect(css.slice(css.indexOf('.crt-wobble {'))).toMatch(/animation: crt-wobble [\d.]+s steps\(1, end\) infinite/)
  })
})

describe('the overlay does not take anything away', () => {
  it('lets pointer events through to the chart underneath', () => {
    // It covers the entire plot area. Without this the hover tooltip is
    // unreachable — a decorative layer silently removing a feature, and one
    // nothing else in the suite would notice, since the chart still draws.
    const rule = css.slice(css.indexOf('.crt-overlay {'), css.indexOf('.crt-overlay::before'))
    expect(rule).toMatch(/pointer-events:\s*none/)
  })

  it('clips the travelling layer to the chart box', () => {
    const rule = css.slice(css.indexOf('.crt-overlay {'), css.indexOf('.crt-overlay::before'))
    expect(rule).toMatch(/overflow:\s*hidden/)
  })

  it('holds still while the chart is being pointed at', () => {
    expect(css).toMatch(/\.crt-wobble:hover\s*\{[^}]*animation-play-state:\s*paused/s)
  })
})

describe('the sparkline grain', () => {
  // Two rules now, and they are sliced to their own **braces** rather than to
  // the next selector, which is the difference between a check and a decoration.
  // Bounding the layer at `.circuit-ground {` looked correct and swept up the
  // documentation comment in between — and that comment explains the z-index and
  // the isolation *in prose*, so deleting `z-index: -1` from the rule left the
  // assertion matching the paragraph describing it. A mutation walked straight
  // through, which is `palette.test.js`'s hex-in-a-comment finding for the third
  // time in this repo's history.
  const body = (selector) => {
    const start = css.indexOf(selector)
    expect(start, `${selector} is missing from index.css`).toBeGreaterThan(-1)
    return css.slice(start, css.indexOf('\n}', start))
  }
  const grainFrame = body('.crt-grain {')
  const grainRule = body('.crt-picture::before')

  it('mixes to the alpha crt.js declares', () => {
    const pct = grainRule.match(/var\(--color-[a-z-]+\) (\d+)%, transparent\)/)?.[1]
    expect(pct, 'no color-mix found in the grain gradient').toBeDefined()
    expect(Number(pct)).toBe(GRAIN_ALPHA * 100)
  })

  it('uses the same raster and token as the chart, so they read as one screen', () => {
    expect(grainRule).toContain(`var(--color-${CRT_SCANLINE_ROLE})`)
    const stops = grainRule.match(/transparent 0 (\d+)px,[\s\S]*?transparent\) (\d+)px (\d+)px/)
    expect(stops, 'the grain gradient stops are not in the expected shape').not.toBeNull()
    const [, lit, lineStart, period] = stops.map(Number)
    expect(period).toBe(SCANLINE_PITCH_PX)
    expect(period - lineStart).toBe(SCANLINE_LINE_PX)
    expect(lit).toBe(SCANLINE_PITCH_PX - SCANLINE_LINE_PX)
  })

  it('drifts at the period crt.js declares, on the chart raster keyframes', () => {
    // The same keyframes as the chart rather than a second pair saying the same
    // thing: one raster, one travel of one period, two speeds.
    expect(grainRule).toContain(`animation: crt-scanline-roll ${GRAIN_DRIFT_PERIOD_S}s linear infinite`)
  })

  it('drifts far slower than the chart, which is the whole of the objection to it', () => {
    // The case against animating these was that a second and third rolling
    // raster competes with the one place motion means something — and that case
    // is correct at the chart's own pace. A raster drifts at an absolute speed
    // while a box is a fixed height, so the identical declaration crosses a
    // 264px chart in two minutes and a 40px sparkline in sixteen seconds.
    //
    // Pinned as a ratio rather than as a number, so the constraint survives
    // someone retuning the chart: whatever the chart does, these are a fraction
    // of it. Reverting this to `SCANLINE_PERIOD_S` — the tempting "make them
    // match" edit — is what this fails on.
    expect(GRAIN_DRIFT_PERIOD_S / SCANLINE_PERIOD_S).toBeGreaterThanOrEqual(3)
  })

  it('sits in front of the series, the way the chart overlay does', () => {
    // The whole of v1.18.0. Behind the series the raster and the line are two
    // planes, and once the raster drifts the near one is the one holding still.
    //
    // A positive index rather than merely being a later sibling:
    // `.recharts-wrapper` is `position: relative`, so a pseudo-element left at
    // `z-index: auto` paints in the same step and loses on document order.
    const z = Number(grainRule.match(/z-index:\s*(-?\d+)/)?.[1])
    expect(z, 'the grain declares no z-index').not.toBeNaN()
    expect(z).toBeGreaterThan(0)
  })

  it('does not isolate the box, because a positive index needs no help', () => {
    // Not tidiness — `isolation: isolate` was load-bearing for the *negative*
    // index (without it the layer escaped to the root and painted behind the
    // card's own opaque background) and does nothing whatever for a positive
    // one. Keeping it would be a declaration nothing on screen can distinguish,
    // which is the class of thing this repo deletes rather than banks.
    expect(grainFrame).not.toMatch(/isolation:/)
  })

  it('lets pointer events through, before there is anything to block', () => {
    // Nothing in either sparkline is interactive today, so this fixes nothing —
    // it is the chart's own finding applied forward. A layer over the whole box
    // is exactly how the next sparkline to get a `<Tooltip>` silently does not,
    // with the chart still drawing and every other assertion green.
    expect(grainRule).toMatch(/pointer-events:\s*none/)
  })

  it('clips the travelling layer to the sparkline box, with one period of headroom', () => {
    // The roll travels downward, so the layer starts one period high and the
    // frame clips it. Without the clip the raster paints over the caption below.
    expect(grainRule).toMatch(new RegExp(`inset: -${SCANLINE_PITCH_PX}px 0 0 0;`))
    expect(grainFrame).toMatch(/overflow:\s*hidden/)
  })

  it.each(THEMES)('keeps the %s series legible against its own ground', (theme) => {
    const P = PALETTE[theme]
    const scanned = hex => composite(hex, P[CRT_SCANLINE_ROLE], GRAIN_ALPHA)
    // **Four combinations, not two, now that the raster crosses the line as well
    // as the ground.** Either can be on a lit row or a scanned one and the pairs
    // do not have to agree, so the worst of the four governs.
    //
    // The measurement worth keeping is that this does not move: the minimum is
    // the series against the grained ground in both arrangements, so the number
    // that justified `GRAIN_ALPHA` survived the reasoning behind it being
    // rewritten. Held to the text threshold rather than 1.4.11's 3:1 — see
    // crt.js.
    const worst = Math.min(...[P.accent, scanned(P.accent)]
      .flatMap(line => [P.surface, scanned(P.surface)].map(bg => contrastRatio(line, bg))))
    expect(worst, `the ${theme} sparkline series against the grain`)
      .toBeGreaterThanOrEqual(GRAIN_MIN_SERIES_CONTRAST)
  })

  it.each(THEMES)('does not band the %s series itself, which is the dashing objection', (theme) => {
    // The claim that kept this raster behind the series for five versions, as a
    // number rather than as a prediction: a 1px line every 3px over a 1.5px
    // stroke was said to chop it into dashes. What that would look like is the
    // stroke's own lit-row-to-scanned-row ratio, and it has to stay under the
    // same figure the ground has to stay *over* — a raster you can see on the
    // screen and cannot see on the reading.
    const P = PALETTE[theme]
    const onLine = contrastRatio(P.accent, composite(P.accent, P[CRT_SCANLINE_ROLE], GRAIN_ALPHA))
    expect(onLine, `the ${theme} raster is visible on the series itself`)
      .toBeLessThan(GRAIN_MAX_SERIES_BANDING)
  })

  it('ties the two bounds to one figure rather than two that can drift', () => {
    // The pair is the argument for the placement: the same number is the floor
    // on the ground and the ceiling on the line. Split into two constants, one
    // could be raised to admit a stronger raster while the other went on
    // claiming the effect was invisible on the series.
    expect(GRAIN_MAX_SERIES_BANDING).toBe(MIN_BANDING_RATIO)
  })

  it.each(THEMES)('is visible at all in the %s theme', (theme) => {
    // The floor that exists because a raster invisible in one theme is exactly
    // what shipped once already.
    const P = PALETTE[theme]
    const grained = composite(P.surface, P[CRT_SCANLINE_ROLE], GRAIN_ALPHA)
    expect(contrastRatio(P.surface, grained)).toBeGreaterThan(MIN_BANDING_RATIO)
  })

  it('reaches every sparkline in the app, not just the two known ones', () => {
    // Scanned rather than listed: a third sparkline added later would otherwise
    // be the one plain box among three rastered ones, and nothing would say so.
    // `PriceChartCard` is excluded because it is the full chart, which wears the
    // animated overlay instead.
    // Counted one grain per rendered chart rather than guessed at from class
    // names: the first version matched any element carrying an `h-*` utility,
    // which swept up skeletons and fixed-height boxes that are not sparklines
    // at all and reported three offenders that were nothing of the kind.
    const offenders = []
    const seen = []
    for (const file of readdirSync(join(SRC, 'components'))) {
      if (!file.endsWith('.jsx') || file === 'PriceChartCard.jsx') continue
      const src = readFileSync(join(SRC, 'components', file), 'utf8')
      const charts = (src.match(/<ResponsiveContainer/g) ?? []).length
      if (!charts) continue
      // A **token** match, not a substring one. `\b` is no help here — `-` is a
      // non-word character, so `\bcrt-grain\b` matches inside `crt-grain-a`
      // and a modifier class named that way would count twice and fail a card
      // that is perfectly correct. The lookahead is the form that works, and it
      // is what makes `crt-grain-*` a legal name for anything added later.
      const grains = (src.match(/crt-grain(?![\w-])/g) ?? []).length
      const pictures = (src.match(/crt-picture(?![\w-])/g) ?? []).length
      const faults = FAULT_CLASSES.filter(c => src.includes(c))
      if (grains !== charts) offenders.push(`${file}: ${charts} sparkline(s), ${grains} grain(s)`)
      if (pictures !== charts) offenders.push(`${file}: ${charts} sparkline(s), ${pictures} picture(s)`)
      if (faults.length !== 1) offenders.push(`${file}: ${faults.length} fault class(es), expected 1`)
      for (const c of faults) seen.push(c)
    }
    expect(offenders, 'a sparkline is missing the grain').toEqual([])
    // The half the counting cannot see: two cards can each carry exactly one
    // fault class and carry the *same* one, which is the defect this whole
    // change exists to remove and which looks correct in either file alone.
    expect(seen.sort(), 'two sparklines share a cadence').toEqual([...FAULT_CLASSES].sort())
  })

  it('found the sparklines it was scanning for', () => {
    // The guard on the guard: the scan above passes trivially if its file filter
    // stops matching, which is how a sweep quietly becomes a no-op.
    const withGrain = readdirSync(join(SRC, 'components'))
      .filter(f => f.endsWith('.jsx'))
      .filter(f => readFileSync(join(SRC, 'components', f), 'utf8').includes('crt-grain'))
    expect(withGrain.sort()).toEqual(['BtcPriceCard.jsx', 'MarketSentimentCard.jsx'])
  })
})

describe('the sparkline faults', () => {
  // Sliced to their own braces, the grain block's convention and for its reason
  // — a documentation comment between two rules will satisfy an assertion about
  // the rule it describes if the slice runs to the next selector.
  const body = (selector) => {
    const start = css.indexOf(selector)
    expect(start, `${selector} is missing from index.css`).toBeGreaterThan(-1)
    return css.slice(start, css.indexOf('\n}', start))
  }
  const pictureRule = body('.crt-picture {')
  const bandRule = body('.crt-picture::after')
  const slipFrames = css.slice(
    css.indexOf('@keyframes crt-slip'),
    css.indexOf('@keyframes crt-spark-band-roll'),
  )
  const sparkBandRoll = css.slice(css.indexOf('@keyframes crt-spark-band-roll'))

  const scanned = (hex, theme) => composite(hex, PALETTE[theme][CRT_SCANLINE_ROLE], GRAIN_ALPHA)
  const banded = (hex, theme) => composite(hex, PALETTE[theme][CRT_SCANLINE_ROLE], SPARK_BAND_ALPHA)
  // The four alphas `ink` can arrive at: none, raster, band, both.
  const layers = theme => [
    hex => hex,
    hex => scanned(hex, theme),
    hex => banded(hex, theme),
    hex => composite(hex, PALETTE[theme][CRT_SCANLINE_ROLE], combinedAlpha(GRAIN_ALPHA, SPARK_BAND_ALPHA)),
  ]

  describe.each(SPARK_FAULTS)('$className', (fault) => {
    const frame = body(`.${fault.className} {`)

    it('runs at the cadence crt.js declares for it', () => {
      expect(frame).toContain(`--crt-slip-period: ${fault.slipPeriodS}s`)
      expect(frame).toContain(`--crt-band-period: ${fault.bandPeriodS}s`)
      expect(frame).toContain(`--crt-band-delay: ${fault.bandDelayS}s`)
    })

    it('is worn by exactly one card, and by the card crt.js names', () => {
      // The table says which component each cadence belongs to, and nothing
      // else in the suite would notice the two being swapped — both cards would
      // still carry one distinct class each and every timing assertion would
      // still pass.
      const file = `${fault.what.split(' ')[0]}.jsx`
      const src = readFileSync(join(SRC, 'components', file), 'utf8')
      expect(src, `${file} does not carry ${fault.className}`).toContain(fault.className)
    })

    it('declares the box height the band travel was derived against', () => {
      // Derived from the component rather than restated, the same way the
      // chart's bound reads its height out of `PriceChartCard`. Changing `h-10`
      // to `h-16` fails here rather than silently shortening the band's pass.
      const file = `${fault.what.split(' ')[0]}.jsx`
      const src = readFileSync(join(SRC, 'components', file), 'utf8')
      const n = Number(src.match(/crt-grain[^"]*\bh-(\d+)\b/)?.[1])
      expect(n, `no h-* class found on the grained box in ${file}`).toBeGreaterThan(0)
      expect(n * 4).toBe(fault.boxPx)
    })

    it('sweeps its band clear across its own box', () => {
      const travelPx = (SPARK_BAND_TRAVEL_PCT / 100) * SPARK_BAND_HEIGHT_PX
      expect(travelPx).toBeGreaterThanOrEqual(fault.boxPx + SPARK_BAND_HEIGHT_PX)
    })

    it('displaces its picture at most once per slip cycle', () => {
      // Its own pattern, because the chart's counter matches the *horizontal*
      // slot and this displacement is vertical. The `(?:px)?` is carried across
      // with it and is the load-bearing part: a resting keyframe is written
      // `translate3d(0, 0, 0)` with a bare zero, so a px-only pattern matches
      // every displacement and no rest — with no zeros in the array no run can
      // ever begin, the count is 0 whatever the stylesheet says, and restoring
      // three twitches leaves this green.
      const frames = [...slipFrames.matchAll(/translate3d\(0, (-?[\d.]+)(?:px)?, 0\)/g)].map(m => Number(m[1]))
      expect(frames.length, 'no slip keyframes found').toBeGreaterThan(0)
      expect(frames, 'no resting keyframes matched — the pattern is too strict').toContain(0)
      const runs = frames.filter((v, i) => v !== 0 && (i === 0 || frames[i - 1] === 0)).length
      expect(runs, `the slip fires ${runs} times per cycle`).toBeLessThanOrEqual(MAX_SLIP_OFFSETS)
    })

    it('keeps the fault rarer than the chart is allowed to be', () => {
      // The oracle-defence the chart's wobble already carries, applied across
      // the table: a test cannot defend its own budget, so what is pinned is the
      // *rate*. A higher count is legal only on a proportionally longer cycle,
      // and these boxes are permanently on screen where the chart is the one
      // element movement is supposed to mean something on.
      expect(MAX_SLIP_OFFSETS / fault.slipPeriodS)
        .toBeLessThanOrEqual(MAX_WOBBLE_OFFSETS / WOBBLE_PERIOD_S)
    })
  })

  it('lets no two faults land on a common beat', () => {
    // The whole requirement, and the reason `SPARK_FAULTS` is a table: this is
    // a property of the set, and six loose constants have nothing that compares
    // them. Both sparklines and the chart, all six periods.
    const periods = [
      WOBBLE_PERIOD_S, BAND_PERIOD_S,
      ...SPARK_FAULTS.flatMap(f => [f.slipPeriodS, f.bandPeriodS]),
    ]
    expect(new Set(periods).size, 'two cadences share a period').toBe(periods.length)
    for (const a of periods) {
      for (const b of periods) {
        if (a === b) continue
        const [hi, lo] = a > b ? [a, b] : [b, a]
        expect(hi % lo, `${hi}s is a multiple of ${lo}s`).not.toBe(0)
      }
    }
    // Not merely unequal — far enough apart that nothing realigns inside a
    // session anyone will sit through.
    const gcd = (a, b) => (b ? gcd(b, a % b) : a)
    const lcm = periods.reduce((m, p) => (m * p) / gcd(m, p))
    expect(lcm, 'the whole effect realigns too soon').toBeGreaterThan(3600)
  })

  it('starts the two bands out of phase rather than only drifting apart', () => {
    // Each band is parked for 60% of its cycle, so two started in the same frame
    // are identically parked for the first several seconds of *every* page load.
    // Different periods fix that eventually; a phase offset fixes it on the
    // first painted frame, which is the state a browser can be asked about.
    const delays = SPARK_FAULTS.map(f => f.bandDelayS)
    const offset = delays.filter(d => d !== 0)
    expect(offset.length, 'no fault is phase-offset from the others').toBe(delays.length - 1)
    // Negative, which seeks the animation forward. A positive delay does the
    // opposite of what is wanted here — it postpones the start and leaves both
    // bands parked for longer than either would have been.
    for (const d of offset) expect(d, 'the phase offset is not negative').toBeLessThan(0)
    // And it has to land the offset band mid-sweep while the other is parked,
    // which is what makes "they differ" observable at t=0 rather than lucky.
    for (const f of SPARK_FAULTS) {
      if (f.bandDelayS === 0) continue
      const phase = ((-f.bandDelayS % f.bandPeriodS) + f.bandPeriodS) % f.bandPeriodS / f.bandPeriodS
      expect(phase, `${f.className} opens parked, like the other one`).toBeGreaterThan(0.6)
    }
  })

  it('mixes the band to the alpha the contrast check was run against', () => {
    const pcts = [...bandRule.matchAll(/var\(--color-[a-z-]+\) ([\d.]+)%, transparent\)/g)].map(m => Number(m[1]))
    expect(pcts.length, 'no color-mix found in the band gradient').toBeGreaterThan(0)
    // Every stop at one value: recolouring one of two drew a two-tone band and
    // passed the first version of the chart's equivalent.
    expect([...new Set(pcts)]).toEqual([SPARK_BAND_ALPHA * 100])
  })

  it('draws the band in the same token as everything else on the screen', () => {
    const tokens = [...bandRule.matchAll(/var\(--color-([a-z-]+)\)/g)].map(m => m[1])
    expect(tokens.length).toBeGreaterThan(0)
    expect([...new Set(tokens)]).toEqual([CRT_SCANLINE_ROLE])
  })

  it('gives the band one physical height on both boxes, not one fraction of each', () => {
    // The argument for pixels over percentages: the two boxes are 40px and 80px,
    // and an artifact of one piece of hardware has one height — the same reason
    // the raster is 3px on both. A fraction of each would assert two screens.
    expect(bandRule).toContain(`height: ${SPARK_BAND_HEIGHT_PX}px`)
    expect(bandRule).toContain(`top: -${SPARK_BAND_HEIGHT_PX}px`)
    expect(sparkBandRoll).toContain(`translate3d(0, ${SPARK_BAND_TRAVEL_PCT}%, 0)`)
  })

  it('parks the band off screen at both ends of its cycle', () => {
    expect(sparkBandRoll).toMatch(/0%,\s*\d+%\s*\{ transform: translate3d\(0, 0, 0\); \}/)
  })

  it('takes every cadence from the fault class and never from a fallback', () => {
    // A `var()` fallback here turns "somebody dropped the fault class" into
    // "two sparklines quietly share a cadence", which is the defect this change
    // exists to remove and which looks perfectly correct in either file alone.
    // With no fallback the declaration is invalid at computed-value time and the
    // animation does not run at all, which is loud.
    expect(pictureRule).toContain('var(--crt-slip-period)')
    expect(bandRule).toContain('var(--crt-band-period)')
    expect(bandRule).toContain('var(--crt-band-delay)')
    for (const rule of [pictureRule, bandRule]) {
      expect(rule, 'a cadence carries a fallback').not.toMatch(/var\(--crt-[a-z-]+,/)
    }
  })

  it('holds the slip to whole pixels and does not interpolate between them', () => {
    for (const [, px] of slipFrames.matchAll(/translate3d\(0, (-?[\d.]+)px, 0\)/g)) {
      expect(Number.isInteger(Number(px)), `slip offset ${px}px is fractional`).toBe(true)
      expect(Math.abs(Number(px))).toBe(SLIP_OFFSET_PX)
    }
    expect(pictureRule).toMatch(/animation: crt-slip var\(--crt-slip-period\) steps\(1, end\) infinite/)
  })

  it('slips downward, into the headroom the raster already has', () => {
    // The raster carries one period of headroom at the top and none at the
    // bottom, because it drifts downward. An upward slip drags its bottom edge
    // into view for the duration of the displacement; a downward one is free.
    const offsets = [...slipFrames.matchAll(/translate3d\(0, (-?[\d.]+)px, 0\)/g)].map(m => Number(m[1]))
    expect(offsets.length).toBeGreaterThan(0)
    for (const px of offsets) expect(px, 'the slip displaces upward').toBeGreaterThan(0)
  })

  it.each(THEMES)('keeps the %s series legible with the band over it too', (theme) => {
    // The 4 x 4 cross product of the alphas either the stroke or the ground can
    // be under. Deliberately harsher than what can physically happen: both
    // artifacts vary only in y and the band is 13px tall, so a stroke pixel and
    // the ground beside it share the band's coverage everywhere but its feather
    // — the reachable worst case is the 4-cell diagonal, which measures 5.20
    // dark and 5.51 light. The conservative form is kept because it is the
    // convention already on record for the raster, and because a bound that is
    // only true of today's band height stops being true when it changes.
    const P = PALETTE[theme]
    const fs = layers(theme)
    const worst = Math.min(...fs.flatMap(l => fs.map(g => contrastRatio(l(P.accent), g(P.surface)))))
    expect(worst, `the ${theme} sparkline series under raster and band`)
      .toBeGreaterThanOrEqual(GRAIN_MIN_SERIES_CONTRAST)
  })

  it.each(THEMES)('does not flatten the %s ground where the band passes', (theme) => {
    // An exemption was expected here and measured not to be needed, which is
    // worth an assertion rather than a carve-out: the band lifts the ground
    // toward `ink`, so the obvious worry is that it washes the raster out where
    // it passes. It does not — 1.45 in dark and 1.26 in light — and a future
    // alpha that does fails the build instead of being quietly legal.
    const P = PALETTE[theme]
    const lit = banded(P.surface, theme)
    const dark = composite(P.surface, P[CRT_SCANLINE_ROLE], combinedAlpha(GRAIN_ALPHA, SPARK_BAND_ALPHA))
    expect(contrastRatio(lit, dark), `the ${theme} ground under the band`)
      .toBeGreaterThan(MIN_BANDING_RATIO)
  })

  it.each(THEMES)('does not band the %s series where the band passes either', (theme) => {
    const P = PALETTE[theme]
    const lit = banded(P.accent, theme)
    const dark = composite(P.accent, P[CRT_SCANLINE_ROLE], combinedAlpha(GRAIN_ALPHA, SPARK_BAND_ALPHA))
    expect(contrastRatio(lit, dark), `the ${theme} raster on the series under the band`)
      .toBeLessThan(GRAIN_MAX_SERIES_BANDING)
  })

  it.each(THEMES)('draws a band you can actually see in the %s theme', (theme) => {
    // The floor `BAND_ALPHA` never had. Without it the band could be dropped to
    // half a percent and every other assertion in this file would stay green,
    // which is `MIN_BANDING_RATIO`'s founding lesson unlearned one constant
    // over. Applied to the chart's band as well as the sparklines'.
    const P = PALETTE[theme]
    const rest = [P.surface, scanned(P.surface, theme)]
    const sparkVis = Math.min(
      contrastRatio(banded(P.surface, theme), P.surface),
      contrastRatio(composite(P.surface, P[CRT_SCANLINE_ROLE], combinedAlpha(GRAIN_ALPHA, SPARK_BAND_ALPHA)), rest[1]),
    )
    expect(sparkVis, `the ${theme} sparkline band`).toBeGreaterThan(MIN_BAND_VISIBILITY)

    const chartVis = Math.min(
      contrastRatio(composite(P.surface, P[CRT_SCANLINE_ROLE], BAND_ALPHA), P.surface),
      contrastRatio(
        composite(P.surface, P[CRT_SCANLINE_ROLE], combinedAlpha(SCANLINE_ALPHA, BAND_ALPHA)),
        composite(P.surface, P[CRT_SCANLINE_ROLE], SCANLINE_ALPHA),
      ),
    )
    expect(chartVis, `the ${theme} chart band`).toBeGreaterThan(MIN_BAND_VISIBILITY)
  })

  it('lets the band through to the series and the caption below it', () => {
    expect(bandRule).toMatch(/pointer-events:\s*none/)
    const z = Number(bandRule.match(/z-index:\s*(\d+)/)?.[1])
    expect(z, 'the band declares no z-index').not.toBeNaN()
    // Over the raster, the way the chart stacks its two layers.
    expect(z).toBeGreaterThan(Number(body('.crt-picture::before').match(/z-index:\s*(\d+)/)?.[1]))
  })
})

describe('the chart draws in the roles crt.js says it does', () => {
  // The contrast check is only as good as its list. A card gaining an element in
  // a role nobody added here is an element this effect dims with nothing
  // watching — so the list is compared against the call site rather than
  // maintained beside it.
  it('accounts for every palette role PriceChartCard renders with', () => {
    // Bracket access as well as dot access: a hyphenated token — `ink-dim`,
    // `line-soft`, `accent-fill` — cannot be written `colors.x` and has to be
    // `colors['x']`, so a dot-only pattern skipped exactly the roles most likely
    // to be added later. That is the rot this guard exists to prevent, walking
    // straight past it.
    const used = [
      ...[...chartCard.matchAll(/\bcolors\.([a-zA-Z]+)/g)].map(m => m[1]),
      ...[...chartCard.matchAll(/\bcolors\[['"]([a-z-]+)['"]\]/g)].map(m => m[1]),
    ]
    expect(used.length, 'no colours found — has the card stopped reading the palette?')
      .toBeGreaterThan(0)
    expect([...new Set(used)].sort())
      .toEqual([...CRT_INK_ROLES, ...CRT_DECORATIVE_ROLES].sort())
  })

  it('names its one exemption rather than leaving it out', () => {
    // An exemption nobody re-checks is how a list rots. `line` is a decorative
    // gridline: not text, not a UI component, and already far under 3:1 by
    // design — so there is no threshold for the overlay to push it below.
    for (const theme of THEMES) {
      const P = PALETTE[theme]
      expect(contrastRatio(P.line, P.surface), `${theme} gridline`).toBeLessThan(3)
    }
    expect(CRT_INK_ROLES).not.toContain('line')
  })
})

// ── The export surfaces ──────────────────────────────────────────────────────
//
// The share image, the live preview card and its static fallback carry the same
// raster as the chart. Two things make that a testable claim rather than a
// styling note, and both are failures that look like success:
//
//   1. **Neither rasteriser draws the form `index.css` uses.** Measured against
//      html2canvas 1.4.1 and Satori, with controls: html2canvas draws a
//      repeating gradient as *nothing*, and Satori draws the shorthand as a
//      smooth two-pixel ramp rather than a three-pixel hard raster. So the
//      export surfaces use an SVG tile, and what has to be pinned is that they
//      do not quietly revert to a gradient.
//   2. **The raster sits behind text here, where the chart's overlay sits over
//      it.** That is a different composite and a harsher one — the ground moves
//      and the glyph does not — so the chart's own ceiling does not carry over
//      and these ratios have to be computed separately.
describe('the raster on the export surfaces', () => {
  const shareCanvas = readFileSync(join(SRC, 'components/ShareCanvas.jsx'), 'utf8')
  const ogView = readFileSync(resolve('api/lib/ogView.js'), 'utf8')
  const staticOg = readFileSync(resolve('scripts/generate-og-image.mjs'), 'utf8')
  const SURFACES = [
    ['ShareCanvas', shareCanvas], ['ogView', ogView], ['generate-og-image', staticOg],
  ]

  it('draws one tile of the same raster the stylesheet does', () => {
    const svg = grainTileSvg('#ffffff', 0.5)
    // Same period, same line thickness, and the line at the *end* of the period
    // — the stylesheet runs `transparent 0 2px, ink 2px 3px`, so a tile that
    // led with its lit row would be one pixel out of phase with the app.
    expect(svg).toContain(`height="${SCANLINE_PITCH_PX}"`)
    expect(svg).toContain(`y="${SCANLINE_PITCH_PX - SCANLINE_LINE_PX}"`)
    expect(svg).toContain(`height="${SCANLINE_LINE_PX}" fill=`)
  })

  it('carries the alpha as fill-opacity rather than baking it into the fill', () => {
    // If a rasteriser declines an `rgba()` presentation attribute it falls back
    // to opaque, which is a solid bar every three pixels across a posted image.
    // `fill-opacity` is SVG 1.1 and degrades to nothing rather than to full.
    const svg = grainTileSvg('#abcdef', 0.08)
    expect(svg).toContain('fill="rgb(171,205,239)"')
    expect(svg).toContain('fill-opacity="0.08"')
    expect(svg).not.toMatch(/rgba\(/)
  })

  it('encodes to a URI with no raw quotes, which would end the CSS value early', () => {
    // `generate-og-image.mjs` interpolates this straight into a stylesheet.
    const uri = grainTileUri('#ffffff', EXPORT_GRAIN_ALPHA)
    expect(uri.startsWith('url("data:image/svg+xml,')).toBe(true)
    expect(uri.slice('url("'.length, -2)).not.toMatch(/["']/)
  })

  it.each(SURFACES)('%s does not use the form the rasterisers mis-draw', (_name, body) => {
    // The whole reason the builder exists. A gradient copied out of `index.css`
    // renders correctly in a browser and wrongly — or not at all — here.
    expect(body).not.toMatch(/repeating-linear-gradient/)
  })

  // The first draft of the three assertions below scanned each file for
  // `grainBackground|grainTileUri` — which matches the **import line**, so
  // deleting the actual call left every one of them green. Four mutations
  // walked through it. They assert the rendered style now, which also covers
  // the `background:` shorthand silently resetting `background-image`: with the
  // shorthand in play `backgroundImage` comes back empty rather than wrong.
  // ShareCanvas needs JSX to render, so its half lives in `ShareCanvas.test.jsx`.
  it('ogView paints the raster on the card Satori rasterises', () => {
    expect(ogElement({}).props.style.backgroundImage).toContain('data:image/svg+xml')
  })

  it('the static fallback paints it too, from the same builder', () => {
    expect(staticOg).toMatch(/background-image:\s*\$\{grainTileUri\(/)
  })

  it('covers every role ogView actually draws on the grained ground', () => {
    // The `CRT_INK_ROLES` contract, in a second place: a role added to the card
    // without being added to the layer is a role this raster dims with nothing
    // checking it. Derived from the source rather than restated — dropping five
    // of the six from the layer left the AA check passing on the one that was
    // left, which is a suite grading its own homework.
    const alias = Object.fromEntries(
      [...ogView.matchAll(/^const (\w+)\s*=\s*C\.([\w-]+)$/gm)].map(m => [m[1], m[2]])
    )
    // **Every identifier in the whole value, not a shape the value is assumed
    // to take.** The first version matched `color: X` and `color: ident ? A :
    // B` and nothing else — which silently missed `RED`, because the 24h line
    // is coloured `priceChange24h >= 0 ? GREEN : RED` and a comparison sits
    // between the identifier and the `?`. So `down` was never derived, and
    // dropping it from the layer left all 65 tests green while the negative
    // change line went on being drawn straight onto the grained ground. A
    // derivation that only understands two syntaxes is a restatement wearing a
    // derivation's clothes.
    const drawn = [...new Set(
      [...ogView.matchAll(/(?<![A-Za-z])color:\s*([^,\n}]+)/g)]
        .flatMap(m => m[1].match(/[A-Za-z_$][\w$]*/g) ?? [])
        .filter(name => alias[name])
        .map(name => alias[name])
    )]
    expect(drawn.length, 'no roles found — has the card stopped reading the palette?')
      .toBeGreaterThan(2)
    expect(drawn, 'the negative-change colour is chosen behind a comparison — see above')
      .toContain('down')
    const layer = EXPORT_GRAIN_LAYERS.find(l => l.what === 'ogView')
    expect([...drawn].sort()).toEqual(
      drawn.filter(r => layer.roles.includes(r)).sort()
    )
  })

  describe.each(EXPORT_GRAIN_LAYERS)('$what', ({ surface, themes, roles }) => {
    it.each(themes)('keeps every role it draws above AA through the raster, %s', (theme) => {
      const P = PALETTE[theme]
      const lit = composite(P[surface], P[CRT_SCANLINE_ROLE], EXPORT_GRAIN_ALPHA)
      for (const role of roles) {
        // Worst case: the glyph against the lit row, not against an average of
        // the two. A scanline covers a third of the box but covers those pixels
        // fully, and a glyph stem is one pixel wide.
        const worst = Math.min(contrastRatio(P[role], P[surface]), contrastRatio(P[role], lit))
        expect(worst, `${theme} ${role} on grained ${surface}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
      }
    })

    it.each(themes)('still bands visibly, so the raster is not decoration that does not render, %s', (theme) => {
      // v1.13.0's lesson: "is it a palette token" and "does the text still
      // clear AA" are both true of an effect nobody can see.
      const P = PALETTE[theme]
      const lit = composite(P[surface], P[CRT_SCANLINE_ROLE], EXPORT_GRAIN_ALPHA)
      expect(contrastRatio(P[surface], lit), `${theme} banding`).toBeGreaterThanOrEqual(MIN_BANDING_RATIO)
    })
  })

  it('is the chart raster rather than the sparklines, which would fail the above', () => {
    // Recorded as an assertion because the reasoning that picked it was wrong
    // first time: `GRAIN_ALPHA` is legal on a sparkline precisely because
    // nothing sits over it, and illegal here for the same reason inverted.
    expect(EXPORT_GRAIN_ALPHA).toBe(SCANLINE_ALPHA)
    const { surface, roles } = EXPORT_GRAIN_LAYERS[0]
    const P = PALETTE.light
    const tooStrong = composite(P[surface], P[CRT_SCANLINE_ROLE], GRAIN_ALPHA)
    const worst = Math.min(...roles.map(r => contrastRatio(P[r], tooStrong)))
    expect(worst).toBeLessThan(AA_NORMAL_TEXT)
  })
})
