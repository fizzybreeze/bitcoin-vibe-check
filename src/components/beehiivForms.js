import { DEFAULT_THEME, resolveTheme } from '../lib/palette.js'

// The two beehiiv signup forms — one per theme — and the loader that fetches
// them. Separate from the component so that file exports only a component, on
// the `shareCards.js` / `pushCopy.js` precedent.
//
// **Why there are two.** The v3 loader injects the signup as a cross-origin
// iframe from beehiiv's own origin, so no stylesheet, no `@theme` token and no
// `.dark` class of ours reaches inside it. That is not a difficulty to be
// engineered around, it is the same-origin policy — and this repo already
// depends on the iframe being real, since `useDialogFocus` keeps `iframe` in
// its focusable selector precisely because this is one. §3.5 read that as
// "capped at one fixed appearance against two grounds", which was true only
// while there was one form. Two forms, each styled in beehiiv's own designer,
// with the id chosen from `useTheme`, is the only arrangement that follows the
// toggle without holding an API key.
//
// **The colours live in beehiiv's dashboard**, set to the `surface`, `ink`,
// `quiet`, `line`, `accent-fill` and `accent-ink` values of the matching half
// of `palette.js`. They are not repeated here — not as a constant and not as a
// comment, because `palette.test.js` fails the build on a raw hex anywhere in
// `src/` and a comment is not an exception to that.
//
// **What no gate in this repo can see.** A test can prove the right id is
// requested for the current theme, and the ones in `SidebarCards.test.jsx` do.
// Nothing here can see whether the form *behind* that id is actually styled to
// match, because those colours are in someone else's dashboard. Changing one
// form's palette without the other is therefore a silent regression, visible
// only by loading the page in both themes. That is the price of not holding an
// API key, and it is worth paying rather than pretending otherwise.

export const BEEHIIV_LOADER_SRC = 'https://subscribe-forms.beehiiv.com/v3/loader.js'

/** One form per theme. Both feed the same publication. */
export const BEEHIIV_FORM_IDS = Object.freeze({
  dark: '2bdf510d-bf28-431d-890b-651039133eeb',
  light: '27b07f08-c796-4511-aae6-2a5ff1bd47da',
})

/**
 * The form to load for a theme.
 *
 * Falls back rather than returning undefined, which is the failure worth
 * guarding: `data-beehiiv-form="undefined"` is a loader that renders nothing at
 * all, in a card that still says "Join the newsletter" above the gap. A theme
 * this app has but has no form for is the way that happens — `resolveTheme`
 * only screens names that are not themes.
 */
export function beehiivFormId(theme) {
  return BEEHIIV_FORM_IDS[resolveTheme(theme)] ?? BEEHIIV_FORM_IDS[DEFAULT_THEME]
}
