// Afterglow — the whole colour scheme, both themes, in one place.
//
// **This file is the source of truth and `src/index.css` mirrors it.** That is
// backwards from how a Tailwind project usually works, and it is deliberate:
// three consumers cannot read a CSS variable at all — `ShareCanvas` rasterises
// through html2canvas, `api/lib/ogView.js` runs under Satori on a serverless
// function that never loads the stylesheet, and `scripts/generate-icons.mjs` is
// a node script. Before this file each of those carried its own constant block,
// which is how the app shipped two different oranges (`#fb923c` in
// `src/lib/colors.js`, `#f97316` in five other places) for as long as it had a
// brand colour.
//
// The stylesheet is the *second* copy, not a second source: `palette.test.js`
// parses `index.css` and fails if any token disagrees with the value here, so
// the two cannot drift the way the oranges did. Hex rather than oklch — canvas
// and Satori both want hex, and one format everywhere beats a conversion at
// every boundary.
//
// Every text token below clears WCAG AA (4.5:1) against every surface it is
// used on, in both themes. `palette.test.js` computes those ratios from these
// values rather than trusting this comment.

/** Dark is the product's identity and its default; light is the alternative. */
export const THEMES = Object.freeze(['dark', 'light'])
export const DEFAULT_THEME = 'dark'

/** Read by the boot script in `index.html` as well as by `useTheme`. */
export const THEME_STORAGE_KEY = 'btc-theme'

const DARK = Object.freeze({
  // Surfaces, page outwards. Four levels, because the cards nest one deep.
  ground: '#12101c',
  surface: '#1a1727',
  raised: '#262138',
  hover: '#2f2947',
  line: '#2e2947',
  'line-soft': '#241f36',
  'line-strong': '#453d63',

  // Text, brightest first. `muted` and `quiet` are two tiers on purpose — the
  // v1.7.12 pass established that hierarchy and passing AA by flattening it
  // into one tone was the alternative it rejected.
  ink: '#ffffff',
  'ink-dim': '#d8d3e8',
  muted: '#b3accd',
  quiet: '#948cb0',

  // The accent. `fill` carries `accent-ink` as its label; they are separate
  // tokens because the readable label flips between themes and the accent
  // does not follow it.
  accent: '#e879f9',
  'accent-hover': '#f2a8ff',
  'accent-fill': '#e879f9',
  'accent-fill-hover': '#f2a8ff',
  'accent-ink': '#12101c',
  support: '#22d3ee',

  // Signals. Separate from the accent by design — a dashboard that colours
  // "up" with its brand colour has nothing left to say "good" with.
  up: '#34d399',
  down: '#f87171',
  warn: '#fbbf24',

  knob: '#ffffff',
  scrim: '#0a0812',

  // The Vibe Score temperature ladder, cold through overheated. Also drives
  // MVRV and the power-law deviation — see `scales.js` for why one ladder.
  'vibe-ice': '#38bdf8',
  'vibe-cold': '#22d3ee',
  'vibe-cool': '#2dd4bf',
  'vibe-warm': '#fbbf24',
  'vibe-hot': '#fb7185',
  'vibe-overheated': '#e879f9',

  // Fear & Greed. A different axis from the temperature ladder — fear/greed is
  // not hot/cold — so it keeps its own five.
  'fng-extreme-fear': '#fb7185',
  'fng-fear': '#fbbf24',
  'fng-neutral': '#facc15',
  'fng-greed': '#a3e635',
  'fng-extreme-greed': '#34d399',
})

const LIGHT = Object.freeze({
  ground: '#faf7fc',
  surface: '#ffffff',
  raised: '#f3eefa',
  hover: '#ebe3f5',
  line: '#e6dcf2',
  'line-soft': '#efe8f7',
  'line-strong': '#8a7fa3',

  ink: '#241f38',
  'ink-dim': '#3b3552',
  muted: '#4a4463',
  quiet: '#6a6384',

  accent: '#a21caf',
  'accent-hover': '#86198f',
  'accent-fill': '#a21caf',
  'accent-fill-hover': '#86198f',
  'accent-ink': '#ffffff',
  support: '#0e7490',

  up: '#047857',
  down: '#c5211f',
  warn: '#9a4708',

  knob: '#ffffff',
  scrim: '#241f38',

  'vibe-ice': '#0369a1',
  'vibe-cold': '#0e7490',
  'vibe-cool': '#0f766e',
  'vibe-warm': '#9a4708',
  'vibe-hot': '#be123c',
  'vibe-overheated': '#a21caf',

  'fng-extreme-fear': '#be123c',
  'fng-fear': '#9a4708',
  'fng-neutral': '#8a5406',
  'fng-greed': '#41680d',
  'fng-extreme-greed': '#047857',
})

export const PALETTE = Object.freeze({ dark: DARK, light: LIGHT })

/** Token names, in the order they are declared. Used by the mirror test. */
export const TOKEN_NAMES = Object.freeze(Object.keys(DARK))

/**
 * One token, for a consumer that cannot reach the stylesheet.
 *
 * Falls back to the default theme rather than to a colour: an unknown theme is
 * a caller bug, and a grey placeholder in a shared social image hides it.
 */
export function token(name, theme = DEFAULT_THEME) {
  const set = PALETTE[theme] ?? PALETTE[DEFAULT_THEME]
  return set[name] ?? null
}

/** Normalises anything stored, sent or guessed into a theme this app has. */
export function resolveTheme(value) {
  return THEMES.includes(value) ? value : DEFAULT_THEME
}
