// Render tests for the five cards extracted out of App.jsx in #22, and the
// block-time band two of them share. They had no unit coverage while
// they lived in App.jsx — nothing there is importable without the whole file —
// so making them cheap to exercise is most of what the extraction buys.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import NetworkPulseCard from '../NetworkPulseCard.jsx'
import NetworkHeartbeatCard from '../NetworkHeartbeatCard.jsx'
import RecentBlocksCard from '../RecentBlocksCard.jsx'
import HalvingCountdown from '../HalvingCountdown.jsx'
import VolumeCard from '../VolumeCard.jsx'
import { blockTimeBand } from '../../lib/scales.js'

// Both block-fetching cards call mempool.space on mount. Stub it so the tests
// stay hermetic; the resolved shape is per-test where it matters.
function stubFetch(json) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(json) })))
}

beforeEach(() => stubFetch({}))
// RTL auto-cleans (globals: true), but unmounting explicitly here keeps it
// ordered before the unstub rather than relying on hook registration order —
// these cards abort an in-flight fetch on unmount.
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('blockTimeBand', () => {
  it('reads on-target (9–11 min) as the accent', () => {
    expect(blockTimeBand(10).text).toBe('text-accent')
    expect(blockTimeBand(9).text).toBe('text-accent')
    expect(blockTimeBand(11).text).toBe('text-accent')
  })

  it('reads faster than target as the up signal and slower as the down signal', () => {
    expect(blockTimeBand(8.9).text).toBe('text-up')
    expect(blockTimeBand(11.1).text).toBe('text-down')
  })

  it('falls back to the accent when the average is unknown', () => {
    expect(blockTimeBand(null).text).toBe('text-accent')
  })

  it('keeps text and bg on the same colour', () => {
    for (const mins of [null, 5, 10, 20]) {
      const { text, bg } = blockTimeBand(mins)
      expect(text.replace('text-', '')).toBe(bg.replace('bg-', ''))
    }
  })
})

describe('NetworkPulseCard', () => {
  // Accessibility (roadmap §5). The difficulty bar is two coloured divs — there
  // is no text in it at all, so without a label a screen reader is told nothing
  // about an adjustment the sighted reader can see at a glance.
  it('gives the difficulty bar a label that carries the reading', () => {
    render(<NetworkPulseCard difficulty={{ difficultyChange: 3.2, remainingBlocks: 1008 }} loading={false} hashRateTrend={null} />)
    const bar = screen.getByRole('img', { name: /Difficulty adjustment/ })
    expect(bar.getAttribute('aria-label')).toContain('3.2% faster')
    expect(bar.getAttribute('aria-label')).toContain('scale from 10% slower to 10% faster')
  })

  it('hides the Slower/Faster captions from the label that already says them', () => {
    render(<NetworkPulseCard difficulty={{ difficultyChange: 3.2, remainingBlocks: 1008 }} loading={false} hashRateTrend={null} />)
    // Present visually, but not announced twice.
    expect(screen.getByText('Slower').closest('[aria-hidden="true"]')).toBeTruthy()
  })

  it('renders the difficulty adjustment and its interpretation', () => {
    render(<NetworkPulseCard difficulty={{ difficultyChange: 3.2, remainingBlocks: 1008 }} loading={false} hashRateTrend={null} />)
    expect(screen.getByText('+3.2%')).toBeTruthy()
    expect(screen.getByText('Miners Speeding Up')).toBeTruthy()
    expect(screen.getByText(/in 1,008 blocks/)).toBeTruthy()
  })

  it('says Unavailable rather than 0% when difficulty is missing', () => {
    render(<NetworkPulseCard difficulty={null} loading={false} hashRateTrend={null} />)
    expect(screen.getByText('Unavailable')).toBeTruthy()
  })

  // The 30-day trend line is gated behind the hash rate having arrived, so a
  // stubbed-empty fetch never reaches it. This is the card's only conditional
  // colour, which makes it the part most worth pinning.
  it('renders the hash rate and its 30d trend once the fetch lands', async () => {
    stubFetch({ currentHashrate: 812e18 })
    const { container } = render(<NetworkPulseCard difficulty={null} loading={false} hashRateTrend={4.25} />)
    expect(await screen.findByText('812.0')).toBeTruthy()
    expect(screen.getByText(/\+4\.3% \(30d\)/)).toBeTruthy()
    // The direction used to be a `▲` inside the text node, so the regex above
    // carried it. It is an icon now, and `aria-hidden` — so the arrow is
    // asserted by the name it renders rather than by a character a device
    // without the glyph would have drawn as a tofu box anyway.
    expect(container.querySelector('[data-icon="triangle-up"]')).toBeTruthy()
  })

  it('marks a falling hash-rate trend red rather than green', async () => {
    stubFetch({ currentHashrate: 812e18 })
    const { container } = render(<NetworkPulseCard difficulty={null} loading={false} hashRateTrend={-4.25} />)
    const trend = await screen.findByText(/-4\.3% \(30d\)/)
    expect(trend.className).toContain('text-down')
    expect(container.querySelector('[data-icon="triangle-down"]')).toBeTruthy()
  })
})

describe('NetworkHeartbeatCard', () => {
  it('renders block height and average block time', () => {
    render(<NetworkHeartbeatCard blockHeight={912345} difficulty={{ timeAvg: 600000 }} lastBlockTs={null} loading={false} />)
    expect(screen.getByText('912,345')).toBeTruthy()
    expect(screen.getByText('10.0 min')).toBeTruthy()
  })

  it('says the last block is unknown rather than showing 0 min ago', () => {
    render(<NetworkHeartbeatCard blockHeight={912345} difficulty={null} lastBlockTs={null} loading={false} />)
    expect(screen.getByText('Last block: unknown')).toBeTruthy()
  })
})

describe('the heartbeat interior is drawn once, not twice', () => {
  // It is rendered in two frames — as its own card on mobile, and merged into
  // the top of `RecentBlocksCard` on desktop — and it used to be *written* in
  // both. Because each is hidden at the width where the other shows, a class
  // that drifted in one was invisible from either side: v1.8.7 found exactly
  // that, with the mobile copy at `text-sm` and the desktop copy carrying the
  // same class in a subtree that could never render at that width.
  //
  // Comparing the rendered markup rather than asserting a class each is what
  // makes this survive the next change to it: any divergence at all, in any
  // element, fails — including one nobody thought to name.
  const props = { blockHeight: 912345, difficulty: { timeAvg: 642000 }, lastBlockTs: 1_700_000_000, loading: false }

  function heartbeatOf(element) {
    const { container } = render(element)
    const node = container.querySelector('[data-testid="network-heartbeat"]')
    expect(node, 'no heartbeat rendered').toBeTruthy()
    return node.outerHTML
  }

  it('renders byte-identical markup in the standalone card and the merged header', () => {
    stubFetch([])
    const standalone = heartbeatOf(<NetworkHeartbeatCard {...props} />)
    const merged = heartbeatOf(<RecentBlocksCard {...props} />)
    expect(merged).toBe(standalone)
    // Non-vacuous: the comparison is worthless if it is comparing two empty
    // shells, so pin that the markup actually carries the readings.
    expect(standalone).toContain('912,345')
    expect(standalone).toContain('10.7 min')
  })

  it('carries the same skeletons through the loading state in both frames', () => {
    // The loading branch is the half a happy-path comparison never reaches, and
    // it is three separate conditionals deep in the markup.
    stubFetch([])
    const standalone = heartbeatOf(<NetworkHeartbeatCard {...props} loading />)
    const merged = heartbeatOf(<RecentBlocksCard {...props} loading />)
    expect(merged).toBe(standalone)
    expect(standalone).not.toContain('912,345')
  })
})

describe('RecentBlocksCard', () => {
  // The card renders the chain tip twice: once in the desktop heartbeat header
  // it merges in, and once per fetched block. jsdom applies no Tailwind, so
  // `hidden lg:block` hides nothing here and both are queryable. The fixture
  // height is therefore deliberately different from the `blockHeight` prop —
  // with them equal, awaiting the height resolves against the header before the
  // fetch has landed, and the test passes with a fetch that never resolves.
  it('renders a fetched block with its height, tx count and fees', async () => {
    stubFetch([{ id: 'abc', height: 912344, tx_count: 3210, timestamp: Math.floor(Date.now() / 1000) - 120, extras: { totalFees: 12_500_000, avgFeeRate: 7 } }])
    render(<RecentBlocksCard blockHeight={912345} difficulty={{ timeAvg: 600000 }} lastBlockTs={null} loading={false} />)
    // Awaited on the tx count, which exists only once the fetch has resolved.
    expect(await screen.findByText('3,210 txs')).toBeTruthy()
    expect(screen.getByText('912,344')).toBeTruthy()
    expect(screen.getByText('0.125 BTC in fees')).toBeTruthy()
    expect(screen.getByText('avg 7 sat/vB')).toBeTruthy()
    expect(screen.getByText('2 min ago')).toBeTruthy()
  })

  it('links each block to its mempool.space page', async () => {
    stubFetch([{ id: 'deadbeef', height: 912344, tx_count: 1, timestamp: Math.floor(Date.now() / 1000), extras: null }])
    render(<RecentBlocksCard blockHeight={912345} difficulty={null} lastBlockTs={null} loading={false} />)
    const link = await screen.findByRole('link', { name: '912,344' })
    expect(link.getAttribute('href')).toBe('https://mempool.space/block/deadbeef')
  })

  it('renders the merged heartbeat header from its own props, not the block list', () => {
    render(<RecentBlocksCard blockHeight={912345} difficulty={{ timeAvg: 720000 }} lastBlockTs={null} loading={false} />)
    expect(screen.getByText('912,345')).toBeTruthy()
    expect(screen.getByText('12.0 min')).toBeTruthy()
  })
})

describe('HalvingCountdown', () => {
  it('renders blocks remaining and epoch progress from the block height', () => {
    render(<HalvingCountdown blockHeight={900000} />)
    // 1,050,000 is the next halving boundary above 900,000.
    expect(screen.getAllByText('150,000').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/of current epoch complete/).length).toBeGreaterThan(0)
  })

  it('renders skeletons rather than zeros before the height arrives', () => {
    render(<HalvingCountdown blockHeight={null} />)
    expect(screen.queryByText(/of current epoch complete/)).toBeNull()
  })
})

describe('VolumeCard', () => {
  it('renders volume, dominance and sats per fiat', () => {
    render(
      <VolumeCard
        volumeUsd={30e9} volume={30e9} currency="usd"
        btcDominance={58.3} volHistory={null} marketCapUsd={2.1e12} price={100000}
      />
    )
    expect(screen.getByText('BTC dominance 58.3%')).toBeTruthy()
    expect(screen.getByText(/1,000\s+sats per \$1/)).toBeTruthy()
  })

  it('skips the 7d comparison when history is too short to have one', () => {
    render(
      <VolumeCard
        volumeUsd={30e9} volume={30e9} currency="usd"
        btcDominance={58.3} volHistory={[{ volume: 20e9 }]} marketCapUsd={null} price={null}
      />
    )
    expect(screen.queryByText(/7d avg/)).toBeNull()
  })

  it('reports the 7d comparison once there is history', () => {
    render(
      <VolumeCard
        volumeUsd={30e9} volume={30e9} currency="usd"
        btcDominance={58.3} volHistory={[{ volume: 20e9 }, { volume: 20e9 }]} marketCapUsd={null} price={null}
      />
    )
    expect(screen.getByText(/50%\s+above 7d avg/)).toBeTruthy()
  })

  // Resilience (roadmap §6). CoinPaprika supplies the volume, the dominance and
  // the market cap; Kraken supplies the price. The whole card body used to sit
  // behind one `volume != null`, so a CoinPaprika outage took sats per fiat with
  // it — a line computed entirely from the price that v1.7.9 had just taught to
  // survive that exact outage.
  it('still shows sats per fiat when the volume never arrives', () => {
    render(
      <VolumeCard
        volumeUsd={null} volume={null} currency="usd"
        btcDominance={null} volHistory={null} marketCapUsd={null} price={100000}
      />
    )
    expect(screen.getByText(/1,000\s+sats per \$1/)).toBeTruthy()
  })

  it('still shows the derived market cap when the volume never arrives', () => {
    render(
      <VolumeCard
        volumeUsd={null} volume={null} currency="usd"
        btcDominance={null} volHistory={null}
        marketCapUsd={2.08e12} marketCapEstimated price={100000}
      />
    )
    expect(screen.getByText(/Mkt cap \$2\.1T · est\. from issued supply/)).toBeTruthy()
  })

  it('labels the market cap only when it is derived', () => {
    // The label is the whole reason this fallback is allowed to exist — an
    // estimate presenting itself as CoinPaprika's own figure is the one way it
    // is worse than the blank it replaces.
    render(
      <VolumeCard
        volumeUsd={30e9} volume={30e9} currency="usd"
        btcDominance={58.3} volHistory={null} marketCapUsd={2.1e12} price={100000}
      />
    )
    expect(screen.getByText('Mkt cap $2.1T')).toBeTruthy()
    expect(screen.queryByText(/est\. from issued supply/)).toBeNull()
  })

  // A price of 0 reached this card from the Kraken WebSocket, which published
  // `Math.round(ticker.last)` behind a bare `!= null`. `computeSatsPerFiat(0)`
  // is null, the card gated on the price rather than on that result, and there
  // is no error boundary in the app — so the throw blanked the whole dashboard.
  // The source is screened now; this pins the card so it cannot be the second
  // half of that failure again.
  it.each([
    ['zero', 0],
    ['NaN', NaN],
    ['negative', -105000],
  ])('renders without throwing when the price is %s', (_label, price) => {
    expect(() => render(
      <VolumeCard
        volumeUsd={30e9} volume={30e9} currency="usd"
        btcDominance={58.3} volHistory={null} marketCapUsd={2.1e12} price={price}
      />
    )).not.toThrow()
    // And says nothing rather than saying something wrong.
    expect(screen.queryByText(/sats per/)).toBeNull()
    expect(screen.queryByText(/NaN/)).toBeNull()
  })
})
