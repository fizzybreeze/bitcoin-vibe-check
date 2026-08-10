export default function MobileSupportersCard({ donors }) {
  return (
    <div className="md:hidden rounded-2xl bg-surface px-4 pt-4 pb-3 mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-quiet text-center">OUR SUPPORTERS ⚡</h2>
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
