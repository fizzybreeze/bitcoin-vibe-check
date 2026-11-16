// The caption under the MVRV figure, on the card and on the share image.
//
// BGeometrics' free tier publishes MVRV about a week behind: across every
// snapshot since September 2026 the newest data date trailed the capture date
// by exactly 7 days. Printed bare, "2026-11-09" on 16 November reads as a feed
// that stopped updating. Saying "data as of" makes the date a property of the
// figure rather than of the fetch, which is what it is.
//
// One function for both surfaces because the share image is posted and cannot
// be re-rendered, and two hand-written captions are two that can drift apart.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Spelled out rather than taken from toLocaleDateString, whose short month
// differs between ICU builds (September is "Sept" on some and "Sep" on others).
export function formatMvrvDate(value) {
  if (typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${day} ${MONTHS[month - 1]}`
}

/**
 * "Data as of 9 Nov", plus " · from daily snapshot" when the route served the
 * stored fallback. Null when there is no usable date, so the caller renders no
 * line rather than "Data as of null".
 */
export function mvrvCaption(date, source) {
  const formatted = formatMvrvDate(date)
  if (!formatted) return null
  return `Data as of ${formatted}${source === 'snapshot' ? ' · from daily snapshot' : ''}`
}
