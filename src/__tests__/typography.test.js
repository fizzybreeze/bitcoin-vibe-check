import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  FONT_STACKS, FONT_ROLES, SATORI_FONT_FAMILY, TABULAR,
  CARD, CARD_LABEL, CARD_LABEL_SM, CARD_VALUE, CARD_VALUE_TIERS, CARD_ROOT_FORBIDDEN,
} from '../lib/typography.js'

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

/** Every `.js`/`.jsx` under `src/`, tests excluded — they assert *about* these. */
function sourceFiles(dir = SRC) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full)
    return /\.jsx?$/.test(full) ? [full] : []
  })
}
const rel = (f) => f.replace(`${SRC}/`, 'src/')

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
    // The heartbeat's figures moved out of `NetworkHeartbeatCard` into the
    // interior both it and `RecentBlocksCard` now render, so this is where they
    // are held. That move also showed the `RecentBlocksCard` entry below had
    // been satisfied by the *heartbeat header* all along — a `hidden lg:block`
    // subtree — while the block list's own "12s ago", which is re-rendered
    // every second, had no tabular figures at all. It does now.
    'NetworkHeartbeat.jsx',
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
    // The size now comes from the value scale, so this pins the pair — the
    // headline tier *and* the tabular figures — on the element rendering the
    // price, rather than a literal that has moved into `typography.js`.
    expect(body).toMatch(new RegExp(`CARD_VALUE\\.lead\\} text-accent ${TABULAR}\`\\}>\\{value\\}`))
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

describe('the card label is written once', () => {
  // It was copy-pasted 36 times across 16 files, and the one call site that had
  // named it kept the constant local and unexported.
  const LABEL_LITERAL = 'text-xs font-semibold uppercase tracking-widest'

  it('appears nowhere in src/ as a hand-written string', () => {
    const offenders = sourceFiles()
      .filter(f => f !== join(SRC, 'lib', 'typography.js'))
      .filter(f => readFileSync(f, 'utf8').includes(LABEL_LITERAL))
      .map(rel)
    expect(offenders, 'these restate the label; import CARD_LABEL').toEqual([])
  })

  it('is actually used, so the check above cannot pass by the label being gone', () => {
    const users = sourceFiles().filter(f => /\bCARD_LABEL\b/.test(readFileSync(f, 'utf8')))
    expect(users.length).toBeGreaterThan(10)
  })

  it('carries its colour, because that half never varied', () => {
    // All 36 were `text-quiet`, byte-identical — the opposite of ICON_BUTTON,
    // which leaves colour out precisely because settings and actions differ.
    expect(CARD_LABEL).toContain('text-quiet')
  })

  it('keeps the smaller tier a named decision rather than a second scale', () => {
    expect(CARD_LABEL_SM).toContain('text-[10px]')
    const offenders = sourceFiles()
      .filter(f => f !== join(SRC, 'lib', 'typography.js'))
      .filter(f => /"[^"]*text-\[10px\][^"]*uppercase/.test(readFileSync(f, 'utf8')))
      .map(rel)
    expect(offenders, 'these hand-write the small label tier').toEqual([])
  })
})

describe('the value scale', () => {
  it('is four roles, and text-xl is not one of them', () => {
    // Five treatments served this role across nineteen sites. `text-xl` is the
    // one with no role to describe it, so it does not survive the pass.
    expect(CARD_VALUE_TIERS).toEqual(['hero', 'lead', 'base', 'dense', 'tight'])
    for (const cls of Object.values(CARD_VALUE)) {
      expect(cls).toContain('font-bold')
      expect(cls).not.toContain('text-xl ')
    }
  })

  it('never puts a headline figure at text-sm', () => {
    // `NetworkHeartbeatCard` rendered the block height at 14px on a phone —
    // smaller than the label above it — and `RecentBlocksCard` carried the same
    // class inside a `hidden lg:block` subtree where it could never render at
    // all. Both are the `dense` tier now.
    for (const cls of Object.values(CARD_VALUE)) expect(cls).not.toMatch(/\btext-sm\b/)
    const offenders = sourceFiles()
      .filter(f => /text-sm font-bold/.test(readFileSync(f, 'utf8')))
      .map(rel)
    expect(offenders, 'a big number at 14px').toEqual([])
  })

  it('leaves colour and tabular-nums at the call site', () => {
    for (const cls of Object.values(CARD_VALUE)) {
      expect(cls).not.toContain('text-accent')
      expect(cls).not.toContain('text-ink')
      expect(cls).not.toContain(TABULAR)
    }
  })
})

describe('the card shell', () => {
  // Overlays, not cards in the grid. A modal has a border, a max-width and a
  // scrim behind it; the alerts popover has a shadow and sits over a still-
  // usable page. Forcing the card shell on either would drop those and give a
  // modal responsive padding it has no reason to want.
  const OVERLAYS = ['NewsletterModal.jsx', 'PriceAlertsPanel.jsx']

  it('is one padding scheme, not four', () => {
    expect(CARD).toBe('rounded-2xl bg-surface p-4 md:p-6')
  })

  it('is what every card in the grid uses', () => {
    const offenders = readdirSync(COMPONENTS)
      .filter(n => n.endsWith('.jsx') && !OVERLAYS.includes(n))
      .filter(n => /rounded-2xl bg-surface/.test(readFileSync(join(COMPONENTS, n), 'utf8')))
    expect(offenders, 'these hand-write the card shell; import CARD').toEqual([])
  })

  it('still describes the two overlays it exempts', () => {
    // An exemption nobody re-checks is how a list rots — the same rule the
    // Satori exception above is held to.
    for (const n of OVERLAYS) {
      expect(readFileSync(join(COMPONENTS, n), 'utf8')).toContain('rounded-2xl bg-surface')
    }
  })

  it('leaves a card no opinion about where it sits', () => {
    // Six roots baked their own mt-4/mb-4 in while the rest relied on the
    // grid's gap-4, and two hid themselves at a breakpoint — so a card could
    // not be moved, or shown at another width, without editing the card.
    const offenders = []
    for (const n of readdirSync(COMPONENTS).filter(f => f.endsWith('.jsx'))) {
      const body = readFileSync(join(COMPONENTS, n), 'utf8')
      for (const m of body.matchAll(/className=\{?[`"]([^`"]*rounded-2xl bg-surface[^`"]*)[`"]/g)) {
        if (CARD_ROOT_FORBIDDEN.test(m[1])) offenders.push(`${n}: ${m[1]}`)
      }
      for (const m of body.matchAll(/className=\{`\$\{CARD\}([^`]*)`\}/g)) {
        if (CARD_ROOT_FORBIDDEN.test(m[1])) offenders.push(`${n}: CARD +${m[1]}`)
      }
    }
    expect(offenders, 'a card root carrying its own margin or breakpoint').toEqual([])
  })
})

describe('the label register is mono', () => {
  it('sets both label tiers in it, and only the label tiers', () => {
    // The figures deliberately stay in the UI face — these are the numbers the
    // dashboard exists to show, and moving them would be a re-skin rather than
    // a register. If a value tier ever wants mono it is a decision to argue
    // for, not one to arrive by copying a label.
    expect(CARD_LABEL).toContain('font-mono')
    expect(CARD_LABEL_SM).toContain('font-mono')
    for (const tier of CARD_VALUE_TIERS) {
      expect(CARD_VALUE[tier], `${tier} should stay in the UI face`).not.toContain('font-mono')
    }
  })

  it('resolves through the mono token the module already declares', () => {
    // `font-mono` is only a class because `--font-mono` is in `@theme`. A tier
    // written as a literal stack, or against a token that is not declared,
    // produces no utility at all and the label silently inherits the UI face —
    // the same trap the band ladders record for composed class names.
    expect(FONT_ROLES).toContain('mono')
    expect(readFileSync(INDEX_CSS, "utf8")).toMatch(/--font-mono:/)
  })

  it('carries the register onto the share image, which is a copy of the app', () => {
    // The one export surface that *can* follow. Left in the UI face it would be
    // the single place the image and the card disagree — invisible on either
    // one alone, which is how the two brand oranges survived.
    const body = readFileSync(join(COMPONENTS, 'ShareCanvas.jsx'), 'utf8')
    expect(body).toMatch(/fontFamily:\s*FONT_STACKS\.mono/)
  })

  it('leaves the two preview cards out of it, and says why', () => {
    // Neither can follow, for one reason: Satori ships a single face, and the
    // static fallback exists to mirror the live card's header. Recorded so the
    // absence reads as a decision rather than as a surface somebody missed.
    const og = readFileSync(resolve('api/lib/ogView.js'), 'utf8')
    expect(og).toContain(`fontFamily: '${SATORI_FONT_FAMILY}'`)
    expect(og).not.toMatch(/FONT_STACKS\.mono/)
  })
})
