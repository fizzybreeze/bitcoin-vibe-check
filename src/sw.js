// The service worker source.
//
// This file exists because of a strategy switch: `vite.config.js` used to
// configure VitePWA with `generateSW`, where workbox writes the whole worker
// from a config block and there is no source file to hang a listener on.
// `push` and `notificationclick` are events, so real push notifications (§4.1)
// need a worker somebody wrote. That is the entire reason for the change —
// every line below the listeners is a faithful restatement of what generateSW
// was emitting, and nothing about caching or precaching is meant to move.
//
// Keep it wiring. Anything that decides something belongs in `src/lib/`, where
// it can be unit-tested; a service worker cannot be imported by vitest and is
// otherwise only exercisable by pushing to it from a real push service.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim } from 'workbox-core'

import { runtimeCaching } from './lib/runtimeCaching.js'
import { pushNotification, notificationTargetUrl, clientToFocus } from './lib/pushMessage.js'

// `registerType: 'autoUpdate'` is still set on the plugin, but under
// injectManifest it only generates the registration code on the page side —
// the worker's half of "take over immediately" is ours to write. Without these
// two lines a new build would sit in `waiting` until every tab closed, which
// on a dashboard people leave open is effectively never.
self.skipWaiting()
clientsClaim()

// `__WB_MANIFEST` is replaced by the build with the precache list — the one
// thing injectManifest does to this file.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Was `workbox.navigateFallback: '/index.html'`. No denylist, matching the
// generateSW default: the only non-page paths are fetched as XHR rather than
// navigated to, so they never reach a navigation route.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

// Was `workbox.runtimeCaching`, which took this same array. Every rule is
// NetworkFirst — `runtimeCaching.js` says why, and `pwaRuntimeCaching.test.js`
// holds it to that — so the strategy is read from the rule rather than
// hard-coded, and a rule that arrived with a different handler would fail the
// unit test before it ever reached here.
for (const rule of runtimeCaching) {
  const { cacheName, networkTimeoutSeconds, expiration, cacheableResponse } = rule.options
  registerRoute(
    rule.urlPattern,
    new NetworkFirst({
      cacheName,
      networkTimeoutSeconds,
      plugins: [
        new ExpirationPlugin(expiration),
        new CacheableResponsePlugin(cacheableResponse),
      ],
    })
  )
}

// ── Push ─────────────────────────────────────────────────────────────────────
//
// Nothing sends to these yet: there is no subscription table, no VAPID key and
// no evaluator. They land now because the strategy switch is what makes them
// possible at all, and a worker with no listener would leave the next change
// unable to tell a wiring bug from a sender bug.

self.addEventListener('push', event => {
  // `event.data` is null for a push sent with no payload, which is legal and
  // still has to show something — see `pushNotification`.
  let raw
  try {
    raw = event.data ? event.data.text() : undefined
  } catch {
    raw = undefined
  }
  const { title, options } = pushNotification(raw)
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = notificationTargetUrl(event.notification.data, self.location.origin)

  event.waitUntil((async () => {
    // `includeUncontrolled` matters on the first load after an update: a tab
    // opened before this worker took over is still the visitor's window.
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = clientToFocus(windowClients, url)
    if (existing) {
      await existing.focus()
      return
    }
    await self.clients.openWindow(url)
  })())
})
