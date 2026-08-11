import { CARD, CARD_LABEL } from '../lib/typography.js'
export default function MobileSupportersCard({ donors }) {
  return (
    <div className={CARD}>
      <h2 className={`${CARD_LABEL} text-center`}>Our Supporters ⚡</h2>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {donors.length > 0
          ? donors.map(d => (
              <span key={d.id} className="font-mono text-xs text-accent bg-raised rounded-full px-3 py-1">
                {d.name}
              </span>
            ))
          : <p className="text-xs text-quiet">Be the first to support Bitcoin Vibe Check ⚡</p>
        }
      </div>
    </div>
  )
}
