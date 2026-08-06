// Temperature scale for the Vibe Score label — cold blues through to a hot red.
//
// Hex rather than Tailwind classes, because both consumers render outside the
// stylesheet: `ShareCanvas` is rasterised by html2canvas, and `api/og.js` is
// rasterised by Satori on a serverless function that never loads the CSS. The
// live card keeps its own Tailwind map — same palette, different medium.
export const VIBE_LABEL_HEX = Object.freeze({
  'Ice Cold':   '#38bdf8',
  'Cold':       '#22d3ee',
  'Cool':       '#2dd4bf',
  'Warm':       '#fbbf24',
  'Hot':        '#fb923c',
  'Overheated': '#f87171',
})

export const VIBE_LABEL_FALLBACK_HEX = '#6b7280'

export function vibeLabelHex(label) {
  return VIBE_LABEL_HEX[label] ?? VIBE_LABEL_FALLBACK_HEX
}

// Fear & Greed, keyed by the classification alternative.me sends rather than by
// the score. Their bands are theirs to move — 25 comes back as "Extreme Fear",
// which any sensible reading of a 0–100 scale would have put in the next band up
// — so a colour derived from the number contradicts the word printed beside it.
// Colour the label, and the two cannot disagree.
export const FNG_LABEL_HEX = Object.freeze({
  'Extreme Fear':  '#f87171',
  'Fear':          '#fbbf24',
  'Neutral':       '#facc15',
  'Greed':         '#a3e635',
  'Extreme Greed': '#4ade80',
})

// Null rather than a default: the callers want different fallbacks, and one of
// them can do better than a constant when the classification is missing.
export function fngLabelHex(label) {
  return FNG_LABEL_HEX[label] ?? null
}
