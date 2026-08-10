import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PALETTE, THEMES, TOKEN_NAMES, resolveTheme, token } from '../lib/palette.js'

// The Afterglow palette, held to the three claims it makes.
//
// 1. The stylesheet and `palette.js` say the same thing. They have to be two
//    files — Tailwind reads only CSS, and canvas/Satori/node read only JS — so
//    the only thing standing between them and the two-different-oranges bug
//    this scheme replaced is an assertion across the pair.
// 2. Every text token clears WCAG AA on every surface it is used on, in *both*
//    themes. A second theme doubles the number of ways contrast can be wrong,
//    and light mode is the half nobody looks at on a dark laptop.
// 3. Nothing outside the stylesheet names a hue. That is the rule that stops
//    the next card being written by copying an older one — the same failure
//    v1.7.12's `text-gray-500` scan existed to catch, widened to the whole
//    Tailwind palette now that every colour in the app is a role.
//
// Paths are resolved from the repo root: vitest runs there, and
// `import.meta.url` is not a file: URL under the jsdom environment.
const SRC = resolve('src')
const INDEX_CSS = join(SRC, 'index.css')

const AA_NORMAL_TEXT = 4.5
const AA_NON_TEXT = 3

// ── sRGB → relative luminance ────────────────────────────────────────────────
const channel = (v) => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(hex) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Hue angle in degrees, for the one question contrast cannot answer. */
function hue(hex) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const delta = max - Math.min(r, g, b)
  if (delta === 0) return 0
  const sixth = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return (sixth * 60 + 360) % 360
}

/** Shortest distance around the wheel, so 350° and 10° are 20° apart. */
function hueDistance(a, b) {
  const d = Math.abs(hue(a) - hue(b)) % 360
  return d > 180 ? 360 - d : d
}

/** Every `--color-*` declaration inside one CSS block, as a plain object. */
function tokensInBlock(css, opener) {
  const start = css.indexOf(opener)
  expect(start, `${opener} block is missing from src/index.css`).toBeGreaterThan(-1)
  const body = css.slice(start + opener.length, css.indexOf('}', start))
  return Object.fromEntries(
    [...body.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(m => [m[1], m[2]]),
  )
}

const css = readFileSync(INDEX_CSS, 'utf8')
const cssLight = tokensInBlock(css, '@theme {')
const cssDark = tokensInBlock(css, '.dark {')

describe('the conversion itself', () => {
  it('agrees with values of known ratio, so a typo cannot make everything pass', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
    expect(contrastRatio('#808080', '#ffffff')).toBeCloseTo(3.95, 1)
  })
})

describe('the stylesheet mirrors palette.js', () => {
  it.each(THEMES)('declares every %s token with the same value', (theme) => {
    const declared = theme === 'dark' ? cssDark : cssLight
    const expected = Object.fromEntries(TOKEN_NAMES.map(n => [n, PALETTE[theme][n]]))
    // Compared whole rather than key by key: a token present in the stylesheet
    // and absent from palette.js is just as broken as a mismatched value, and
    // an equality check catches both without a second assertion.
    expect(declared).toEqual(expected)
  })

  it('defines the same token names in both themes', () => {
    expect(Object.keys(PALETTE.light).sort()).toEqual(Object.keys(PALETTE.dark).sort())
  })
})

// Which text roles sit on which surfaces. Derived from the app rather than
// guessed: the header and the page frame sit on `ground`, every card is
// `surface`, and the inner tiles, inputs and skeletons are `raised`.
const ON_EVERY_SURFACE = ['ink', 'ink-dim', 'muted', 'quiet', 'accent', 'up', 'down', 'warn', 'support']
const CARD_SURFACES = ['surface', 'raised']
const LADDER_TOKENS = TOKEN_NAMES.filter(n => n.startsWith('vibe-') || n.startsWith('fng-'))

describe.each(THEMES)('%s theme contrast', (theme) => {
  const at = (name) => PALETTE[theme][name]

  it.each(ON_EVERY_SURFACE)('%s clears AA on ground, surface and raised', (name) => {
    for (const surface of ['ground', ...CARD_SURFACES]) {
      expect(
        contrastRatio(at(name), at(surface)),
        `${name} on ${surface}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }
  })

  it.each(LADDER_TOKENS)('%s clears AA where the ladders are drawn', (name) => {
    for (const surface of CARD_SURFACES) {
      expect(
        contrastRatio(at(name), at(surface)),
        `${name} on ${surface}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }
  })

  it('places a readable label on the accent fill, in both of its states', () => {
    expect(contrastRatio(at('accent-ink'), at('accent-fill'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    expect(contrastRatio(at('accent-ink'), at('accent-fill-hover'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it('keeps the toggle knob visible against both track colours', () => {
    // A control, not text, so the non-text threshold applies — but it applies
    // to *both* of the toggle's states, and they need different knobs to meet
    // it. A white knob on the bright accent fill is 2.46:1 in dark mode, which
    // is why the on-state knob is `accent-ink` (the fill's own label colour)
    // and only the off-state, against `line-strong`, is white.
    expect(contrastRatio(at('accent-ink'), at('accent-fill'))).toBeGreaterThanOrEqual(AA_NON_TEXT)
    expect(contrastRatio(at('knob'), at('line-strong'))).toBeGreaterThanOrEqual(AA_NON_TEXT)
  })

  it('keeps enough headroom on the quietest tier that a nudge cannot drop it under', () => {
    // Landing on exactly 4.5 would make the next tweak a coin toss. `quiet` is
    // the tightest token in the set and carries the most usages by far, so it
    // is the one worth pinning above the line rather than on it.
    expect(contrastRatio(at('quiet'), at('raised'))).toBeGreaterThan(4.6)
  })

  it('keeps muted and quiet as two distinguishable tiers', () => {
    // Passing AA by promoting everything to the brighter tone was the
    // alternative v1.7.12 rejected, and it would flatten the hierarchy.
    expect(contrastRatio(at('quiet'), at('surface')))
      .toBeLessThan(contrastRatio(at('muted'), at('surface')))
  })

  it('draws a focus ring that clears the non-text minimum on every surface', () => {
    // The ring is `accent` and it is painted *outside* the control, so what it
    // has to be visible against is whatever the control is sitting on. All
    // three are covered above at the stricter text threshold — this states the
    // claim in the place where someone retuning `accent` will read it, since a
    // focus indicator is the one use of that token where dropping under 3:1
    // costs a visitor the ability to tell where they are on the page.
    for (const surface of ['ground', ...CARD_SURFACES]) {
      expect(contrastRatio(at('accent'), at(surface)), `focus ring on ${surface}`)
        .toBeGreaterThanOrEqual(AA_NON_TEXT)
    }
  })

  it('separates the accent from the down signal by hue, not by lightness', () => {
    // The two warmest things on screen, and one of them means "the price
    // fell". A contrast ratio is the wrong instrument here — it measures
    // lightness, and these two are deliberately similar in lightness — so this
    // measures the thing that actually tells them apart. The first draft of
    // Afterglow used rose (#fb7185) for `down`, 59° from the fuchsia accent
    // and 1.09:1 against it; it is red now, which is 68° further away.
    expect(hueDistance(at('accent'), at('down'))).toBeGreaterThan(60)
  })
})

describe('nothing outside the stylesheet names a hue', () => {
  const COLOR_PREFIXES = [
    'text', 'bg', 'border', 'ring', 'divide', 'from', 'via', 'to',
    'placeholder', 'fill', 'stroke', 'shadow', 'caret', 'outline', 'decoration',
  ]
  const TAILWIND_FAMILIES = [
    'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber',
    'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue',
    'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'white', 'black',
  ]
  const RAW_HUE = new RegExp(
    `\\b(?:${COLOR_PREFIXES.join('|')})-(?:${TAILWIND_FAMILIES.join('|')})(?:-\\d{2,3})?\\b`,
    'g',
  )
  // A bare hex outside the palette module is the same failure in the other
  // notation — it is how `#f97316` ended up in six files.
  const RAW_HEX = /#[0-9a-fA-F]{6}\b/g
  const HEX_ALLOWED = new Set([
    join(SRC, 'lib/palette.js'),
    // The genesis block hash is data that happens to be hex-shaped.
    join(SRC, 'components/SatoshiQuote.jsx'),
  ])

  function sourceFiles(dir) {
    return readdirSync(dir).flatMap(name => {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full)
      return /\.jsx?$/.test(full) ? [full] : []
    })
  }

  const rel = (f) => f.replace(`${SRC}/`, 'src/')

  it('uses no Tailwind palette colour anywhere in src', () => {
    const offenders = []
    for (const file of sourceFiles(SRC)) {
      for (const m of readFileSync(file, 'utf8').matchAll(RAW_HUE)) {
        offenders.push(`${rel(file)}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('writes no raw hex outside the palette module', () => {
    const offenders = []
    for (const file of sourceFiles(SRC)) {
      if (HEX_ALLOWED.has(file)) continue
      for (const m of readFileSync(file, 'utf8').matchAll(RAW_HEX)) {
        offenders.push(`${rel(file)}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('leaves the focus indicator to the stylesheet', () => {
    // Every `outline-none` in `src/` used to be one of two things: a control
    // taking the focus ring away with nothing put in its place, or a control
    // reinventing it as a ring of its own. The blanket rule in `index.css` is
    // unlayered, so a Tailwind utility can no longer win against it — which
    // makes any of these a class that reads as if it does something and does
    // not, and the next person to copy one would be copying a lie.
    const offenders = []
    for (const file of sourceFiles(SRC)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\b(?:focus:)?outline-none\b/g)) {
        offenders.push(`${rel(file)}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('the focus indicator', () => {
  // The rule itself, asserted where the file is already being parsed. That it
  // is *emitted and wins in a browser* is `e2e/accessibility.spec.js`'s job —
  // a text match cannot tell you Tailwind's `@layer utilities` did not beat it.
  const css = readFileSync(INDEX_CSS, 'utf8')

  it('is declared, once, for the whole app', () => {
    expect(css).toMatch(/^:focus-visible \{/m)
  })

  it('is drawn in the accent token rather than a colour of its own', () => {
    const rule = css.slice(css.indexOf('\n:focus-visible {'))
    expect(rule).toMatch(/outline:\s*2px solid var\(--color-accent\)/)
    // Offset, because an inset ring on an accent-filled button sits on its own
    // colour and disappears.
    expect(rule).toMatch(/outline-offset:\s*2px/)
  })

  it('is not wrapped in a layer, which is what lets it beat outline-none', () => {
    // Tailwind emits utilities into `@layer utilities`; an unlayered rule beats
    // any layered one whatever its specificity. Put this inside `@layer` and it
    // still parses, still looks right in this file, and silently stops applying
    // to every control that carries the utility.
    //
    // Asserted as brace depth rather than by looking for the word `@layer`,
    // which appears in the prose above the rule and in this file's own header:
    // depth 0 is what "unlayered" actually means, and it catches a stray `{`
    // as well.
    const before = css.slice(0, css.indexOf('\n:focus-visible {')).replace(/\/\*[\s\S]*?\*\//g, '')
    const depth = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length
    expect(depth, 'the focus rule is nested inside another block').toBe(0)
  })
})

describe('resolveTheme', () => {
  it('accepts the themes this app has', () => {
    expect(resolveTheme('dark')).toBe('dark')
    expect(resolveTheme('light')).toBe('light')
  })

  it('falls back to the default for anything else', () => {
    // localStorage is a string bucket anyone can write to, and the boot script
    // reads it before React exists.
    for (const junk of [null, undefined, '', 'DARK', 'sepia', '{}', 0]) {
      expect(resolveTheme(junk)).toBe('dark')
    }
  })
})

describe('token', () => {
  it('reads a value for a consumer that cannot reach the stylesheet', () => {
    expect(token('accent', 'dark')).toBe(PALETTE.dark.accent)
    expect(token('accent', 'light')).toBe(PALETTE.light.accent)
  })

  it('falls back to the default theme rather than to a colour', () => {
    // A grey placeholder in a shared social image hides the caller's bug.
    expect(token('accent', 'sepia')).toBe(PALETTE.dark.accent)
  })

  it('answers null for a name that does not exist', () => {
    expect(token('nope', 'dark')).toBeNull()
  })
})

describe('the browser chrome agrees with the page', () => {
  // `theme-color` and the manifest are the strip above the page and the splash
  // behind it. Neither is reachable from CSS, so both restate a ground colour —
  // and a dark strip over a light page is the most obvious way a theme switch
  // looks half-finished. These are the third and fourth copies of those two
  // values; this is what stops them drifting.
  const indexHtml = readFileSync(resolve('index.html'), 'utf8')
  const manifest = JSON.parse(readFileSync(resolve('public/manifest.json'), 'utf8'))

  it('declares the dark ground as the default theme-color', () => {
    // Default rather than light, because dark is what an unconfigured visitor
    // gets and the boot script only rewrites this when it resolves to light.
    const content = indexHtml.match(/<meta name="theme-color" content="([^"]+)"/)?.[1]
    expect(content).toBe(PALETTE.dark.ground)
  })

  it('gives the boot script both grounds and nothing else', () => {
    const script = indexHtml.slice(indexHtml.indexOf('<script>'), indexHtml.indexOf('</script>'))
    expect(script).toContain(PALETTE.dark.ground)
    expect(script).toContain(PALETTE.light.ground)
    // Any other six-digit hex in there is a value that will not follow the
    // palette when it moves.
    const strays = [...script.matchAll(/#[0-9a-fA-F]{6}\b/g)]
      .map(m => m[0])
      .filter(hex => hex !== PALETTE.dark.ground && hex !== PALETTE.light.ground)
    expect(strays).toEqual([])
  })

  it('splashes the installed app on the dark ground', () => {
    // An installed PWA has no `prefers-color-scheme` to consult before the
    // first paint, so the manifest commits to the product's default.
    expect(manifest.background_color).toBe(PALETTE.dark.ground)
    expect(manifest.theme_color).toBe(PALETTE.dark.ground)
  })
})

describe('reduced motion', () => {
  it('is honoured globally rather than per animation', () => {
    // This dashboard runs a 30-second ticker and a per-block ping indefinitely.
    // A per-component opt-in is a rule someone has to remember; the blanket
    // rule is the one that survives the next animation being added.
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    const block = css.slice(css.indexOf('prefers-reduced-motion'))
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/)
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/)
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/)
  })
})

describe('the page paints its own ground', () => {
  it('sets a background on body from a token', () => {
    // Without this the area outside the root component — iOS overscroll, the
    // space under a short page — is the browser's white, in both themes.
    expect(css).toMatch(/body\s*\{[^}]*background-color:\s*var\(--color-ground\)/s)
  })

  it('declares color-scheme for both themes', () => {
    // Form controls, scrollbars and the caret follow this, not our tokens.
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/s)
    expect(css).toMatch(/\.dark\s*\{[^}]*color-scheme:\s*dark/s)
  })
})
