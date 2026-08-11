import { ICON_PATHS, ICON_SIZES, ICON_VIEWBOX, ICON_STROKE_WIDTH } from '../lib/icons.js'

/**
 * The one place an `<svg>` is written in `src/`.
 *
 * Everything about how an icon is drawn — box, weight, size — comes from
 * `src/lib/icons.js`, so a call site chooses *which* icon and *how big*, and
 * nothing else. See that module for why those are the only two decisions left.
 *
 * **An unknown name throws rather than rendering nothing.** That is the whole
 * reason the registry holds elements rather than markup strings: a typo'd icon
 * name in a component is invisible — the control keeps its size, its label and
 * its click handler, and simply has no picture in it — and a blank button is
 * indistinguishable from a deliberately unadorned one. `icons.test.js` scans
 * every call site so this throw is a backstop and not the first line of
 * defence, but the backstop is cheap.
 *
 * Icons are `aria-hidden` by default. Every current call site sits inside a
 * control that already carries its own accessible name, and a `<title>` there
 * makes a screen reader say the thing twice — the same inversion of the
 * `seriesLabel.js` precedent the roadmap records for the Vibe character. Pass
 * `label` for the case where the icon genuinely is the only text alternative.
 */
export default function Icon({ name, size = 'md', label, className, style }) {
  const children = ICON_PATHS[name]
  if (!children) throw new Error(`Icon: unknown name "${name}"`)

  const px = ICON_SIZES[size]
  if (!px) throw new Error(`Icon: unknown size "${size}"`)

  return (
    <svg
      width={px}
      height={px}
      viewBox={ICON_VIEWBOX}
      // Which icon is drawn is often the whole assertion — a trend arrow says
      // "up" and nothing else on the element does — and these are `aria-hidden`
      // by design, so there is no role or name to query them by. Rendering the
      // name makes that assertable without inventing an accessible name that a
      // screen reader would then have to read out.
      data-icon={name}
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      {children.map(([Tag, attrs], i) => <Tag key={i} {...attrs} />)}
    </svg>
  )
}
