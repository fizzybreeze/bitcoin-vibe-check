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
 * why `ogImage.test.js` pins the card's whole allowed character set and why
 * every string on the card avoids that character.
 *
 * **The title escaped this by ceasing to be text.** Since v1.11.0 the wordmark
 * is drawn from `src/lib/wordmark.js` and reaches Satori as an `<img>`, so the
 * preview card and the site show the same picture rather than the same words in
 * two faces. That is not a route the rest of the card can take — a price is a
 * number, not a mark — so this exception still stands for everything else.
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

/**
 * ── Class constants ────────────────────────────────────────────────────────
 *
 * The palette made colour a role. These make the two type treatments that
 * every card renders into roles as well, for the same reason and with the same
 * enforcement: `typography.test.js` fails the build on a hand-written copy.
 *
 * They are full literal strings rather than composed ones, deliberately.
 * Tailwind scans source *text*, so `text-${size}` generates no utility at all
 * and the element silently inherits its parent — the trap `scales.js` records
 * for the band ladders, met here in a second place.
 */

/**
 * A card's title, and every stat label inside it. This was copy-pasted
 * **36 times across 16 files**; exactly one call site had named it, and that
 * constant was local to `CycleIndicatorsCard.jsx` and unexported.
 *
 * The colour is part of it because it does not vary — all 36 were `text-quiet`,
 * byte-identical. That is the opposite of `ICON_BUTTON`, which deliberately
 * leaves colour out because settings and actions genuinely differ there.
 */
export const CARD_LABEL = 'text-xs font-semibold uppercase tracking-widest text-quiet'

/**
 * The smaller label tier, for a label inside a grid that is already inside a
 * card — today the Vibe Score breakdown and its sparkline caption.
 *
 * This existed as a bare `text-[10px] uppercase tracking-wider` in
 * `BtcPriceCard` and nowhere else, which is what an unnamed second scale looks
 * like. Naming it is the fix rather than deleting it: forcing those labels up
 * to `CARD_LABEL` would relayout a five-row two-column grid to remove a
 * distinction that is actually doing something. A tier that is written down is
 * a decision; the same tier used once and unnamed is drift.
 */
export const CARD_LABEL_SM = 'text-[10px] uppercase tracking-wider text-quiet'

/**
 * The figure a card exists to show. Five treatments served this role across
 * nineteen sites — `text-sm`, `text-lg`, `text-xl`, `text-2xl` and `text-3xl`,
 * with and without a responsive half — so which size a number got depended on
 * which card you were in rather than on what the number was for.
 *
 * These are **roles, not sizes**, which is what makes four of them defensible
 * where four arbitrary sizes would not be. `text-xl` is the one treatment that
 * survives as no role at all and therefore disappears.
 *
 * Weight and size only. Colour and `tabular-nums` stay at the call site: a
 * figure is `text-accent` or `text-ink` for reasons that have nothing to do
 * with its prominence, and `tabular-nums` belongs to whether it ticks.
 */
export const CARD_VALUE = {
  /** The one number a card is *for*. Only the Vibe Score qualifies today. */
  hero:  'text-3xl font-bold md:text-4xl',
  /** A card's headline figure — the BTC price, the 24h volume. */
  lead:  'text-2xl font-bold md:text-3xl',
  /** The ordinary card figure, and the default when in doubt. */
  base:  'text-2xl font-bold',
  /**
   * A figure in a multi-column strip, which has to give way on a phone. This
   * is the tier that stops `text-sm` being anybody's idea of a big number:
   * `NetworkHeartbeatCard` rendered the block height at 14px on mobile, which
   * is smaller than the label above it.
   */
  dense: 'text-lg font-bold md:text-2xl',
  /** A secondary figure sitting under another one. */
  tight: 'text-lg font-bold',
}

export const CARD_VALUE_TIERS = Object.keys(CARD_VALUE)

/**
 * ── The card shell ─────────────────────────────────────────────────────────
 *
 * Every card root already agreed on `rounded-2xl bg-surface`, which is why
 * that half is not the problem and is carried through unchanged. Padding was:
 * `p-6` ×7, `p-4 md:p-6` ×2, `p-4` ×2 and `px-4 pt-4 pb-3` ×2 — four schemes
 * across fifteen cards, none of them chosen against the others.
 *
 * **`p-4 md:p-6` is the one kept**, and it is the only aesthetic decision in
 * this module: it is what the two most recently written cards had already
 * converged on, and it is the mobile-first reading of a dashboard whose whole
 * promise is being read in five seconds without scrolling. Being wrong about
 * it is now a one-line revert rather than fifteen.
 */
export const CARD = 'rounded-2xl bg-surface p-4 md:p-6'

/**
 * A card does not know where it sits. Six roots baked their own `mt-4`/`mb-4`
 * into themselves while the rest relied on the grid's `gap-4`, and two baked
 * their own breakpoint visibility in — so a card could not be moved, or shown
 * at a different width, without editing the card. Those belong to the layout
 * that owns the card, and they live in `App.jsx` now.
 *
 * Exported as a name so `typography.test.js` can say what it is scanning for.
 */
export const CARD_ROOT_FORBIDDEN = /\b(m[tbxy]?-\d|hidden md:|md:hidden|lg:hidden|hidden lg:)/
