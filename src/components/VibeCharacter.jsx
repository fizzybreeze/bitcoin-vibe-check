import { PALETTE } from '../lib/palette.js'
import useTheme from '../hooks/useTheme.js'
import { VIBE_BANDS } from '../lib/scales.js'
import {
  vibeCharacterFor, GRID_WIDTH, GRID_HEIGHT, CHARACTER_SIZES,
  FIGURE_TOKEN, figureTones, toneRuns,
} from '../lib/vibeCharacter.js'

/**
 * The Vibe Score character — a hooded, blank-faced figure standing in the
 * weather the score names. See `src/lib/vibeCharacter.js` for the artwork and
 * for why this is rects rather than a sprite.
 *
 * **The blank face is load-bearing, not just faithful to the anon statue it
 * nods at.** The rule this drawing has to obey is that the dashboard never
 * editorialises — §7 — and a figure with no face *cannot* carry an expression.
 * The invariant stops being something a test asserts about the grid and becomes
 * something the design cannot express.
 *
 * **`aria-hidden`**, inverting the `seriesLabel.js` precedent: the score and its
 * label are text directly beside this, so an alternative here makes a screen
 * reader say the same reading twice.
 */
export default function VibeCharacter({ label = null, className = '' }) {
  // An SVG `fill` takes a value, not a class, so this cannot read the
  // stylesheet — the hexes come from the palette for the theme that is on, the
  // same arrangement `ShareCanvas` and the sparklines already use.
  const { theme } = useTheme()
  const colors = PALETTE[theme]

  const grid = vibeCharacterFor(label)
  // The weather is the band's own token — the same one the label beside it
  // uses — so the picture and the word cannot end up different colours for the
  // same reading. With no reading there is no band, and it falls back to the
  // figure's own tone rather than inventing a colour for a day we could not
  // measure.
  const weather = colors[VIBE_BANDS[label]?.token] ?? colors[FIGURE_TOKEN]
  const tones = { ...figureTones(colors), o: weather }

  return (
    <svg
      viewBox={`0 0 ${GRID_WIDTH} ${GRID_HEIGHT}`}
      width={CHARACTER_SIZES.base}
      height={CHARACTER_SIZES.base}
      // crispEdges is what keeps a pixel grid a pixel grid; without it the
      // renderer antialiases every cell boundary and the artwork goes soft.
      shapeRendering="crispEdges"
      data-testid="vibe-character"
      data-vibe-character={label ?? 'none'}
      aria-hidden="true"
      // 96px is the floor and 128px is comfortable — measured by rasterising
      // the set, not chosen. `w-24`/`w-32` are 96 and 128 on Tailwind's scale,
      // and both divide the 32-cell grid whole.
      className={`shrink-0 w-24 h-24 md:w-32 md:h-32 ${className}`}
    >
      {toneRuns(grid).map(({ x, y, width, tone }) => (
        <rect
          key={`${x}-${y}`}
          x={x} y={y} width={width} height={1}
          fill={tones[tone] ?? tones.M}
        />
      ))}
    </svg>
  )
}
