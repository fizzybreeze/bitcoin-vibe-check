import BeehiivEmbed from './BeehiivEmbed.jsx'

export default function NewsletterCard() {
  return (
    <div data-testid="newsletter-card" className="rounded-2xl bg-surface p-6 mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-quiet">Satoshi's Weekly Brief</h2>
      <p className="mt-3 text-lg font-bold text-ink">Bitcoin's mood, money, and mempool. Once a week. Free.</p>
      <p className="mt-1 text-xs text-quiet">Join the newsletter. Unsubscribe any time.</p>
      <div className="mt-4">
        <BeehiivEmbed />
      </div>
    </div>
  )
}
