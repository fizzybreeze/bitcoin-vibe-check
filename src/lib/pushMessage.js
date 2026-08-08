// What a `push` event turns into on screen, and where a click on it goes.
//
// Pure on purpose, on the `alertRules.js` / `mvrvFallback.js` precedent: the
// listeners in `src/sw.js` run in a service worker, which no unit test can
// import and which is otherwise only exercisable by pushing to a real endpoint
// from a real push service. Keeping the decisions here means the awkward cases
// — a push with no payload at all, a payload that is not JSON, a payload
// carrying a URL that is not ours — are assertions rather than hopes.
//
// The payload is written by whatever sends the push. Today that is nobody;
// §4.1b's evaluator will be the first sender. Treat it as untrusted input in
// the meantime, because a shape this module accepts today is a shape it has to
// keep accepting.

const DEFAULT_TITLE = 'Bitcoin Vibe Check'
const DEFAULT_BODY = 'A metric you are watching has crossed its alert level.'
const DEFAULT_PATH = '/'
const ICON = '/favicon.ico'

/**
 * The first candidate that is a non-blank string, trimmed.
 *
 * Not `a ?? b`: a payload field sent as `""` is present and useless, and `??`
 * would pass it straight through to `showNotification` as an empty title. That
 * is the same trap recorded in v1.6.5, v1.6.6 and v1.7.1 — this is the fourth
 * place it would have bitten.
 */
function firstText(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return ''
}

function parsePayload(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * A payload we could not read as JSON, offered as the notification body.
 *
 * Plain text is a legitimate push payload and reads perfectly well. Text that
 * *looks* like JSON and failed to parse is a sender bug, and showing the raw
 * braces to a visitor is worse than showing the generic line.
 */
function plainTextBody(raw) {
  const text = firstText(raw)
  if (!text || text.startsWith('{') || text.startsWith('[')) return ''
  return text
}

/**
 * The arguments for `registration.showNotification`, from a raw push payload.
 *
 * Always returns something renderable. A push event that resolves without
 * showing a notification is not silent — the browser substitutes its own
 * "This site has been updated in the background" — so there is no such thing
 * as declining to display one, only choosing what it says.
 */
export function pushNotification(raw) {
  const payload = parsePayload(raw)

  const title = firstText(payload?.title, DEFAULT_TITLE)
  const body = firstText(payload?.body, plainTextBody(raw), DEFAULT_BODY)
  // The alert rule's id, when the sender includes one, so a rule that fires
  // again replaces its own notification rather than stacking a second copy on
  // the lock screen. Omitted rather than defaulted: one shared tag would make
  // two different alerts firing together collapse into one.
  const tag = firstText(payload?.tag)
  const url = firstText(payload?.url)

  return {
    title,
    options: {
      body,
      icon: ICON,
      badge: ICON,
      // Read back by the `notificationclick` handler — `event.notification`
      // carries `data` across the gap between the two events, and nothing else
      // does.
      data: url ? { url } : {},
      ...(tag ? { tag } : {}),
    },
  }
}

/**
 * Where clicking a notification should land, as an absolute URL.
 *
 * Anything off-origin collapses to the dashboard. The payload is signed by
 * nothing this app can check, so a sender that is ever compromised would
 * otherwise turn a notification the visitor already trusts into an open
 * redirect — with the site's own icon beside it.
 */
export function notificationTargetUrl(data, origin) {
  const home = new URL(DEFAULT_PATH, origin).href
  const raw = firstText(data?.url)
  if (!raw) return home
  try {
    const url = new URL(raw, origin)
    return url.origin === new URL(origin).origin ? url.href : home
  } catch {
    return home
  }
}

/**
 * The already-open window a click should focus, or `null` to open a new one.
 *
 * Exact URL first, then any window on the same origin: this is a single-page
 * dashboard, so a tab already open on a different chart range is still the
 * window the visitor means, and opening a second copy of the app beside it is
 * the wrong answer.
 */
export function clientToFocus(windowClients, url) {
  if (!Array.isArray(windowClients) || windowClients.length === 0) return null

  let target
  try {
    target = new URL(url)
  } catch {
    return null
  }

  const parsed = windowClients
    .map(client => {
      try {
        return { client, url: new URL(client.url) }
      } catch {
        return null
      }
    })
    .filter(Boolean)

  const exact = parsed.find(c => c.url.href === target.href)
  if (exact) return exact.client

  const sameOrigin = parsed.find(c => c.url.origin === target.origin)
  return sameOrigin ? sameOrigin.client : null
}
