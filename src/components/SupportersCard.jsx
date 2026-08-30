import { CARD, CARD_LABEL } from '../lib/typography.js'

/**
 * The sentence shown when nobody has donated yet. It is a constant, and that is
 * the whole reason this file exists rather than two: it was written out twice,
 * byte-identical, in two components of which **exactly one is ever on screen**.
 * Change it in one and the other disagrees — and because they never render
 * together, no visitor, no screenshot and no test would ever see the two
 * versions side by side. That is the shape of drift v1.8.7 found in the other
 * responsive-duplicate pair, where the two had already parted company.
 */
const SUPPORTERS_EMPTY = 'Be the first to support Bitcoin Vibe Check ⚡'

/**
 * Approved donor names, in the two presentations the widths want: a scrolling
 * marquee where there is room for one, and wrapped pills where there is not.
 *
 * Both layouts live **inside** one card, which is `HalvingCountdown`'s
 * arrangement rather than a departure from it. It is also not a walk-back of
 * v1.8.7's rule that a card must not hide itself: this card never hides — it
 * renders at every width and only its interior swaps, so it can still be moved
 * or reused without editing it.
 */
export default function SupportersCard({ donors }) {
  // The marquee translates a single span by its own width, so the names have to
  // appear twice or the strip runs out mid-loop.
  const content = donors.length
    ? `Proudly supported by Bitcoiners: ${donors.map(d => `⚡ ${d.name}`).join(' ')} ⚡   `
    : null

  return (
    // `lg:py-4` trims the card's own top/bottom padding a little at desktop
    // width: the card was measured at 1394×88px for one line of text, and
    // most of that height is the standard card padding rather than anything
    // the ticker needs. Below `lg:` this is still exactly `CARD`.
    <div className={`${CARD} lg:py-4`}>
      {/* At `lg:` the heading stops sitting above the ticker and sits beside
          it instead — one row rather than a short card with a label over it,
          which is what makes this read as a strip rather than as a card with
          nothing in it. Below `lg:` nothing here changes: the heading is
          still its own line, still centred on mobile. */}
      <div className="lg:flex lg:items-center lg:gap-4">
        <h2 className={`${CARD_LABEL} text-center md:text-left lg:shrink-0`}>Supporters ⚡</h2>

        {content == null ? (
          <p className="mt-2 lg:mt-0 font-mono text-xs text-quiet text-center md:text-left">{SUPPORTERS_EMPTY}</p>
        ) : (
          <>
            {/* Wide: one line, scrolling */}
            <div className="mt-2 lg:mt-0 lg:flex-1 relative w-full overflow-hidden hidden md:block">
              <span
                className="inline-block whitespace-nowrap font-mono text-xs text-accent py-1"
                style={{ animation: 'ticker-scroll 30s linear infinite', willChange: 'transform' }}
                onMouseEnter={e => { e.currentTarget.style.animationPlayState = 'paused' }}
                onMouseLeave={e => { e.currentTarget.style.animationPlayState = 'running' }}
              >
                {content}{content}
              </span>
            </div>

            {/* Narrow: wrapped pills */}
            <div className="mt-3 flex flex-wrap justify-center gap-2 md:hidden">
              {donors.map(d => (
                <span key={d.id} className="font-mono text-xs text-accent bg-raised rounded-full px-3 py-1">
                  {d.name}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
