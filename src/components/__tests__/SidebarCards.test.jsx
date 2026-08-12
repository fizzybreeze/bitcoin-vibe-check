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
import SupportersCard from '../SupportersCard.jsx'
import ChartTooltip from '../ChartTooltip.jsx'
import SatoshiQuote from '../SatoshiQuote.jsx'
import NewsletterModal from '../NewsletterModal.jsx'
import NewsletterCard from '../NewsletterCard.jsx'
import BeehiivEmbed from '../BeehiivEmbed.jsx'
import { BEEHIIV_FORM_IDS, beehiivFormId } from '../beehiivForms.js'
import useTheme from '../../hooks/useTheme.js'
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from '../../lib/palette.js'

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

describe('SupportersCard', () => {
  const donors = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]

  it('duplicates the ticker content so the marquee has no visible gap', () => {
    // The scroll animation translates a single span by its own width, so the
    // names have to appear twice or the strip runs out mid-loop.
    render(<SupportersCard donors={donors} />)
    expect(screen.getByText(/⚡ Alice.*⚡ Alice/s)).toBeInTheDocument()
  })

  it('renders one pill per donor for the narrow layout', () => {
    render(<SupportersCard donors={donors} />)
    // jsdom applies no Tailwind, so `md:hidden` hides nothing here and both
    // layouts are queryable — the pills are the exact-match nodes, the marquee
    // is one long string.
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('invites the first supporter exactly once when the list is empty', () => {
    // The sentence used to exist twice, byte-identical, in two components of
    // which only one is ever on screen — so the two could disagree for as long
    // as anyone liked and nothing would ever show both. One card, one sentence:
    // `getByText` throws on a second occurrence, which is the assertion.
    render(<SupportersCard donors={[]} />)
    expect(screen.getByText(/Be the first to support/)).toBeInTheDocument()
  })

  it('renders neither layout when there is nobody to list', () => {
    // An empty marquee still animates, and an empty pill row still takes its
    // margin. The empty state replaces both rather than sitting under them.
    const { container } = render(<SupportersCard donors={[]} />)
    expect(container.querySelector('[style*="ticker-scroll"]')).toBeNull()
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
  // The form is a cross-origin iframe, so the theme cannot be carried into it
  // by a class or a token — it is carried by loading a *different form*, one
  // styled in beehiiv's designer per theme. What is assertable here is that the
  // right one is requested; what the form looks like once it renders is in
  // someone else's dashboard and out of reach of every gate in this repo.
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  /** A second consumer of the theme store, so the toggle is pressable. */
  function ThemeHarness() {
    const { toggleTheme } = useTheme()
    return <button onClick={toggleTheme}>toggle theme</button>
  }

  const formIdIn = (container) =>
    container.querySelector('script').getAttribute('data-beehiiv-form')

  it('names the dark theme’s form when the theme is dark', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const { container } = render(<BeehiivEmbed />)
    const script = container.querySelector('script')
    expect(script.getAttribute('src')).toBe('https://subscribe-forms.beehiiv.com/v3/loader.js')
    expect(script.getAttribute('data-beehiiv-form')).toBe(BEEHIIV_FORM_IDS.dark)
    expect(script.async).toBe(true)
  })

  it('names the light theme’s form when the theme is light', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    const { container } = render(<BeehiivEmbed />)
    expect(formIdIn(container)).toBe(BEEHIIV_FORM_IDS.light)
  })

  it('swaps the form when the theme changes, without leaving the old one behind', () => {
    // The load-bearing one. A toggle has to *replace* the form, not add to it:
    // the loader injects its iframe beside the script, so re-running the effect
    // in place would stack the previous theme's form under the new one — two
    // signup forms in one card, the first of them the wrong colour. The iframe
    // here stands in for the one their loader would inject, which nothing in a
    // hermetic suite can produce for real.
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const { container } = render(<><ThemeHarness /><BeehiivEmbed /></>)
    expect(formIdIn(container)).toBe(BEEHIIV_FORM_IDS.dark)
    const mountedInto = container.querySelector('div')
    mountedInto.appendChild(document.createElement('iframe'))

    fireEvent.click(screen.getByRole('button', { name: 'toggle theme' }))

    expect(container.querySelectorAll('script')).toHaveLength(1)
    expect(formIdIn(container)).toBe(BEEHIIV_FORM_IDS.light)
    expect(container.querySelector('iframe')).toBeNull()
    // And into a *fresh* node. This is the assertion that pins the `key`
    // specifically: the two above would also pass if the container were merely
    // emptied, and it is the key that makes the iframe go away.
    expect(container.querySelector('div')).not.toBe(mountedInto)
  })

  it('gives every theme a form, and no two themes the same one', () => {
    // The failure this catches is a paste, and it is invisible: two ids that
    // are the same render a perfectly good form in both themes, wrong in one of
    // them, with nothing on screen or in any other test to say so. A theme
    // added without a form is the other half — `data-beehiiv-form="undefined"`
    // renders nothing at all under a card that still invites you to sign up.
    const ids = THEMES.map((theme) => BEEHIIV_FORM_IDS[theme])
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(THEMES.length)
  })

  it('falls back to a real form for a theme it does not have', () => {
    expect(beehiivFormId('sepia')).toBe(BEEHIIV_FORM_IDS[DEFAULT_THEME])
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
