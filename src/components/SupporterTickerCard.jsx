export default function SupporterTickerCard({ donors }) {
  const content = donors.length
    ? `Proudly supported by Bitcoiners: ${donors.map(d => `⚡ ${d.name}`).join(' ')} ⚡   `
    : null
  return (
    <div className="hidden md:block rounded-2xl bg-surface px-4 pt-4 pb-3 mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-quiet mb-2">Supporters ⚡</h2>
      {content ? (
        <div className="relative w-full overflow-hidden">
          <span
            className="inline-block whitespace-nowrap font-mono text-xs text-accent py-1"
            style={{ animation: 'ticker-scroll 30s linear infinite', willChange: 'transform' }}
            onMouseEnter={e => { e.currentTarget.style.animationPlayState = 'paused' }}
            onMouseLeave={e => { e.currentTarget.style.animationPlayState = 'running' }}
          >
            {content}{content}
          </span>
        </div>
      ) : (
        <p className="font-mono text-xs text-quiet py-1">Be the first to support Bitcoin Vibe Check ⚡</p>
      )}
    </div>
  )
}
