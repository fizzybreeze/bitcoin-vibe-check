// Text alternatives for the things on this page that are drawn rather than
// written — the two sparklines and the difficulty bar.
//
// A recharts sparkline renders as an SVG with no title and no text, so a screen
// reader announces nothing at all: the reader is simply not told the number has
// a history. `role="img"` plus one of these strings makes the element a single
// labelled image, which is the standard pattern for a chart that has no
// interactive parts.
//
// The rule these follow is that the label carries the *information*, not the
// picture. "Sparkline" and "line chart showing the trend" describe the pixels
// and tell a reader nothing they could not already guess; the first and last
// readings, the direction and the range are what someone looking at the line
// actually takes from it. Pure and here rather than inline, on the `blockTime`
// precedent: these are presentation strings, and they are worth pinning.

function round(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/**
 * A sparkline's series as a sentence, or `null` when there is nothing to say.
 *
 * Returning `null` rather than "no data" is deliberate: both call sites already
 * render nothing at all when the series is empty, so a label describing an
 * absent chart would announce an element that is not there.
 */
export function describeTrend(name, values, { period = null, unit = '' } = {}) {
  const nums = (Array.isArray(values) ? values : []).filter(v => Number.isFinite(v))
  if (!nums.length) return null

  const first = nums[0]
  const last = nums[nums.length - 1]
  const low = Math.min(...nums)
  const high = Math.max(...nums)
  const direction = last > first ? 'rising' : last < first ? 'falling' : 'unchanged'

  const scope = period ? `${name} over ${period}` : name
  // The range is only worth saying when the line went somewhere its endpoints
  // do not already imply. For a series that rose steadily from 40 to 60,
  // "Low 40, high 60" repeats the sentence before it — which is filler in
  // print and an actual delay when it is being read aloud.
  const excursion = low < Math.min(first, last) || high > Math.max(first, last)
  const range = excursion ? ` Low ${round(low)}${unit}, high ${round(high)}${unit}.` : ''

  return `${scope}: ${round(first)}${unit} to ${round(last)}${unit}, ${direction}.${range}`
}

/**
 * The difficulty bar as a sentence.
 *
 * Not a series — one value on a fixed −10%…+10% scale — so it says where the
 * value sits *on that scale*, which is the whole content of a bar someone
 * cannot see. The cap is stated because the bar silently clamps beyond ±10%,
 * and a reader told only "12% faster" would picture a fuller bar than is drawn.
 */
export function describeDifficulty(change) {
  if (!Number.isFinite(change)) return 'Difficulty adjustment: not yet known.'
  const magnitude = `${Math.abs(change).toFixed(1)}%`
  if (change === 0) return 'Difficulty adjustment: unchanged, mid-way on a scale from 10% slower to 10% faster.'
  const way = change > 0 ? 'faster' : 'slower'
  const capped = Math.abs(change) > 10 ? ' At or beyond the end of the scale.' : ''
  return `Difficulty adjustment: ${magnitude} ${way}, on a scale from 10% slower to 10% faster.${capped}`
}
