export default function MobileSupportersCard({ donors }) {
  return (
    <div className="md:hidden rounded-2xl bg-gray-900 px-4 pt-4 pb-3 mt-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 text-center">OUR SUPPORTERS ⚡</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {donors.length > 0
          ? donors.map(d => (
              <span key={d.id} className="font-mono text-xs text-orange-400 bg-gray-800 rounded-full px-3 py-1">
                {d.name}
              </span>
            ))
          : <p className="text-xs text-gray-600">Be the first to support Bitcoin Vibe Check ⚡</p>
        }
      </div>
    </div>
  )
}
