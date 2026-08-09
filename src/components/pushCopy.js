// What the alerts panel's footer says about push, per state.
//
// A separate module on the `shareCards.js` / `seriesLabel.js` precedent, so
// `PriceAlertsPanel.jsx` only exports a component and fast refresh keeps
// working. Kept as data rather than a chain of ternaries in the JSX because the
// honest sentence differs in every state and the wrong one is worse than none:
// telling someone their alerts survive a closed tab when they do not is the
// single most misleading thing this panel could say. Exactly one state says the
// tab may be closed, and it is the one where that is true.

import {
  PUSH_BLOCKED, PUSH_FAILED, PUSH_FAIL_SERVICE, PUSH_FAIL_STORAGE, PUSH_LOADING,
  PUSH_OFF, PUSH_ON, PUSH_UNCONFIGURED, PUSH_UNSUPPORTED,
} from '../hooks/usePushSubscription.js'

// `unsupported` does not blame the browser. It is also what a service worker
// that failed to register looks like, and "your browser can't do this" is a
// dead end where "not available here" is merely accurate.
export const PUSH_COPY = {
  [PUSH_ON]:           'Alerts are pushed to this device, even with the tab closed. Your alert list is stored on the server so it can be checked while you are away.',
  [PUSH_OFF]:          'Alerts only fire while this tab is open. Turning on push stores your alert list on the server so it can be checked with the tab closed.',
  [PUSH_BLOCKED]:      'Alerts only fire while this tab is open, and push needs notification permission — currently blocked.',
  [PUSH_UNSUPPORTED]:  'Alerts only fire while this tab is open — push notifications are not available here.',
  [PUSH_UNCONFIGURED]: 'Alerts only fire while this tab is open — they are not push notifications.',
  [PUSH_LOADING]:      'Alerts only fire while this tab is open — they are not push notifications.',
}

// A failed attempt says what to do about it, which is the whole reason it is a
// state rather than a silent return to `off`. Granting notification permission
// and watching the toggle spring back with no explanation is indistinguishable
// from the toggle being broken — and it is not the visitor's mistake, so the
// copy names the setting rather than asking them to guess.
//
// Brave is named on purpose. It disables its push service by default (Settings
// → Privacy and security → "Use Google services for push messaging"), which
// makes `pushManager.subscribe()` reject *after* permission has been granted —
// the exact sequence that looks most like a bug in this panel.
export const PUSH_FAIL_COPY = {
  [PUSH_FAIL_SERVICE]: 'Alerts only fire while this tab is open — this browser refused to register for push. Brave and some other privacy browsers switch their push service off by default: look for “Use Google services for push messaging” in Settings → Privacy and security, then reload and try again.',
  [PUSH_FAIL_STORAGE]: 'Alerts only fire while this tab is open — push registered but could not be saved. That one is our end rather than yours; try again in a moment.',
}

/**
 * The footer sentence for a status, and a failure reason when there is one.
 *
 * Falls back to the tab-only caveat in every unknown case, deliberately: `App`
 * forgetting to pass the prop must never read as "you are covered".
 */
export function pushFooterCopy(status, failReason) {
  if (status === PUSH_FAILED) {
    return PUSH_FAIL_COPY[failReason] ?? PUSH_FAIL_COPY[PUSH_FAIL_SERVICE]
  }
  return PUSH_COPY[status] ?? PUSH_COPY[PUSH_UNCONFIGURED]
}
