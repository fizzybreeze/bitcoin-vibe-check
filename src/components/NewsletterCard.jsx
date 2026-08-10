import BeehiivForm from './BeehiivForm.jsx'

export default function NewsletterCard() {
  return (
    <div className="rounded-2xl bg-surface p-6 mt-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-quiet">Satoshi's Weekly Brief</p>
      <p className="mt-3 text-lg font-bold text-ink">Bitcoin's mood, money, and mempool. Once a week. Free.</p>
      <p className="mt-1 text-xs text-quiet">Join the newsletter. Unsubscribe any time.</p>
      <div className="mt-4">
        <BeehiivForm />
      </div>
    </div>
  )
}
