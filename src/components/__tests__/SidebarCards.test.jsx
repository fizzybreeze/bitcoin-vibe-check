// Render tests for the components extracted out of App.jsx in the batch that
// closed #22 — the sentiment, fees, supply, supporter, donation, newsletter and
// footer pieces. As with the v1.6.8 batch, none of them had unit coverage while
// they lived in App.jsx, because nothing there is importable without the whole
// file. The extraction is what makes these possible, and that is most of what
// it buys.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import MarketSentimentCard from '../MarketSentimentCard.jsx'
import NetworkFeesCard from '../NetworkFeesCard.jsx'
import SupplyIssuedCard from '../SupplyIssuedCard.jsx'
import SupporterTickerCard from '../SupporterTickerCard.jsx'
import MobileSupportersCard from '../MobileSupportersCard.jsx'
import ChartTooltip from '../ChartTooltip.jsx'
import SatoshiQuote from '../SatoshiQuote.jsx'
import NewsletterModal from '../NewsletterModal.jsx'
import NewsletterCard from '../NewsletterCard.jsx'
import BeehiivEmbed from '../BeehiivEmbed.jsx'

afterEach(cleanup)

describe('MarketSentimentCard', () => {
  const fng = { value: '72', value_classification: 'Greed' }

  it('labels the 30-day sparkline with the readings it draws', () => {
    // The chart is an SVG with no text. The label carries the information —
    // first, last and direction — rather than describing the picture.
    render(<MarketSentimentCard fng={fng} fngHistory={[{ v: 45 }, { v: 30 }, { v: 72 }]} loading={false} />)
    const chart = screen.getByRole('img', { name: /Fear and Greed/ })
    expect(chart.getAttribute('aria-label'))
      .toBe('Fear and Greed over 30 days: 45 to 72, rising. Low 30, high 72.')
  })

  it('renders the score and its classification', () => {
    render(<MarketSentimentCard fng={fng} fngHistory={null} loading={false} />)
    expect(screen.getByText('72')).toBeInTheDocument()
    expect(screen.getByText('Greed')).toBeInTheDocument()
  })

  it('colours by the classification alternative.me sends, not by the number', () => {
    // 25 is "Extreme Fear" by their bands. Colouring from the number here would
    // put the live card and the link preview on different scales — the
    // disagreement v1.6.0 fixed twice. Their bands are theirs to move.
    render(<MarketSentimentCard fng={{ value: '25', value_classification: 'Extreme Fear' }} loading={false} />)
    expect(screen.getByText('Extreme Fear')).toHaveClass('text-fng-extreme-fear')
  })

  it('falls back to grey for a classification it does not know', () => {
    render(<MarketSentimentCard fng={{ value: '50', value_classification: 'Sideways' }} loading={false} />)
    expect(screen.getByText('Sideways')).toHaveClass('text-quiet')
  })

  it('shows a dash rather than a stale value once loading has finished with no data', () => {
    render(<MarketSentimentCard fng={null} loading={false} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('omits the 30-day sparkline when there is no history', () => {
    const { rerender } = render(<MarketSentimentCard fng={fng} fngHistory={null} loading={false} />)
    expect(screen.queryByText(/SENTIMENT TREND/)).not.toBeInTheDocument()

    rerender(<MarketSentimentCard fng={fng} fngHistory={[{ v: 40 }, { v: 60 }]} loading={false} />)
    expect(screen.getByText(/SENTIMENT TREND \(30D\)/)).toBeInTheDocument()
  })
})

describe('NetworkFeesCard', () => {
  const fees = { hourFee: 3, halfHourFee: 8, fastestFee: 25 }
  const lightning = { latest: { total_capacity: 550_000_000, node_count: 15_432, channel_count: 51_200 } }

  const renderCard = props => render(
    <NetworkFeesCard fees={fees} lightning={lightning} loading={false} price={100_000} currencySym="$" {...props} />
  )

  it('renders all three fee tiers with their fiat estimate', () => {
    renderCard({ mempool: { vsize: 2_000_000, count: 4_000 } })
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
    // 25 sat/vB × 250 vbytes = 6,250 sats = 0.0000625 BTC ≈ $6.25 at $100k.
    expect(screen.getByText('≈ $6.25')).toBeInTheDocument()
  })

  it('reads the congestion bands off mempool vsize', () => {
    const { rerender } = renderCard({ mempool: { vsize: 4_999_999, count: 1 } })
    expect(screen.getByText('Low')).toHaveClass('text-up')

    rerender(<NetworkFeesCard fees={fees} mempool={{ vsize: 5_000_000, count: 1 }} loading={false} price={0} />)
    expect(screen.getByText('Moderate')).toHaveClass('text-warn')

    rerender(<NetworkFeesCard fees={fees} mempool={{ vsize: 50_000_001, count: 1 }} loading={false} price={0} />)
    expect(screen.getByText('High')).toHaveClass('text-down')
  })

  it('hides the congestion indicator rather than the card when mempool is missing', () => {
    // mempool.space failing should cost the one row it feeds, not the fees.
    renderCard({ mempool: null })
    expect(screen.queryByText(/Mempool Congestion/)).not.toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
  })

  it('omits the fiat estimate when there is no price', () => {
    renderCard({ mempool: null, price: 0 })
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument()
  })

  it('says Lightning is unavailable rather than rendering empty stats', () => {
    renderCard({ mempool: null, lightning: null, loading: false })
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
  })

  it('renders Lightning capacity in BTC, not satoshis', () => {
    renderCard({ mempool: null })
    expect(screen.getByText('5.5')).toBeInTheDocument()
    expect(screen.getByText('15,432')).toBeInTheDocument()
  })
})

describe('SupplyIssuedCard', () => {
  it('renders issued supply against the 21M cap', () => {
    render(<SupplyIssuedCard blockHeight={900_000} />)
    expect(screen.getByText(/BTC/)).toBeInTheDocument()
    expect(screen.getByText('of 21,000,000 maximum')).toBeInTheDocument()
  })

  it('shows a skeleton rather than zero before the block height arrives', () => {
    // Rendering 0.00 BTC would read as a fact rather than as a missing value.
    render(<SupplyIssuedCard blockHeight={null} />)
    expect(screen.queryByText(/BTC/)).not.toBeInTheDocument()
  })
})

describe('supporter cards', () => {
  const donors = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]

  it('invites the first supporter when the list is empty', () => {
    render(<SupporterTickerCard donors={[]} />)
    expect(screen.getByText(/Be the first to support/)).toBeInTheDocument()
  })

  it('duplicates the ticker content so the marquee has no visible gap', () => {
    // The scroll animation translates a single span by its own width, so the
    // names have to appear twice or the strip runs out mid-loop.
    render(<SupporterTickerCard donors={donors} />)
    expect(screen.getAllByText(/⚡ Alice/)).toHaveLength(1)
    expect(screen.getByText(/⚡ Alice.*⚡ Alice/s)).toBeInTheDocument()
  })

  it('renders one pill per donor on mobile', () => {
    render(<MobileSupportersCard donors={donors} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('invites the first supporter on mobile too', () => {
    render(<MobileSupportersCard donors={[]} />)
    expect(screen.getByText(/Be the first to support/)).toBeInTheDocument()
  })
})

describe('ChartTooltip', () => {
  const payload = [
    { dataKey: 'price', value: 103_000 },
    { dataKey: 'volume', value: 25_000_000_000 },
  ]

  it('renders nothing unless recharts says it is active', () => {
    const { container } = render(<ChartTooltip active={false} payload={payload} label="5 Aug" currency="usd" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the payload carries no price', () => {
    const { container } = render(<ChartTooltip active payload={[{ dataKey: 'volume', value: 1 }]} label="5 Aug" currency="usd" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('formats price in the given currency and labels the volume', () => {
    render(<ChartTooltip active payload={payload} label="5 Aug" currency="usd" />)
    expect(screen.getByText('5 Aug')).toBeInTheDocument()
    expect(screen.getByText(/\$103,000/)).toBeInTheDocument()
    expect(screen.getByText(/Vol/)).toBeInTheDocument()
  })

  it('drops the volume line when the series has none', () => {
    render(<ChartTooltip active payload={[payload[0]]} label="5 Aug" currency="usd" />)
    expect(screen.queryByText(/Vol/)).not.toBeInTheDocument()
  })
})

describe('SatoshiQuote', () => {
  it('renders a quote and its attribution', () => {
    render(<SatoshiQuote />)
    expect(screen.getByText(/Satoshi Nakamoto/)).toBeInTheDocument()
  })

  it('keeps the genesis hash out of the DOM until the quotes have cycled', () => {
    // It is one 64-character unbroken string. It reached the page on mobile once
    // and pushed the whole dashboard sideways, which is why it is also asserted
    // in responsive.spec.js.
    render(<SatoshiQuote />)
    expect(screen.queryByText(/^000000000019d668/)).not.toBeInTheDocument()
  })
})

describe('NewsletterCard', () => {
  it('mounts beehiiv’s loader rather than a form of our own', () => {
    // v1.8.2 swapped this for a native POST to `app.beehiiv.com/subscribe`,
    // which is their logged-in dashboard — every signup landed on a login page.
    // The embed is off-brand and works; that trade is recorded in §3.5.
    const { container } = render(<NewsletterCard />)
    expect(container.querySelector('script[src*="subscribe-forms.beehiiv.com"]')).not.toBeNull()
  })
})

describe('BeehiivEmbed', () => {
  it('names the publication’s form on the script it appends', () => {
    // The id is the whole payload — the loader renders a different
    // publication's form, or none, if it is wrong, and nothing on screen says
    // so until a human subscribes.
    const { container } = render(<BeehiivEmbed />)
    const script = container.querySelector('script')
    expect(script.getAttribute('src')).toBe('https://subscribe-forms.beehiiv.com/v3/loader.js')
    expect(script.getAttribute('data-beehiiv-form')).toBe('2f92f769-e2ce-4532-b1b6-ccd02017b0ec')
    expect(script.async).toBe(true)
  })

  it('detaches the script again on unmount', () => {
    // Asserted on the node rather than by re-querying the container, which is
    // the vacuous version: React removes its own wrapper on unmount, so the
    // query answers null whether the cleanup ran or not. `parentNode` is what
    // tells the two apart.
    const { container, unmount } = render(<BeehiivEmbed />)
    const script = container.querySelector('script')
    expect(script.parentNode).not.toBeNull()
    unmount()
    expect(script.parentNode).toBeNull()
  })
})

describe('NewsletterModal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('appears five seconds after a first visit', () => {
    render(<NewsletterModal />)
    expect(screen.queryByRole('heading', { name: /Weekly Brief/ })).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('heading', { name: /Weekly Brief/ })).toBeInTheDocument()
  })

  it('never appears again once dismissed', () => {
    // The flag is also what the e2e suite sets to suppress the modal, so a
    // change to the key would silently un-suppress it there.
    localStorage.setItem('btc-vibe-newsletter-prompted', 'true')
    render(<NewsletterModal />)
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.queryByRole('heading', { name: /Weekly Brief/ })).not.toBeInTheDocument()
  })

  it('records the dismissal so a reload does not re-prompt', () => {
    render(<NewsletterModal />)
    act(() => vi.advanceTimersByTime(5000))
    fireEvent.click(screen.getByLabelText('Close'))
    expect(screen.queryByRole('heading', { name: /Weekly Brief/ })).not.toBeInTheDocument()
    expect(localStorage.getItem('btc-vibe-newsletter-prompted')).toBe('true')
  })

  it('closes on the subscribe event beehiiv’s loader emits', () => {
    // This listener is only correct while the form is *theirs*. A form of our
    // own emits nothing, so anyone replacing the embed has to replace this too
    // — and must not do it by unmounting the form inside its own submit event,
    // which cancels the navigation. Measured in Chromium: removal synchronously
    // or from a microtask does not navigate, a deferred removal does.
    render(<NewsletterModal />)
    act(() => vi.advanceTimersByTime(5000))
    act(() => { window.dispatchEvent(new Event('beehiiv:subscribe')) })
    act(() => vi.advanceTimersByTime(2500))
    expect(screen.queryByRole('heading', { name: /Weekly Brief/ })).not.toBeInTheDocument()
    expect(localStorage.getItem('btc-vibe-newsletter-prompted')).toBe('true')
  })
})
