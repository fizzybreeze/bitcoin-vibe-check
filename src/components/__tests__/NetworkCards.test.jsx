// Render tests for the five cards extracted out of App.jsx in #22, and the
// blockTimeColors helper two of them share. They had no unit coverage while
// they lived in App.jsx — nothing there is importable without the whole file —
// so making them cheap to exercise is most of what the extraction buys.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import NetworkPulseCard from '../NetworkPulseCard.jsx'
import NetworkHeartbeatCard from '../NetworkHeartbeatCard.jsx'
import RecentBlocksCard from '../RecentBlocksCard.jsx'
import HalvingCountdown from '../HalvingCountdown.jsx'
import VolumeCard from '../VolumeCard.jsx'
import { blockTimeColors } from '../blockTime.js'

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

describe('blockTimeColors', () => {
  it('reads on-target (9–11 min) as orange', () => {
    expect(blockTimeColors(10).text).toBe('text-orange-400')
    expect(blockTimeColors(9).text).toBe('text-orange-400')
    expect(blockTimeColors(11).text).toBe('text-orange-400')
  })

  it('reads faster than target as green and slower as red', () => {
    expect(blockTimeColors(8.9).text).toBe('text-green-400')
    expect(blockTimeColors(11.1).text).toBe('text-red-400')
  })

  it('falls back to orange when the average is unknown', () => {
    expect(blockTimeColors(null).text).toBe('text-orange-400')
  })

  it('keeps text and bg on the same colour', () => {
    for (const mins of [null, 5, 10, 20]) {
      const { text, bg } = blockTimeColors(mins)
      expect(text.replace('text-', '')).toBe(bg.replace('bg-', ''))
    }
  })
})

describe('NetworkPulseCard', () => {
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
    render(<NetworkPulseCard difficulty={null} loading={false} hashRateTrend={4.25} />)
    expect(await screen.findByText('812.0')).toBeTruthy()
    expect(screen.getByText(/▲.*\+4\.3% \(30d\)/)).toBeTruthy()
  })

  it('marks a falling hash-rate trend red rather than green', async () => {
    stubFetch({ currentHashrate: 812e18 })
    render(<NetworkPulseCard difficulty={null} loading={false} hashRateTrend={-4.25} />)
    const trend = await screen.findByText(/▼.*-4\.3% \(30d\)/)
    expect(trend.className).toContain('text-red-400')
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
})
