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
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PALETTE, THEMES } from '../lib/palette.js'
import {
  SCANLINE_ALPHA, SCANLINE_PITCH_PX, SCANLINE_LINE_PX, MIN_BANDING_RATIO,
  CRT_INK_ROLES, CRT_DECORATIVE_ROLES, CRT_SURFACE_ROLE, CRT_SCANLINE_ROLE,
} from '../lib/crt.js'

const SRC = resolve('src')
const css = readFileSync(join(SRC, 'index.css'), 'utf8')
const chartCard = readFileSync(join(SRC, 'components/PriceChartCard.jsx'), 'utf8')

const AA_NORMAL_TEXT = 4.5

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

describe.each(THEMES)('%s theme, read through the scanlines', (theme) => {
  const at = name => PALETTE[theme][name]
  // Worst case rather than average: a scanline covers a third of the box, but
  // the pixels it does cover are covered fully, and a glyph stem is one pixel
  // wide. Averaging the coverage would model a reader who never looks at the
  // dark rows.
  const dim = hex => composite(hex, at(CRT_SCANLINE_ROLE), SCANLINE_ALPHA)
  const ground = dim(at(CRT_SURFACE_ROLE))

  it.each(CRT_INK_ROLES)('%s still clears AA under the darkest scanline', (role) => {
    expect(contrastRatio(dim(at(role)), ground), `${role} under the overlay`)
      .toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it('keeps headroom, so a nudge to the opacity cannot silently cross the line', () => {
    // The same argument `palette.test.js` makes for the quiet tier: landing on
    // exactly 4.5 makes the next tweak a coin toss. Measured, the binding
    // constraint is `quiet` in dark mode — 4.71:1 at this alpha, 4.30:1 at 0.15.
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
  const scanlineRule = css.slice(css.indexOf('.crt-scanlines::before'))

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
    const inset = css.slice(css.indexOf('.crt-scanlines::before')).match(/inset: (-?\d+)px 0 0 0;/)?.[1]
    expect(Number(inset)).toBe(-SCANLINE_PITCH_PX)
  })

  it('holds the wobble to whole pixels and does not interpolate between them', () => {
    // A fractional transform on a composited layer resamples the 11px axis
    // labels inside it. `steps(1, end)` is what keeps the keyframe values the
    // only positions the layer is ever drawn at.
    const wobble = css.slice(css.indexOf('@keyframes crt-wobble'), css.indexOf('.crt-scanlines {'))
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
    const rule = css.slice(css.indexOf('.crt-scanlines {'), css.indexOf('.crt-scanlines::before'))
    expect(rule).toMatch(/pointer-events:\s*none/)
  })

  it('clips the travelling layer to the chart box', () => {
    const rule = css.slice(css.indexOf('.crt-scanlines {'), css.indexOf('.crt-scanlines::before'))
    expect(rule).toMatch(/overflow:\s*hidden/)
  })

  it('holds still while the chart is being pointed at', () => {
    expect(css).toMatch(/\.crt-wobble:hover\s*\{[^}]*animation-play-state:\s*paused/s)
  })
})

describe('the chart draws in the roles crt.js says it does', () => {
  // The contrast check is only as good as its list. A card gaining an element in
  // a role nobody added here is an element this effect dims with nothing
  // watching — so the list is compared against the call site rather than
  // maintained beside it.
  it('accounts for every palette role PriceChartCard renders with', () => {
    const used = [...chartCard.matchAll(/\bcolors\.([a-zA-Z]+)/g)].map(m => m[1])
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
