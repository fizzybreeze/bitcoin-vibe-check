import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ShareCanvas from '../ShareCanvas.jsx'
import { PALETTE } from '../../lib/palette.js'
import { mvrvBand } from '../../lib/scales.js'

// jsdom serialises an inline colour as `rgb(r, g, b)`, so the palette hex has
// to be converted before it can be compared with what was rendered.
function rgb(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

// The exported image outlives the moment it was made and gets posted where
// nobody can check it against the live card, so an MVRV served from the daily
// snapshot has to carry the same caveat there as it does on screen.
function renderCycleCard(mvrv, props = {}) {
  return render(
    <ShareCanvas
      selectedCards={['cycleIndicators']}
      sentimentSummary=""
      cardData={{ priceUsd: 100_000, ma200: 90_000, chainData: { mvrv } }}
      currency="usd"
      forwardedRef={null}
      {...props}
    />
  )
}

describe('ShareCanvas — Cycle Indicators', () => {
  it('labels an MVRV that came from the daily snapshot', () => {
    renderCycleCard({ value: 2.15, date: '2026-08-05', source: 'snapshot' })
    expect(screen.getByText(/2026-08-05.*daily snapshot/i)).toBeTruthy()
  })

  it('says nothing about snapshots when the MVRV is live', () => {
    renderCycleCard({ value: 2.15, date: '2026-08-05', source: 'live' })
    expect(screen.getByText('2.15')).toBeTruthy()
    expect(screen.queryByText(/snapshot/i)).toBeNull()
  })

  // This card used to carry its own five-band MVRV ladder in five colours the
  // live card never used, so the same ratio was "Undervalued" in lime on the
  // image and in the up-signal colour on screen. One ladder now answers both.
  it.each([
    [0.8, 'Deeply Undervalued'],
    [1.2, 'Undervalued'],
    [2.15, 'Fair Value'],
    [3.0, 'Overvalued'],
    [4.2, 'Extremely Overvalued'],
  ])('colours MVRV %s from the same band the live card reads', (value, label) => {
    renderCycleCard({ value, source: 'live' })
    const band = mvrvBand(value)
    expect(band.label).toBe(label)
    expect(screen.getByText(label).style.color).toBe(rgb(PALETTE.dark[band.token]))
  })
})

describe('ShareCanvas — theme', () => {
  // The share image follows the theme the visitor is looking at. `forwardedRef`
  // is the capture target, so its child is the sheet whose background becomes
  // the image's background.
  function sheetBackground(props) {
    const { container } = renderCycleCard({ value: 2.15, source: 'live' }, props)
    return container.firstChild.firstChild.style.background
  }

  it('renders light when asked to', () => {
    expect(sheetBackground({ theme: 'light' })).toBe(rgb(PALETTE.light.ground))
  })

  it('renders dark when asked to', () => {
    expect(sheetBackground({ theme: 'dark' })).toBe(rgb(PALETTE.dark.ground))
  })

  it('falls back to the default theme rather than to a colour', () => {
    // A caller that forgets the prop — or stores junk in localStorage — still
    // exports the card people expect, in the product's own identity.
    expect(sheetBackground({})).toBe(rgb(PALETTE.dark.ground))
    expect(sheetBackground({ theme: 'sepia' })).toBe(rgb(PALETTE.dark.ground))
  })
})

describe('the header', () => {
  it('draws the wordmark rather than setting the title in a font', () => {
    // A posted image outlives the moment it was made, and this one carries the
    // product's name — so it has to be the same picture the site shows, not the
    // same words in whatever face html2canvas resolved. Asserting the element
    // rather than the import is the difference between this and a check that
    // passes while the header has quietly gone back to `fontWeight: 700`.
    const { container } = render(
      <ShareCanvas
        selectedCards={['btcPrice']}
        sentimentSummary=""
        cardData={{ priceUsd: 100_000 }}
        currency="usd"
        forwardedRef={null}
      />
    )
    const mark = container.querySelector('[data-testid="wordmark"]')
    expect(mark).toBeTruthy()
    // Fixed cell, no breakpoints: this tree is rasterised at one size, and a
    // `md:` class that ever resolved would change the size of an exported image.
    expect(mark.getAttribute('class')).not.toMatch(/md:/)
    expect(screen.queryByText('Bitcoin Vibe Check')).toBeNull()
  })
})
