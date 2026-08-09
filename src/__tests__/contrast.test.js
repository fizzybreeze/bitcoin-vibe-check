import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Paths are resolved from the repo root: vitest runs there, and `import.meta.url`
// is not a file: URL under the jsdom environment this suite uses.
const SRC = resolve('src')
const INDEX_CSS = join(SRC, 'index.css')

// The contrast half of the accessibility pass (roadmap §5).
//
// Two separate claims, and both need pinning, because each is useless without
// the other: that the muted tone this app uses actually clears WCAG AA on the
// background it sits on, and that nothing has quietly gone back to one of the
// three Tailwind tones that do not.
//
// A contrast fix with no test is a fix that lasts until the next card is
// written by someone copying an older one.

const AA_NORMAL_TEXT = 4.5

// ── oklch → sRGB → relative luminance ────────────────────────────────────────
//
// Tailwind v4 publishes its palette in oklch, so the conversion has to happen
// here rather than being looked up. This is the standard Oklab matrix pair; the
// test below checks it against a value with a known ratio so a typo in it
// cannot silently make every assertion pass.
function oklchToLinearRgb(L, C, H) {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ].map(v => Math.min(1, Math.max(0, v)))
}

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const parseOklch = (str) => {
  const [L, C, H] = str.match(/oklch\(([^)]*)\)/)[1].trim().split(/\s+/)
  return oklchToLinearRgb(parseFloat(L) / (L.includes('%') ? 100 : 1), parseFloat(C), parseFloat(H))
}

// Tailwind v4's own values, transcribed. Not imported, because the point is to
// compare *our* token against the palette as published.
const GRAY_900 = parseOklch('oklch(21% .034 264.665)')
const GRAY_400 = parseOklch('oklch(70.7% .022 261.325)')

/** `--color-gray-450`, read from the stylesheet rather than duplicated here. */
function readCustomMuted() {
  const css = readFileSync(INDEX_CSS, 'utf8')
  const match = css.match(/--color-gray-450:\s*(oklch\([^)]*\))/)
  expect(match, '--color-gray-450 is not defined in src/index.css').toBeTruthy()
  return parseOklch(match[1])
}

describe('the conversion itself', () => {
  it('agrees with a known ratio, so a typo cannot make everything pass', () => {
    // White on black is 21:1 by definition — the maximum the formula can yield.
    expect(contrastRatio([1, 1, 1], [0, 0, 0])).toBeCloseTo(21, 1)
    // And gray-400 on gray-900 is the value the audit measured.
    expect(contrastRatio(GRAY_400, GRAY_900)).toBeCloseTo(6.8, 1)
  })
})

describe('the muted text tone', () => {
  it('clears WCAG AA for normal text on the card background', () => {
    // The whole reason `--color-gray-450` exists. Tailwind's gray-500 is
    // 3.67:1 here, gray-600 is 2.35:1 and gray-700 is 1.72:1 — this replaces
    // all three.
    expect(contrastRatio(readCustomMuted(), GRAY_900)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it('keeps enough headroom that a small palette change cannot drop it under', () => {
    // Landing on exactly 4.5 would make the next tweak a coin toss.
    expect(contrastRatio(readCustomMuted(), GRAY_900)).toBeGreaterThan(4.6)
  })

  it('stays dimmer than gray-400, so the two muted tiers remain two tiers', () => {
    // Passing AA by promoting everything to gray-400 was the alternative, and
    // it would have flattened the hierarchy into one tone.
    expect(contrastRatio(readCustomMuted(), GRAY_900))
      .toBeLessThan(contrastRatio(GRAY_400, GRAY_900))
  })
})

describe('no component uses a tone that fails', () => {
  // The rule this pass established, as an assertion: text on gray-900 uses
  // gray-400 or gray-450 and nothing darker. Borders and backgrounds are
  // untouched and deliberately not covered — `bg-gray-800` is a surface, not
  // text, and WCAG's contrast minimum does not apply to it.
  function jsxFiles(dir) {
    return readdirSync(dir).flatMap(name => {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) return name === '__tests__' ? [] : jsxFiles(full)
      return full.endsWith('.jsx') ? [full] : []
    })
  }

  it('finds no text-gray-500, -600, -700, -800 or -900 anywhere in src', () => {
    const offenders = []
    for (const file of jsxFiles(SRC)) {
      const body = readFileSync(file, 'utf8')
      for (const m of body.matchAll(/text-gray-([5-9]00)/g)) {
        offenders.push(`${file.replace(`${SRC}/`, 'src/')}: text-gray-${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('reduced motion', () => {
  it('is honoured globally rather than per animation', () => {
    // This dashboard runs a 30-second ticker and a per-block ping indefinitely.
    // A per-component opt-in is a rule someone has to remember; the blanket
    // rule is the one that survives the next animation being added.
    const css = readFileSync(INDEX_CSS, 'utf8')
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    const block = css.slice(css.indexOf('prefers-reduced-motion'))
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/)
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/)
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/)
  })
})
