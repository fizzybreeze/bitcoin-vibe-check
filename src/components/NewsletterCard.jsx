import BeehiivEmbed from './BeehiivEmbed.jsx'

export default function NewsletterCard() {
  return (
    <div className="rounded-2xl bg-gray-900 p-6 mt-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Satoshi's Weekly Brief</p>
      <p className="mt-3 text-lg font-bold text-white">Bitcoin's mood, money, and mempool. Once a week. Free.</p>
      <p className="mt-1 text-xs text-gray-500">Join the newsletter. Unsubscribe any time.</p>
      <div className="mt-4">
        <BeehiivEmbed />
      </div>
    </div>
  )
}
