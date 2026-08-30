import BeehiivEmbed from './BeehiivEmbed.jsx'
import { CARD, CARD_LABEL } from '../lib/typography.js'

export default function NewsletterCard() {
  return (
    <div data-testid="newsletter-card" className={CARD}>
      <h2 className={CARD_LABEL}>Satoshi's Weekly Brief</h2>
      <p className="mt-3 text-lg font-bold text-ink">Bitcoin's mood, money, and mempool. Once a week. Free.</p>
      <p className="mt-1 text-xs text-quiet">Join the newsletter. Unsubscribe any time.</p>
      {/* Capped so the form doesn't run the full card width at desktop — the
          same reasoning as the donation card's name field, applied to a form
          this app does not draw. beehiiv's loader injects a cross-origin
          iframe (see `BeehiivEmbed.jsx`'s header), so this can only constrain
          the *container* the iframe sits in; it cannot reach the input inside
          it, which is styled from beehiiv's own origin. */}
      <div className="mt-4 lg:max-w-md">
        <BeehiivEmbed />
      </div>
    </div>
  )
}
