// The circuit-trace ground, held to the four claims it makes: that it does not
// animate, that it does not push any text on the page below WCAG AA, that it is
// visible at all, and that it tiles without seams.
//
// The contrast half is here for the reason `crt.test.js` exists rather than a
// few lines in `palette.test.js`: that suite computes its ratios from the tokens
// themselves, so a translucent layer laid *under* the text is structurally
// invisible to it — every role can clear 4.5:1 on `ground` on paper while the
// header copy is failing on screen. And unlike the chart's overlay, this one
// moves the ground while leaving the glyph where it is, which is the harsher of
// the two composites.
//
// The stylesheet is parsed rather than trusted, on the palette, typography and
// CRT precedent: `circuitry.js` is the file a person reads and `index.css` is
// the file the browser reads.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PALETTE, THEMES } from '../lib/palette.js'
import {
  CIRCUIT_ALPHA, CIRCUIT_TILE_PX, CIRCUIT_TILE_SVG, CIRCUIT_MIN_BANDING_RATIO,
  circuitTileUri,
} from '../lib/circuitry.js'
import { MIN_BANDING_RATIO } from '../lib/crt.js'

const SRC = resolve('src')
const css = readFileSync(join(SRC, 'index.css'), 'utf8')
const app = readFileSync(join(SRC, 'App.jsx'), 'utf8')

const AA_NORMAL_TEXT = 4.5

/**
 * One rule's declarations, sliced to its own braces.
 *
 * To the braces rather than to the next selector, because the blocks here are
 * separated by documentation comments that quote the declarations in prose — and
 * a slice that includes one lets an assertion pass by matching the paragraph
 * that explains the thing instead of the thing. `crt.test.js` shipped exactly
 * that and a mutation walked through it.
 */
function ruleBody(selector) {
  const start = css.indexOf(selector)
  expect(start, `${selector} is missing from index.css`).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf('\n}', start))
}

// **The same list `palette.test.js` holds to 4.5:1 on `ground`, restated here
// rather than narrowed to what happens to render on the ground today.** A
// hand-derived list would be defensible — `EXPORT_GRAIN_LAYERS` is exactly that,
// and for a good reason — but the ground is the one surface where a future
// element lands without anybody thinking about this layer, so the contract that
// does not rot is the one that covers every role that is *allowed* there.
const ON_GROUND = ['ink', 'ink-dim', 'muted', 'quiet', 'accent', 'up', 'down', 'warn', 'support']

const chan = v => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const rgb = hex => [0, 2, 4].map(i => parseInt(hex.replace('#', '').slice(i, i + 2), 16))
const luminance = hex => { const [r, g, b] = rgb(hex); return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b) }

function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function composite(base, top, a) {
  const [tr, tg, tb] = rgb(top)
  return '#' + rgb(base)
    .map((c, i) => Math.round(c * (1 - a) + [tr, tg, tb][i] * a).toString(16).padStart(2, '0'))
    .join('')
}

/** The ground with the traces laid over it, at their full strength. */
const traced = theme => composite(PALETTE[theme].ground, PALETTE[theme].ink, CIRCUIT_ALPHA)

describe.each(THEMES)('%s theme, read over the traces', (theme) => {
  it.each(ON_GROUND)('%s still clears AA where a trace runs under it', (role) => {
    // Worst case rather than an average: a trace is 2px wide and covers those
    // pixels fully, and a glyph stem is one pixel wide. Both the traced ground
    // and the bare ground have to clear it, since a glyph spans both.
    const worst = Math.min(
      contrastRatio(PALETTE[theme][role], traced(theme)),
      contrastRatio(PALETTE[theme][role], PALETTE[theme].ground),
    )
    expect(worst, `${theme} ${role} over a trace`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it('keeps headroom, so the next palette nudge cannot silently cross the line', () => {
    // The same argument `palette.test.js` makes for its tightest tier. Measured,
    // the binding constraint is `support` in the light theme at 4.62:1 — the
    // smallest headroom anywhere in the app, and the reason `CIRCUIT_ALPHA`
    // carries a table rather than a number.
    const worst = Math.min(...ON_GROUND.map(r => contrastRatio(PALETTE[theme][r], traced(theme))))
    expect(worst).toBeGreaterThan(4.6)
  })

  it('draws traces you can actually see in this theme', () => {
    // v1.13.0's lesson, and the one this file would otherwise be blind to: "the
    // colour is a palette token" and "the text still clears AA" are both true of
    // a layer that renders as nothing at all. Without a floor the suite could
    // only ever catch the pattern being too strong.
    expect(contrastRatio(PALETTE[theme].ground, traced(theme)))
      .toBeGreaterThan(CIRCUIT_MIN_BANDING_RATIO)
  })
})

describe('one alpha serving both themes', () => {
  it('draws them within sight of each other', () => {
    // The `scrim` failure of v1.13.0 restated: one declaration reading as a
    // texture in one theme and as nothing in the other is invisible to every
    // per-theme check above, because each passes on its own.
    const [lo, hi] = THEMES.map(t => contrastRatio(PALETTE[t].ground, traced(t))).sort((a, b) => a - b)
    expect((hi - 1) / (lo - 1), 'one theme draws far harder than the other').toBeLessThan(2)
  })

  it('sits below the raster floor rather than borrowing it', () => {
    // These are two different drawings and the difference is deliberate — see
    // `CIRCUIT_MIN_BANDING_RATIO`. Asserted so that "the floors differ" stays a
    // decision somebody made rather than two numbers that drifted apart.
    expect(CIRCUIT_MIN_BANDING_RATIO).toBeLessThan(MIN_BANDING_RATIO)
  })
})

describe('the stylesheet mirrors circuitry.js', () => {
  const rule = ruleBody('.circuit-ground::before')

  it('draws the tile circuitry.js declares, byte for byte', () => {
    // The whole point of the artwork being a readable string in both files. A
    // stylesheet quietly carrying a *different* drawing renders perfectly and is
    // simply not the thing the module documents.
    expect(rule).toContain(circuitTileUri())
  })

  it('repeats it at the size circuitry.js declares', () => {
    expect(rule).toContain(`mask-size: ${CIRCUIT_TILE_PX}px ${CIRCUIT_TILE_PX}px`)
    expect(rule).toMatch(/mask-repeat:\s*repeat/)
  })

  it('mixes the traces to the alpha the contrast checks were run against', () => {
    // If these separate, every ratio proved above is a ratio of a colour that is
    // not on screen.
    const pct = rule.match(/color-mix\(in srgb, var\(--color-[a-z-]+\) ([\d.]+)%, transparent\)/)?.[1]
    expect(pct, 'no color-mix found on the circuit layer').toBeDefined()
    expect(Number(pct)).toBe(CIRCUIT_ALPHA * 100)
  })

  it('draws them in ink, the one token that opposes the ground in both themes', () => {
    expect(rule).toContain('var(--color-ink)')
  })

  it('masks a themed layer rather than tinting the tile itself', () => {
    // A data-URI SVG cannot read a custom property, so a *coloured* tile is one
    // asset per theme with two literal hexes standing in for a token — which is
    // the two-different-oranges bug with extra steps. The mask is what lets one
    // piece of artwork follow the toggle.
    expect(rule).toMatch(/mask-image:/)
    expect(rule).not.toMatch(/background-image:/)
  })
})

describe('the ground does not move', () => {
  // The single most important line in the whole change, and the one a later
  // "make it breathe" would quietly cross. The chart has two moving artifacts,
  // the sparklines a third, the ticker scrolls and the block dot breathes — and
  // unlike every one of those, this layer sits behind the entire page.
  it.each(['.circuit-ground {', '.circuit-ground::before'])(
    '%s carries no animation, no transition and nothing promoted', (selector) => {
      expect(ruleBody(selector)).not.toMatch(/animation|transition|will-change/)
    })

  it('names no keyframes of its own anywhere in the stylesheet', () => {
    // Belt and braces on the above: a rule elsewhere could animate this class
    // without the declaration appearing in its own block.
    expect(css).not.toMatch(/@keyframes circuit-/)
  })
})

describe('the tile', () => {
  /**
   * The subset of path syntax the drawing uses, walked into absolute points.
   * Written out rather than pulled in, because the alternative to nine lines of
   * parser is asserting the `d` strings as literals — which is a copy of the
   * artwork, not a check on it.
   */
  function points(d) {
    const out = []
    let x = 0, y = 0
    for (const [, cmd, args] of d.matchAll(/([MmLlHhVv])\s*(-?[\d.]+(?:[\s,-][\d.\s,-]*)?)/g)) {
      const n = (args.match(/-?[\d.]+/g) ?? []).map(Number)
      if (cmd === 'M') { [x, y] = n; out.push([x, y]) }
      else if (cmd === 'm') { x += n[0]; y += n[1]; out.push([x, y]) }
      else if (cmd === 'L') { [x, y] = n; out.push([x, y]) }
      else if (cmd === 'l') { x += n[0]; y += n[1]; out.push([x, y]) }
      else if (cmd === 'H') { x = n[0]; out.push([x, y]) }
      else if (cmd === 'h') { x += n[0]; out.push([x, y]) }
      else if (cmd === 'V') { y = n[0]; out.push([x, y]) }
      else if (cmd === 'v') { y += n[0]; out.push([x, y]) }
    }
    return out
  }

  const paths = [...CIRCUIT_TILE_SVG.matchAll(/<path d='([^']+)'/g)].map(m => points(m[1]))
  const pads = [...CIRCUIT_TILE_SVG.matchAll(/<circle cx='([\d.]+)' cy='([\d.]+)'/g)]
    .map(m => [Number(m[1]), Number(m[2])])

  it('parses into runs at all', () => {
    // The guard on the guard. A parser that silently returns nothing makes every
    // assertion below pass by having no cases — which is how a structural check
    // becomes decoration.
    expect(paths.length).toBeGreaterThan(2)
    for (const p of paths) expect(p.length).toBeGreaterThan(1)
    expect(pads.length).toBeGreaterThan(2)
  })

  it('stays inside its own box', () => {
    for (const p of paths) {
      for (const [x, y] of p) {
        expect(x, `x=${x} is outside the tile`).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(CIRCUIT_TILE_PX)
        expect(y, `y=${y} is outside the tile`).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(CIRCUIT_TILE_PX)
      }
    }
  })

  it('carries a run across each axis, entering and leaving at the same coordinate', () => {
    // What stops the pattern looking tiled. A run that reaches one edge and not
    // the matching point on the other dies at an invisible seam, and a grid of
    // seams is the thing the eye finds first.
    const spans = axis => paths.filter((p) => {
      const v = p.map(pt => pt[axis])
      return Math.min(...v) === 0 && Math.max(...v) === CIRCUIT_TILE_PX
    })
    for (const axis of [0, 1]) {
      const crossing = spans(axis)
      expect(crossing.length, `no run crosses axis ${axis}`).toBeGreaterThan(0)
      for (const p of crossing) {
        const other = 1 - axis
        const entry = p.find(pt => pt[axis] === 0)[other]
        const exit = p.find(pt => pt[axis] === CIRCUIT_TILE_PX)[other]
        expect(exit, `a run enters at ${entry} and leaves at ${exit}`).toBe(entry)
      }
    }
  })

  it('ends every run that is not a crossing on a pad', () => {
    // A free end reads as a trace that has been cut off. A pad reads as one that
    // has arrived somewhere — which is the difference between the pattern
    // looking like a board and looking like scratches.
    const onEdge = ([x, y]) =>
      x === 0 || y === 0 || x === CIRCUIT_TILE_PX || y === CIRCUIT_TILE_PX
    const onPad = ([x, y]) => pads.some(([px, py]) => px === x && py === y)
    const loose = []
    for (const p of paths) {
      for (const end of [p[0], p[p.length - 1]]) {
        if (!onEdge(end) && !onPad(end)) loose.push(end.join(','))
      }
    }
    expect(loose, 'these run ends are neither a tile edge nor a pad').toEqual([])
  })

  it('contains no character that would end the CSS value early', () => {
    // It is embedded unencoded inside a double-quoted `url()`, which is what
    // keeps the artwork readable in the stylesheet. A `#` would truncate the
    // data URI at the fragment and a double quote would close the value — both
    // producing a mask that silently fails to load, which is a layer that is
    // present, correctly sized and completely invisible.
    expect(CIRCUIT_TILE_SVG).not.toMatch(/["#]/)
    expect(CIRCUIT_TILE_SVG).toContain(`width='${CIRCUIT_TILE_PX}'`)
    expect(CIRCUIT_TILE_SVG).toContain(`height='${CIRCUIT_TILE_PX}'`)
  })
})

describe('where it is and is not drawn', () => {
  it('is on the page frame, which is the only element that owns the ground', () => {
    expect(app).toMatch(/className="circuit-ground[^"]*bg-ground/)
  })

  it('carries its own positioning, so a call site cannot forget half of it', () => {
    // `z-index: -1` without a stacking context on the host escapes to the root
    // and paints behind the page's own background — invisible, with nothing to
    // say so. Keeping both in the class is what makes that unforgettable.
    const frame = ruleBody('.circuit-ground {')
    expect(frame).toMatch(/position:\s*relative/)
    expect(frame).toMatch(/isolation:\s*isolate/)
    expect(ruleBody('.circuit-ground::before')).toMatch(/z-index:\s*-1/)
  })

  it('lets pointer events through to the page underneath', () => {
    expect(ruleBody('.circuit-ground::before')).toMatch(/pointer-events:\s*none/)
  })

  it('reaches no export surface, which is a named exception rather than an oversight', () => {
    // v1.16.0's rule is that the retro treatment reaches the three export
    // surfaces, and this one cannot: it is drawn with `mask-image`, Satori does
    // not implement masking, and html2canvas's support for it is unmeasured.
    // Asserted so the exception stays a decision — if masking is ever supplied
    // to those surfaces, this is the test that has to be argued with.
    for (const file of [
      join(SRC, 'components/ShareCanvas.jsx'),
      resolve('api/lib/ogView.js'),
      resolve('scripts/generate-og-image.mjs'),
    ]) {
      expect(readFileSync(file, 'utf8'), `${file} draws the circuit ground`)
        .not.toMatch(/circuit|mask-image|maskImage/i)
    }
  })
})
