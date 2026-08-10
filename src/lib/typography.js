/**
 * The type decision, and the one place it is written down.
 *
 * Until now there was no `--font-*` token and no `font-family` declaration
 * anywhere in the app, so the entire UI ran on Tailwind's default stack by
 * *inheritance rather than by decision* — and two export surfaces had quietly
 * hand-written stacks of their own that agreed with it for three families and
 * then diverged.
 *
 * This is the palette problem in a second notation, so it gets the palette's
 * answer: one module that JavaScript can read, mirrored by `@theme` tokens that
 * Tailwind can read, with `typography.test.js` asserting across the pair. The
 * duplication is unavoidable for the same reason — Tailwind reads only a
 * stylesheet, and `ShareCanvas` (rasterised by html2canvas) and `ShareModal`
 * (styled inline throughout) read only JavaScript.
 *
 * ── The decision ───────────────────────────────────────────────────────────
 *
 * **The platform's own UI face, deliberately, rather than a display face.**
 * This is a choice with arguments rather than the absence of one, and the
 * arguments are §1's filters:
 *
 * - **Free to run, and the precache is already 1.17 MB.** A display face is two
 *   files minimum (regular and bold) before it renders a single character of
 *   this dashboard, on a page whose whole promise is being read in five seconds.
 * - **Tabular figures have to exist, and here they already do.** Every figure on
 *   this page updates without a reload, so `tabular-nums` is not a refinement —
 *   it is what stops the layout jittering on each tick. SF, Segoe UI and Roboto
 *   all carry real tabular figures; a webfont has to be checked for them, and
 *   that check is easy to skip and invisible when skipped. The dependency is
 *   real in both directions: measured in the CI container, which resolves none
 *   of those three and falls through to a generic sans with no `tnum` table,
 *   "111111" and "888888" render **6px apart even with the property set**. So
 *   the jitter is genuine, and a face without tabular figures simply cannot fix
 *   it — which is exactly why the requirement is written down here rather than
 *   left as taste.
 * - **Two export surfaces would each need the file supplied.** Satori takes font
 *   buffers at request time in a serverless function that must never fail
 *   (`api/og.js` constraint 1), and html2canvas needs the face actually loaded
 *   in the document before it rasterises. Adopting a face means doing both, or
 *   the preview card and the share image drift away from the site with nothing
 *   failing to say so.
 * - **The mark already carries the brand.** The distinctiveness argument for a
 *   display face was strongest when the logo was a system-font `<text>` glyph.
 *   Since v1.8.1 it is a pixel grid this repo owns, so the identity does not
 *   rest on the typeface any more.
 *
 * **None of that is permanent, and making it cheap to reverse is half the
 * point.** Swapping to a display face is now this file plus the mirrored block
 * in `index.css` — not a hunt through fifteen components — with the standing
 * requirement that whatever is chosen must carry tabular figures and must be
 * supplied to Satori and html2canvas in the same change.
 *
 * The values below are what was already in force. That is the point rather than
 * a shortcut: nothing about the app's appearance changes here, which is what
 * lets the visual baselines stay meaningful while the *ownership* of the
 * decision moves into the repo.
 */

/**
 * `sans` is Tailwind v4's own default, restated. The emoji families at the tail
 * are load-bearing rather than decorative — the supporter cards render "⚡" and
 * the share image rasterises whatever the document resolves for it, and both
 * hand-written stacks this replaces had dropped them.
 */
export const FONT_STACKS = {
  sans:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', " +
    "'Noto Sans', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', " +
    "'Segoe UI Symbol', 'Noto Color Emoji'",
  mono:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, " +
    "'Liberation Mono', 'Courier New', monospace",
}

export const FONT_ROLES = Object.keys(FONT_STACKS)

/**
 * The one surface that deliberately does **not** follow, recorded here rather
 * than left to be rediscovered.
 *
 * `api/lib/ogView.js` draws on Satori's bundled Geist. We do not supply that
 * font and cannot reach it from the browser, it has no weight axis (its
 * hierarchy is size and letter-spacing alone) and it has no U+20BF — which is
 * why `ogImage.test.js` pins the card's whole allowed character set and why the
 * card spells "Bitcoin" out rather than drawing a ₿.
 *
 * Changing this means shipping font buffers into a serverless function whose
 * first constraint is that it must never return nothing. That is a real change
 * with a real failure mode, not a tidy-up, so it is a decision someone takes
 * deliberately — and `typography.test.js` asserts this exception still describes
 * reality, because an exemption nobody re-checks is how a list rots.
 */
export const SATORI_FONT_FAMILY = 'Geist'

/**
 * Figures that change without a page reload need tabular figures, because
 * proportional ones are different widths — a price ticking 100,111 → 100,888
 * reflows the row it is in, on every tick, all day.
 *
 * Exported as a constant so the rule is greppable and so
 * `typography.test.js` can hold the cards that render live figures to it. It is
 * the Tailwind utility rather than the CSS, because that is what the components
 * take.
 */
export const TABULAR = 'tabular-nums'
