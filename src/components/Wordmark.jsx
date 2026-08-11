import { PALETTE } from '../lib/palette.js'
import useTheme from '../hooks/useTheme.js'
import {
  WORDMARK_WIDTH, WORDMARK_HEIGHT, WORDMARK_SIZES, wordmarkRuns,
} from '../lib/wordmark.js'

/**
 * The header wordmark, drawn rather than set. See `src/lib/wordmark.js` for the
 * alphabet and for why this is not a webfont.
 *
 * **`aria-hidden`, with the real text beside it.** The `<h1>` that wraps this
 * carries `Bitcoin Vibe Check` in an `sr-only` span, so the page still has a
 * level-1 heading with a name — which `dashboard.spec.js` has asserted since
 * v1.8.4 and which is the one thing a picture cannot supply on its own.
 *
 * **Two fills, not one.** `CHECK` is the accent, which is what makes this a
 * mark rather than a label; the line index comes from `wordmarkRuns` so the
 * split is a property of the wordmark rather than a slice taken here.
 *
 * `cell` is for `ShareCanvas`, which is rasterised by html2canvas at a fixed
 * size and has no breakpoints to respond to. Pass a whole number of pixels —
 * a fractional cell antialiases every edge and the letterforms go soft.
 */
export default function Wordmark({ cell = null, className = '' }) {
  // An SVG `fill` takes a value, not a class — the same arrangement
  // `VibeCharacter` and the sparklines already use.
  const { theme } = useTheme()
  const colors = PALETTE[theme]
  const fills = [colors.ink, colors.accent]

  const px = cell ?? WORDMARK_SIZES.base

  return (
    <svg
      viewBox={`0 0 ${WORDMARK_WIDTH} ${WORDMARK_HEIGHT}`}
      width={WORDMARK_WIDTH * px}
      height={WORDMARK_HEIGHT * px}
      // Without this the renderer antialiases every cell boundary and the
      // letterforms go soft — at a 3px cell that is most of the drawing.
      shapeRendering="crispEdges"
      data-testid="wordmark"
      aria-hidden="true"
      // Written out rather than composed, because Tailwind scans source text
      // and a computed class name is simply never generated. `wordmark.test.js`
      // asserts these four literals are the constants above times the two cell
      // sizes, which is what stops them drifting.
      className={`block ${cell == null ? 'w-[183px] h-[45px] md:w-[244px] md:h-[60px]' : ''} ${className}`}
    >
      {wordmarkRuns().map(({ x, y, width, line }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={width} height={1} fill={fills[line]} />
      ))}
    </svg>
  )
}
