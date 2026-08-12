import { markSvg } from '../../scripts/lib/mark.js'

/**
 * The app mark — the pixel-art ₿ on its accent tile, the same drawing the
 * favicon, the home-screen icon and the static preview card are rasterised
 * from.
 *
 * **It exists because `ShareCanvas` was still drawing a text glyph.** The
 * header there carried `<span>₿</span>` in whatever face the device supplied,
 * beside a wordmark that has been drawn rather than set since v1.11.0 — so an
 * exported image could pair a picture of the title with a *tofu box* where the
 * mark should be, on a device without U+20BF. That is the exact risk v1.8.1
 * removed from the icons, left behind on the one surface where it lands in
 * something somebody has already posted and cannot re-render.
 *
 * **`markSvg` rather than a second drawing in JSX**, which is the only reason
 * this file is three lines and an `innerHTML`. The radius is snapped to the
 * cell grid, the cell is rounded to a whole pixel and the artwork is centred on
 * what that leaves over — three geometry decisions that `mark.js` already makes
 * and that a hand-written component would have to make again and could make
 * differently. `generate-og-image.mjs` calls the same function for the same
 * reason. The markup is ours and carries no input from anywhere, so the
 * `innerHTML` is a rendering detail rather than a hole.
 *
 * `aria-hidden` because the `<h1>` beside it already names the product; the
 * mark says the same thing a second time in pictures.
 */
export default function Mark({ size = 28, coverage = 0.625, className = '' }) {
  return (
    <span
      className={className}
      style={{ display: 'flex', flexShrink: 0, lineHeight: 0 }}
      aria-hidden="true"
      data-testid="app-mark"
      dangerouslySetInnerHTML={{ __html: markSvg({ size, coverage }) }}
    />
  )
}
