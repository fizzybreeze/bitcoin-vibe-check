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
