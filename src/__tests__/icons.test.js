import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import {
  ICON_PATHS, ICON_NAMES, ICON_SIZES, ICON_VIEWBOX, ICON_STROKE_WIDTH,
  ICON_BUTTON, ICON_BUTTON_LABELLED,
} from '../lib/icons.js'

// The icon decision, held to the four claims it makes.
//
// 1. One box, one weight, three sizes — so the effective stroke is a function
//    of the rendered size rather than five independent choices.
// 2. Nothing outside `Icon.jsx` writes an `<svg>`, and nothing anywhere draws a
//    control with a text glyph. That second half is the one with a real
//    failure mode behind it: `✕`, `▾`, `▲` and `▼` resolve in whatever font the
//    device supplies, which is the tofu risk v1.8.1 removed from the app mark.
// 3. Every name a call site asks for exists. A typo here is silent — the
//    control keeps its size, its label and its handler and simply has no
//    picture in it — which is exactly the shape of failure a test has to cover
//    because a reviewer will not see it in a diff.
// 4. The header button shell is written once, not four times.
//
// Paths are resolved from the repo root: vitest runs there, and
// `import.meta.url` is not a file: URL under the jsdom environment.
const SRC = resolve('src')
const ICON_COMPONENT = join(SRC, 'components', 'Icon.jsx')
/**
 * The exemptions, and they are a category difference rather than a favour.
 * These draw *artwork* — pixel grids in the app mark's idiom — not icons on the
 * 24-box scale this file exists to enforce. Routing a 32 × 32 character or a
 * 61-cell wordmark through `Icon` would mean hundreds of registry entries for
 * one drawing apiece. Each is held honest below.
 */
const ARTWORK = [
  { path: join(SRC, 'components', 'VibeCharacter.jsx'), from: 'vibeCharacter.js' },
  { path: join(SRC, 'components', 'Wordmark.jsx'),      from: 'wordmark.js' },
  // Not a component: it builds standalone SVG strings for the three export
  // surfaces, which cannot render React and must not each redraw the alphabet.
  { path: join(SRC, 'lib', 'wordmark.js'),              from: 'GLYPHS' },
]
const ARTWORK_PATHS = new Set(ARTWORK.map(a => a.path))
const ICONS_MODULE = join(SRC, 'lib', 'icons.js')

/** Every `.js`/`.jsx` under `src/`, tests excluded — they assert *about* this. */
function sourceFiles(dir = SRC) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      return name === '__tests__' ? [] : sourceFiles(full)
    }
    return /\.jsx?$/.test(name) ? [full] : []
  })
}

const FILES = sourceFiles()
const rel = (f) => relative(resolve('.'), f)

/**
 * A file's code with its comments removed.
 *
 * Every claim below is about what the app *renders*, and this module and its
 * call sites necessarily discuss the markup they replaced — the first draft of
 * this suite failed on its own documentation, which is a scan measuring the
 * wrong thing rather than a finding.
 */
function code(file) {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join('\n')
}

describe('the scale is one decision, not fifteen', () => {
  it('draws every icon on the same viewBox', () => {
    expect(ICON_VIEWBOX).toBe('0 0 24 24')
  })

  it('uses one stroke weight, so two icons at one size cannot disagree', () => {
    expect(ICON_STROKE_WIDTH).toBe(2)
  })

  it('offers three rendered sizes and no more', () => {
    // Five existed before and they were not five decisions — 13px beside 14px
    // is a difference nobody chose and nobody can see.
    expect(Object.keys(ICON_SIZES)).toEqual(['sm', 'md', 'lg'])
    for (const px of Object.values(ICON_SIZES)) {
      expect(Number.isInteger(px) && px > 0).toBe(true)
    }
  })

  it.each(ICON_NAMES)('%s is a non-empty list of [tag, attrs] pairs', (name) => {
    const children = ICON_PATHS[name]
    expect(Array.isArray(children)).toBe(true)
    expect(children.length).toBeGreaterThan(0)
    for (const child of children) {
      expect(child).toHaveLength(2)
      const [tag, attrs] = child
      expect(typeof tag).toBe('string')
      expect(attrs && typeof attrs).toBe('object')
    }
  })
})

describe('nothing outside Icon.jsx draws its own', () => {
  it('holds the only <svg> in src/', () => {
    const offenders = FILES
      .filter(f => f !== ICON_COMPONENT && !ARTWORK_PATHS.has(f))
      .filter(f => /<svg[\s>]/.test(code(f)))
      .map(rel)
    expect(offenders, 'these files hand-write an <svg>; use <Icon>').toEqual([])
  })

  it('leaves no control drawn as a text glyph', () => {
    // `api/lib/ogView.js` is deliberately not in this scan — Satori draws that
    // card, its arrows are already inside the character set `ogImage.test.js`
    // pins, and it is outside `src/` in any case. The exemption is recorded in
    // `icons.js`; this comment is the pointer to it.
    //
    // `×` (U+00D7) is deliberately *not* in this set, which the first draft got
    // wrong: it is the Mayer Multiple's unit in `alertRules.js` — a
    // multiplication sign in a number, not a control drawn as a picture. The
    // close glyph is `✕` (U+2715) and they are different characters.
    const GLYPHS = /[✕✖▾▴▲▼➤]/
    const offenders = []
    for (const file of FILES) {
      for (const line of code(file).split('\n')) {
        if (GLYPHS.test(line)) offenders.push(`${rel(file)}: ${line.trim()}`)
      }
    }
    expect(offenders, 'these render a glyph the device may not have').toEqual([])
  })
})

describe('the artwork exemptions', () => {
  it.each(ARTWORK)('$path still draws from a pixel grid, not an icon', ({ path, from }) => {
    // An exemption nobody re-checks is how a list rots — the same rule the
    // Satori and overlay exemptions are held to elsewhere.
    const body = readFileSync(path, 'utf8')
    expect(body).toContain(from)
    expect(body).toMatch(/<rect/)
    // And it must not quietly become a second icon set.
    expect(body).not.toMatch(/\bICON_PATHS\b/)
  })
})

describe('every name a call site asks for exists', () => {
  // The backstop in `Icon.jsx` throws, but only for a branch that actually
  // renders — a typo in the *falsy* half of a ternary ships silently and blows
  // up on a visitor. This reads the call sites instead.
  //
  // The name is as often a ternary as a literal — `<Icon name={up ? 'a' : 'b'}
  // />` — so this pulls every quoted string out of the whole `name=` expression
  // rather than matching a bare attribute. The first draft did the latter and
  // silently saw six of the twelve icons, which would have reported half the
  // registry as dead.
  const used = new Set()
  const sizes = new Set()
  for (const file of FILES) {
    const body = code(file)
    for (const m of body.matchAll(/<Icon\b[^>]*?\bname=(\{[^}]*\}|"[^"]*"|'[^']*')/g)) {
      for (const lit of m[1].matchAll(/['"]([a-z-]+)['"]/g)) used.add(lit[1])
    }
    for (const m of body.matchAll(/<Icon\b[^>]*?\bsize="([^"]*)"/g)) sizes.add(m[1])
  }

  it('finds call sites at all, so this suite cannot pass by scanning nothing', () => {
    expect(used.size).toBeGreaterThan(5)
  })

  it('resolves each of them in the registry', () => {
    const unknown = [...used].filter(n => !ICON_NAMES.includes(n))
    expect(unknown, 'referenced but not defined in icons.js').toEqual([])
  })

  it('resolves each requested size in the scale', () => {
    // Added because a mutation survived without it. `Icon` throws on a size
    // outside the scale, but a throw only fires for a branch that actually
    // renders — and the header buttons have no unit test that renders them, so
    // `size="xs"` on the share button passed all 1095 tests while being certain
    // to break the page. The point of a three-value scale is that a fourth
    // value is a mistake, which makes it the scan's business, not the browser's.
    const unknown = [...sizes].filter(s => !(s in ICON_SIZES))
    expect(unknown, 'requested but not in ICON_SIZES').toEqual([])
  })

  it('defines nothing the app never asks for', () => {
    // A registry that only grows is how a stale icon survives a redesign.
    const unused = ICON_NAMES.filter(n => !used.has(n))
    expect(unused, 'defined in icons.js but never rendered').toEqual([])
  })
})

describe('the header button shell is written once', () => {
  it('composes the labelled variant from the base rather than restating it', () => {
    expect(ICON_BUTTON_LABELLED.startsWith(ICON_BUTTON)).toBe(true)
  })

  it('is not hand-written at any call site', () => {
    // The four copies this replaces all carried this trio verbatim. Matching on
    // it is what catches the fifth button somebody adds by copying the fourth.
    const offenders = FILES
      .filter(f => f !== ICONS_MODULE)
      .filter(f => /w-7 h-7 rounded-full/.test(readFileSync(f, 'utf8')))
      .map(rel)
    expect(offenders, 'these restate the shell; import ICON_BUTTON').toEqual([])
  })
})
