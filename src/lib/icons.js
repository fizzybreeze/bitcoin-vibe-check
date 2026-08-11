/**
 * Every icon in the app, and the button shell around the ones that are buttons.
 *
 * This is the palette problem in a third notation. Before this there were
 * **thirteen hand-written `<svg>`s across eight files**, carrying between them
 * five rendered sizes (10, 12, 13, 14, 16), five viewBoxes and five stroke
 * weights (1.2 to 2.5) — and because the box and the rendered size varied
 * *independently*, the effective weight varied again on top of that. The three
 * header buttons that sit side by side ended up at three optical weights and
 * two sizes. None of that was decided; it is what fifteen separate call sites
 * each solving the same problem looks like after a year.
 *
 * ── The decision ───────────────────────────────────────────────────────────
 *
 * **One 24×24 viewBox, one stroke weight of 2 in those units, three rendered
 * sizes.** This is the Feather/Lucide convention and it is chosen for one
 * property rather than for familiarity: the effective stroke becomes a single
 * function of the rendered size (`2 × size / 24`) instead of five independent
 * choices, so two icons at the same size cannot disagree about weight. A
 * `viewBox` per icon is what made that impossible to reason about before.
 *
 * Everything is **stroked**, including the speaker, which used to be a filled
 * shape on a 16-unit box. Mixing fill and stroke is a second rendering mode
 * with its own weight story, and the sound toggle sitting beside a stroked
 * theme toggle and a stroked bell was the most visible instance of the problem
 * this module exists to end.
 *
 * ── What this replaces that was not an `<svg>` at all ──────────────────────
 *
 * Eight call sites drew a control with a **text glyph** — `✕` on both modals,
 * `▾` on the currency select, `▲`/`▼` on five price deltas. Those resolve in
 * whatever font the device supplies, which is exactly the risk v1.8.1 removed
 * from the app mark when it stopped being a system-font `<text>` glyph: on a
 * device whose stack lacks them the visitor gets a tofu box where the close
 * button should be. They are icons now.
 *
 * `ShareCanvas` is included in that, and it is the one that had to be measured
 * rather than reasoned about: it is rasterised by html2canvas, so an icon that
 * library declined to draw would leave a *blank* where a glyph used to be, in
 * an image somebody has already posted. Probed in Chromium against
 * html2canvas 1.4.1 — an inline `<svg>` at 24×24 rasterised to 46 lit pixels,
 * so it draws.
 *
 * **`api/lib/ogView.js` deliberately does not follow**, the same exception
 * `typography.js` records for the same surface. Satori draws that card, its
 * `▲`/`▼` are already inside the character set `ogImage.test.js` pins, and it
 * renders server-side in a function whose first constraint is that it must
 * never return nothing. Changing how it draws is a decision someone takes
 * deliberately, not a consequence of tidying the browser's icons.
 */

/** The one viewBox. Every path below is drawn in these units. */
export const ICON_VIEWBOX = '0 0 24 24'

/** The one stroke weight, in viewBox units. */
export const ICON_STROKE_WIDTH = 2

/**
 * The three rendered sizes. Kept to three deliberately: the five that existed
 * before were not five decisions, they were five defaults, and 13px next to
 * 14px is a difference nobody chose and nobody can see.
 *
 * `sm` is for icons that sit inline with `text-xs` (the price deltas, the
 * select chevron, the info dot), `md` for controls inside a card, `lg` for the
 * header cluster.
 */
export const ICON_SIZES = { sm: 12, md: 14, lg: 16 }

/**
 * The paths, keyed by name. Each entry is a list of SVG child elements as
 * `[tag, attrs]`, because a string of markup would need `dangerouslySetInnerHTML`
 * and a name that does not exist would then render silently — which is the
 * failure mode `icons.test.js` exists to make loud.
 */
export const ICON_PATHS = {
  // ── Header cluster ──────────────────────────────────────────────────────
  sun: [
    ['circle', { cx: 12, cy: 12, r: 4.5 }],
    ['path', { d: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' }],
  ],
  moon: [
    ['path', { d: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z' }],
  ],
  // Redrawn on the 24 box as strokes. The speaker cone is one closed path so
  // it reads as a solid object at 16px rather than as three loose lines.
  'volume-on': [
    ['path', { d: 'M4 9v6h3.5L13 19V5L7.5 9H4z' }],
    ['path', { d: 'M16.5 8.5a5 5 0 0 1 0 7' }],
    ['path', { d: 'M19.5 5.5a9 9 0 0 1 0 13' }],
  ],
  'volume-off': [
    ['path', { d: 'M4 9v6h3.5L13 19V5L7.5 9H4z' }],
    ['path', { d: 'M17 9.5l5 5M22 9.5l-5 5' }],
  ],
  share: [
    ['path', { d: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8' }],
    ['polyline', { points: '16 6 12 2 8 6' }],
    ['line', { x1: 12, y1: 2, x2: 12, y2: 15 }],
  ],
  bell: [
    ['path', { d: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' }],
    ['path', { d: 'M13.73 21a2 2 0 0 1-3.46 0' }],
  ],

  // ── In-card controls ────────────────────────────────────────────────────
  info: [
    ['circle', { cx: 12, cy: 12, r: 10.5 }],
    ['path', { d: 'M12 10v7M12 7v.5' }],
  ],
  close: [
    ['path', { d: 'M5 5l14 14M19 5L5 19' }],
  ],
  refresh: [
    ['path', { d: 'M21 12a9 9 0 1 1-2.64-6.36' }],
    ['polyline', { points: '21 3 21 9 15 9' }],
  ],
  spinner: [
    ['path', { d: 'M21 12a9 9 0 1 1-6.22-8.56' }],
  ],

  // ── Direction ───────────────────────────────────────────────────────────
  // The five price deltas and the select. Drawn as solid triangles rather than
  // chevrons because they replace ▲/▼ and the filled shape is what carries the
  // up/down reading at 12px beside a number.
  'triangle-up':   [['path', { d: 'M12 6l8 12H4z', fill: 'currentColor', stroke: 'none' }]],
  'triangle-down': [['path', { d: 'M12 18L4 6h16z', fill: 'currentColor', stroke: 'none' }]],
  'chevron-down':  [['polyline', { points: '5 9 12 16 19 9' }]],
}

export const ICON_NAMES = Object.keys(ICON_PATHS)

/**
 * ── The button shell ───────────────────────────────────────────────────────
 *
 * The header's round icon button was written out **four times** — in
 * `App.jsx`, `ShareButton.jsx`, `PriceAlertsButton.jsx` and `ThemeToggle.jsx` —
 * with the last one a fourth variant rather than a copy. Four hand-maintained
 * copies of a shell is the same arrangement that shipped two different brand
 * oranges, and it is why the buttons had drifted in the first place.
 *
 * Colour is deliberately **not** in here. The theme and sound toggles are
 * `text-quiet` and the share and alerts buttons are `text-accent`, which is a
 * real distinction — those two are actions, these two are settings — so
 * folding it in would either flatten it or need a variant per state.
 */
export const ICON_BUTTON =
  'flex items-center justify-center w-7 h-7 rounded-full transition-colors'

/**
 * The same shell for the two buttons that grow a text label at `md:`. Written
 * as the base plus its overrides so the two cannot drift on the half they
 * share, which is what happened to `md:gap-1.5` and the hover colours.
 */
export const ICON_BUTTON_LABELLED =
  `${ICON_BUTTON} md:w-auto md:h-auto md:gap-1.5 md:bg-raised md:px-3 md:py-1 ` +
  'md:text-xs md:font-semibold md:hover:bg-hover md:hover:text-accent'
