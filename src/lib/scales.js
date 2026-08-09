// Every band scale in the app, in one place, answering in both notations.
//
// Before this file there were six of these and every one existed two or three
// times: the Vibe ladder as Tailwind classes in `BtcPriceCard` and as hex in
// `vibePalette.js`; Fear & Greed in those two *plus* a numeric fallback ladder
// in `ogView.js`; MVRV in `CycleIndicatorsCard` and again in `ShareCanvas`
// with **different colours for the same five bands**; congestion in
// `NetworkFeesCard` and again in `ShareCanvas`; block time in `blockTime.js`.
//
// They were duplicated because the live cards need a Tailwind class and the
// canvas and Satori renderers need a hex string, and a class cannot become a
// hex. So each band here carries both: the class it is drawn with on screen,
// and the palette token the hex is read from. `scales.test.js` asserts the two
// agree for every band, which is what stops the MVRV disagreement recurring in
// a form nobody notices — a share image is looked at once, by the person who
// posted it, after they have stopped comparing it to the card.
//
// The classes are written as complete literals rather than composed from the
// token name. Tailwind scans source text for class names; `text-${token}` is
// invisible to it and the utility would simply never be generated, which does
// not fail a build and does not fail a unit test — it renders as inherited
// colour, on a card nobody screenshots.

import { token } from './palette.js'

const band = (label, name, extra = {}) => ({ label, token: name, ...extra })

// ── The Vibe Score temperature ladder ────────────────────────────────────────
// Keyed by the label `computeVibeLabel` produces, not by the score, so the
// colour and the word can never disagree — the rule Fear & Greed learned the
// hard way in v1.6.0.
export const VIBE_BANDS = Object.freeze({
  'Ice Cold':   band('Ice Cold',   'vibe-ice',        { text: 'text-vibe-ice' }),
  'Cold':       band('Cold',       'vibe-cold',       { text: 'text-vibe-cold' }),
  'Cool':       band('Cool',       'vibe-cool',       { text: 'text-vibe-cool' }),
  'Warm':       band('Warm',       'vibe-warm',       { text: 'text-vibe-warm' }),
  'Hot':        band('Hot',        'vibe-hot',        { text: 'text-vibe-hot' }),
  'Overheated': band('Overheated', 'vibe-overheated', { text: 'text-vibe-overheated' }),
})

/** Falls back to the muted tier: an unknown label is missing data, not a reading. */
export const vibeLabelClass = (label) => VIBE_BANDS[label]?.text ?? 'text-muted'
export const vibeLabelHex = (label, theme) => token(VIBE_BANDS[label]?.token ?? 'muted', theme)

// ── Fear & Greed ─────────────────────────────────────────────────────────────
// Keyed by the classification alternative.me sends rather than by the number.
// Their bands are theirs to move — 25 comes back as "Extreme Fear", which any
// sensible reading of a 0–100 scale would have put in the next band up — so a
// colour derived from the number contradicts the word printed beside it.
export const FNG_BANDS = Object.freeze({
  'Extreme Fear':  band('Extreme Fear',  'fng-extreme-fear',  { text: 'text-fng-extreme-fear' }),
  'Fear':          band('Fear',          'fng-fear',          { text: 'text-fng-fear' }),
  'Neutral':       band('Neutral',       'fng-neutral',       { text: 'text-fng-neutral' }),
  'Greed':         band('Greed',         'fng-greed',         { text: 'text-fng-greed' }),
  'Extreme Greed': band('Extreme Greed', 'fng-extreme-greed', { text: 'text-fng-extreme-greed' }),
})

export const fngLabelClass = (label) => FNG_BANDS[label]?.text ?? 'text-quiet'

/** Null rather than a default: `ogView` can do better than a constant here. */
export const fngLabelHex = (label, theme) =>
  FNG_BANDS[label] ? token(FNG_BANDS[label].token, theme) : null

/**
 * Fear & Greed from the score, for the one caller that may not have the word.
 *
 * Only reached when the classification is missing — the label is preferred
 * everywhere it exists, for the reason above. The thresholds mirror
 * alternative.me's own published bands rather than being chosen here.
 */
export function fngScoreHex(score, theme) {
  if (!Number.isFinite(score)) return null
  const name =
    score <= 25 ? 'fng-extreme-fear'
    : score <= 46 ? 'fng-fear'
    : score <= 54 ? 'fng-neutral'
    : score <= 75 ? 'fng-greed'
    : 'fng-extreme-greed'
  return token(name, theme)
}

// ── Block time ───────────────────────────────────────────────────────────────
// The accent is the "on target" state: ~10 minutes is what difficulty adjusts
// to. Faster reads as the up signal, slower as the down signal.
const BLOCK_TIME_TARGET = { text: 'text-accent', bg: 'bg-accent', token: 'accent' }
const BLOCK_TIME_FAST   = { text: 'text-up',     bg: 'bg-up',     token: 'up' }
const BLOCK_TIME_SLOW   = { text: 'text-down',   bg: 'bg-down',   token: 'down' }

export function blockTimeBand(mins) {
  if (mins == null || (mins >= 9 && mins <= 11)) return BLOCK_TIME_TARGET
  return mins < 9 ? BLOCK_TIME_FAST : BLOCK_TIME_SLOW
}

// ── Mempool congestion ───────────────────────────────────────────────────────
// Read from the mempool's virtual size. Not to be confused with
// `computeMempoolPressurePct`, which feeds the Vibe Score's congestion
// dimension from the transaction *count* — two measures of the same queue, so
// the percentage drawn here is not the one inside the score.
const CONGESTION_BANDS = Object.freeze([
  { max: 5_000_000,  label: 'Low',      text: 'text-up',   bar: 'bg-up',   token: 'up' },
  { max: 50_000_000, label: 'Moderate', text: 'text-warn', bar: 'bg-warn', token: 'warn' },
  { max: Infinity,   label: 'High',     text: 'text-down', bar: 'bg-down', token: 'down' },
])

export function congestionBand(vsize) {
  if (vsize == null) return null
  // `<` for the first boundary and `<=` for the second, preserving the exact
  // thresholds the two implementations this replaces both used.
  if (vsize < CONGESTION_BANDS[0].max) return CONGESTION_BANDS[0]
  return vsize <= CONGESTION_BANDS[1].max ? CONGESTION_BANDS[1] : CONGESTION_BANDS[2]
}

// ── MVRV ─────────────────────────────────────────────────────────────────────
// The five bands the live card has always drawn. `ShareCanvas` drew the same
// five in a completely different five colours; it now reads this, so the card
// and the image finally agree about what "Overvalued" looks like.
const MVRV_BANDS = Object.freeze([
  { max: 1,        label: 'Deeply Undervalued',    text: 'text-up',    token: 'up' },
  { max: 1.5,      label: 'Undervalued',           text: 'text-up',    token: 'up' },
  { max: 2.4,      label: 'Fair Value',            text: 'text-muted', token: 'muted' },
  { max: 3.7,      label: 'Overvalued',            text: 'text-down',  token: 'down' },
  { max: Infinity, label: 'Extremely Overvalued',  text: 'text-down',  token: 'down' },
])

export function mvrvBand(mvrv) {
  if (mvrv == null) return null
  return MVRV_BANDS.find(b => mvrv < b.max) ?? MVRV_BANDS[MVRV_BANDS.length - 1]
}

// ── Power law deviation ──────────────────────────────────────────────────────
// Percent above or below the model's fair value. The middle band is the muted
// tier rather than a colour, because "near fair value" is the absence of a
// reading — the same reason MVRV's "Fair Value" is muted.
export function powerLawBand(pct) {
  if (!Number.isFinite(pct)) return null
  if (pct > 20)  return { text: 'text-warn',  token: 'warn' }
  if (pct > -20) return { text: 'text-muted', token: 'muted' }
  return { text: 'text-up', token: 'up' }
}

/** Every band any scale can produce — the mirror test walks this. */
export const ALL_BANDS = Object.freeze([
  ...Object.values(VIBE_BANDS),
  ...Object.values(FNG_BANDS),
  BLOCK_TIME_TARGET, BLOCK_TIME_FAST, BLOCK_TIME_SLOW,
  ...CONGESTION_BANDS,
  ...MVRV_BANDS,
  { text: 'text-warn', token: 'warn' },
  { text: 'text-muted', token: 'muted' },
  { text: 'text-up', token: 'up' },
])
