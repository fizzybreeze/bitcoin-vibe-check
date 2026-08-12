import { describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import BtcPriceCard from '../BtcPriceCard.jsx'
import CycleIndicatorsCard from '../CycleIndicatorsCard.jsx'
import DonationCard from '../DonationCard.jsx'
import MarketSentimentCard from '../MarketSentimentCard.jsx'
import NetworkFeesCard from '../NetworkFeesCard.jsx'
import NetworkHeartbeatCard from '../NetworkHeartbeatCard.jsx'
import NetworkPulseCard from '../NetworkPulseCard.jsx'
import NewsletterCard from '../NewsletterCard.jsx'
import PriceChartCard from '../PriceChartCard.jsx'
import RecentBlocksCard from '../RecentBlocksCard.jsx'
import SupplyIssuedCard from '../SupplyIssuedCard.jsx'
import SupportersCard from '../SupportersCard.jsx'
import VolumeCard from '../VolumeCard.jsx'

// The heading outline (roadmap §5).
//
// Before this the whole dashboard had exactly one heading — the `<h1>` in the
// header — and every card title was a `<p>` that merely looked like one. A
// screen reader's most-used navigation is jump-to-next-heading, so a fifteen
// card page with one heading is a page you can only read top to bottom.
//
// Two assertions, because they fail in different directions. The rendered half
// catches a title that is the wrong tag or the wrong *level* — a skipped level
// makes an outline worse than no outline. The source scan catches the next card
// written by copying an older one, which the rendered half cannot: a card that
// does not exist yet has no test.
//
// Tailwind's preflight resets heading `font-size` and `font-weight` to inherit
// and zeroes their margins, so none of this changes a pixel. The eight visual
// baselines passing untouched is the evidence for that, not this file.

/** Cards whose own title is the card's name, with the props to draw one. */
const TITLED_CARDS = [
  ['BTC Price',                  <BtcPriceCard value="$100,000" change={1.2} sub="24h change" />],
  ['Cycle Indicators',           <CycleIndicatorsCard chainData={null} price={100000} ma200={90000} />],
  ['Support Bitcoin Vibe Check', <DonationCard />],
  ['Market Sentiment',           <MarketSentimentCard fng={{ value: '55', value_classification: 'Greed' }} />],
  ['Network Fees',               <NetworkFeesCard fees={null} mempool={null} lightning={null} price={100000} currency="usd" />],
  ['Network Heartbeat',          <NetworkHeartbeatCard blockHeight={900000} difficulty={null} lastBlockTs={null} />],
  ['Network Health',             <NetworkPulseCard difficulty={null} hashrate={null} hashrateHistory={[]} />],
  ["Satoshi's Weekly Brief",     <NewsletterCard />],
  ['Price · USD',                <PriceChartCard chart={null} ranges={[{ label: '1D', days: 1 }]} range="1D" setRange={() => {}} refreshChart={() => {}} currency="usd" />],
  ['Recent Blocks',              <RecentBlocksCard blockHeight={900000} difficulty={null} lastBlockTs={null} />],
  ['Supply Issued',              <SupplyIssuedCard blockHeight={900000} />],
  ['Supporters ⚡',              <SupportersCard donors={[]} />],
  ['24h Volume',                 <VolumeCard volume={1e9} dominance={54} currency="usd" />],
]

describe('card titles are headings', () => {
  it.each(TITLED_CARDS)('%s', (title, element) => {
    render(element)
    expect(screen.getByRole('heading', { name: new RegExp(`^${title}`), level: 2 })).toBeInTheDocument()
    cleanup()
  })

  it('nests the Vibe Score under the card it lives in rather than beside it', () => {
    // It is a titled section inside the BTC Price card, not a card of its own.
    // An `h2` here would be a sibling of "BTC Price" in the outline, which
    // claims the score is a separate region of the page; an `h3` says what is
    // actually on screen.
    render(<BtcPriceCard value="$100,000" vibe={{ score: 62, label: 'Warm', dimensions: {}, inputsUsed: 7, inputsTotal: 7 }} />)
    expect(screen.getByRole('heading', { name: /^Vibe Score/, level: 3 })).toBeInTheDocument()
  })
})

// ── The scan that covers the card nobody has written yet ─────────────────────

const COMPONENTS = resolve('src/components')

/**
 * `HalvingCountdown` is the one card with no title, and that is a fact about
 * the design rather than an oversight: it is a three-panel strip of "Blocks to
 * Halving / Estimated Time / Epoch Progress" with no name of its own above
 * them. Giving it one would mean inventing a label that is not on screen, and
 * an outline that names regions a sighted visitor cannot see is its own bug.
 * Listed here so that adding a second exception is a deliberate act.
 */
const UNTITLED_BY_DESIGN = ['HalvingCountdown.jsx']

describe('every card carries its own heading', () => {
  // A card is anything wearing the card shell — which since v1.8.7 is the
  // `CARD` constant rather than the literal. Both are matched: the two overlays
  // still hand-write `rounded-2xl bg-surface` because a modal and a popover are
  // not grid cards, and they should stay in this scan.
  const cards = readdirSync(COMPONENTS)
    .filter(f => f.endsWith('.jsx'))
    .filter(f => {
      const body = readFileSync(join(COMPONENTS, f), 'utf8')
      return body.includes('rounded-2xl bg-surface') || /\bCARD\b[^_]/.test(body)
    })

  it('found the cards to scan', () => {
    // A scan that matched nothing would pass every assertion below it.
    expect(cards.length).toBeGreaterThan(10)
    expect(cards).toContain('VolumeCard.jsx')
  })

  it.each(cards.filter(f => !UNTITLED_BY_DESIGN.includes(f)))('%s', (file) => {
    expect(readFileSync(join(COMPONENTS, file), 'utf8')).toMatch(/<h2[\s>]/)
  })

  it('keeps the exception list honest', () => {
    // An exception for a file that is no longer a card, or that has since grown
    // a heading, is an exemption nobody is watching.
    for (const file of UNTITLED_BY_DESIGN) {
      expect(cards, `${file} is no longer a card`).toContain(file)
      expect(readFileSync(join(COMPONENTS, file), 'utf8'), `${file} has a heading now`).not.toMatch(/<h2[\s>]/)
    }
  })
})
