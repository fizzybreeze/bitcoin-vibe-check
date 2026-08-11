import BeehiivEmbed from './BeehiivEmbed.jsx'
import { CARD, CARD_LABEL } from '../lib/typography.js'

export default function NewsletterCard() {
  return (
    <div data-testid="newsletter-card" className={CARD}>
      <h2 className={CARD_LABEL}>Satoshi's Weekly Brief</h2>
      <p className="mt-3 text-lg font-bold text-ink">Bitcoin's mood, money, and mempool. Once a week. Free.</p>
      <p className="mt-1 text-xs text-quiet">Join the newsletter. Unsubscribe any time.</p>
      <div className="mt-4">
        <BeehiivEmbed />
      </div>
    </div>
  )
}
