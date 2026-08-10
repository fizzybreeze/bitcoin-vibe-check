import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { FONT_STACKS, FONT_ROLES, SATORI_FONT_FAMILY, TABULAR } from '../lib/typography.js'

// The type decision, held to the four claims it makes.
//
// 1. The stylesheet and `typography.js` say the same thing. They have to be two
//    files for the same reason the palette does — Tailwind reads only CSS, and
//    `ShareCanvas` and `ShareModal` read only JS — so the only thing between
//    them and a silent divergence is an assertion across the pair. This is not
//    hypothetical: the two surfaces this replaces had *already* diverged from
//    the app and from each other's intent.
// 2. Nothing outside that module writes a font stack of its own.
// 3. Every figure that changes without a page reload has tabular figures. That
//    is the part a reader sees: proportional digits are different widths, so a
//    price ticking 100,111 → 100,888 reflows its row on every tick.
// 4. The one surface that deliberately cannot follow is still the one recorded.
//
// Paths are resolved from the repo root: vitest runs there, and
// `import.meta.url` is not a file: URL under the jsdom environment.
const SRC = resolve('src')
const INDEX_CSS = join(SRC, 'index.css')
const COMPONENTS = join(SRC, 'components')

/** Collapse whitespace so a wrapped CSS declaration compares to a JS string. */
const normalise = (s) => s.replace(/\s+/g, ' ').replace(/"/g, "'").trim()

describe('the stylesheet and the module agree', () => {
  const css = readFileSync(INDEX_CSS, 'utf8')

  it.each(FONT_ROLES)('--font-%s', (role) => {
    const declared = css.match(new RegExp(`--font-${role}:([^;]+);`))
    expect(declared, `--font-${role} is not declared in index.css`).not.toBeNull()
    expect(normalise(declared[1])).toBe(normalise(FONT_STACKS[role]))
  })

  it('declares them inside @theme, where Tailwind will read them', () => {
    // Outside `@theme` they are ordinary custom properties: `font-sans` would
    // generate no utility and preflight would not feed `--default-font-family`,
    // so the app would silently keep inheriting Tailwind's own default and this
    // whole module would be decoration.
    const theme = css.slice(css.indexOf('@theme {'), css.indexOf('\n:root {'))
    for (const role of FONT_ROLES) expect(theme).toContain(`--font-${role}:`)
  })
})

describe('nothing outside the module writes its own font stack', () => {
  function sourceFiles(dir) {
    return readdirSync(dir).flatMap(name => {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full)
      return /\.jsx?$/.test(full) ? [full] : []
    })
  }
  const rel = (f) => f.replace(`${SRC}/`, 'src/')
  const ALLOWED = new Set([join(SRC, 'lib/typography.js')])

  it('names no font family in src', () => {
    // `-apple-system` is the tell: it is the head of every hand-copied system
    // stack, and it is what both export surfaces had written out separately.
    const offenders = []
    for (const file of sourceFiles(SRC)) {
      if (ALLOWED.has(file)) continue
      const body = readFileSync(file, 'utf8')
      for (const m of body.matchAll(/-apple-system|BlinkMacSystemFont|'Segoe UI'|"Segoe UI"|ui-monospace/g)) {
        offenders.push(`${rel(file)}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('has the two export surfaces reading the shared stack', () => {
    // The scan above only proves they stopped writing their own. This proves
    // they picked the shared one up rather than dropping the declaration and
    // silently inheriting something else — html2canvas rasterises the document,
    // so an unstyled canvas is not obviously wrong until the PNG is posted.
    for (const f of ['ShareCanvas.jsx', 'ShareModal.jsx']) {
      const body = readFileSync(join(COMPONENTS, f), 'utf8')
      expect(body, `${f} does not import the shared stack`).toContain("from '../lib/typography.js'")
      expect(body, `${f} does not use it`).toMatch(/fontFamily:\s*FONT_STACKS\.sans/)
    }
  })
})

describe('live figures have tabular figures', () => {
  // Every card that renders a number which changes without a page reload. The
  // six at the top are the ones that had none at all — each of them repainting
  // a differently-shaped number on a 60-second interval, or faster.
  const LIVE_FIGURE_CARDS = [
    'VolumeCard.jsx',
    'NetworkFeesCard.jsx',
    'CycleIndicatorsCard.jsx',
    'MarketSentimentCard.jsx',
    'NetworkPulseCard.jsx',
    'SupplyIssuedCard.jsx',
    'BtcPriceCard.jsx',
    'PriceChartCard.jsx',
    'HalvingCountdown.jsx',
    'NetworkHeartbeatCard.jsx',
    'RecentBlocksCard.jsx',
  ]

  it.each(LIVE_FIGURE_CARDS)('%s', (file) => {
    expect(readFileSync(join(COMPONENTS, file), 'utf8')).toContain(TABULAR)
  })

  it('covers the live price itself, which is the fastest-moving figure here', () => {
    // Named rather than left to the file-level check above: the price is
    // repainted by the Kraken socket on every tick, it is the largest number on
    // the page, and it was the one element with no tabular figures at all while
    // the vibe breakdown beside it had them.
    const body = readFileSync(join(COMPONENTS, 'BtcPriceCard.jsx'), 'utf8')
    expect(body).toMatch(new RegExp(`text-2xl font-bold text-accent ${TABULAR}[^"]*">\\{value\\}`))
  })

  it('found the cards to check', () => {
    // A list that had drifted off the filenames would pass every case above by
    // reading nothing.
    const present = new Set(readdirSync(COMPONENTS))
    for (const f of LIVE_FIGURE_CARDS) expect(present, `${f} is gone`).toContain(f)
  })
})

describe('the Satori exception', () => {
  it('still describes the preview card', () => {
    // `api/lib/ogView.js` cannot follow the app: Satori draws on its bundled
    // Geist, which we do not supply and cannot reach from the browser. Recorded
    // in `typography.js` rather than discovered — and re-checked here, because
    // an exemption nobody looks at is how a list rots. If this goes red because
    // the card now names a supplied face, that is the good outcome: delete the
    // exception rather than the assertion.
    const og = readFileSync(resolve('api/lib/ogView.js'), 'utf8')
    expect(og).toContain(`fontFamily: '${SATORI_FONT_FAMILY}'`)
    expect(og).not.toContain('FONT_STACKS')
  })
})
