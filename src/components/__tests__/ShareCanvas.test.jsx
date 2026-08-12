import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ShareCanvas from '../ShareCanvas.jsx'
import { PALETTE } from '../../lib/palette.js'
import { mvrvBand } from '../../lib/scales.js'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const COMPONENTS = resolve('src/components')

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
  // `backgroundColor` rather than `background`: the sheet also carries the CRT
  // raster as a `background-image`, and the shorthand resets it — so the two
  // have to be written as separate properties and read as separate properties.
  function sheetBackground(props) {
    const { container } = renderCycleCard({ value: 2.15, source: 'live' }, props)
    return container.firstChild.firstChild.style.backgroundColor
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

describe('the header mark', () => {
  function renderHeader(props = {}) {
    return render(
      <ShareCanvas
        selectedCards={['btcPrice']}
        sentimentSummary=""
        cardData={{ priceUsd: 100_000 }}
        currency="usd"
        forwardedRef={null}
        {...props}
      />
    )
  }

  it('is drawn rather than typed', () => {
    // This was `<span>₿</span>` — a device-font glyph beside a wordmark that has
    // been a picture since v1.11.0. A device without U+20BF rasterises a tofu
    // box into an image somebody has already posted, which is exactly the risk
    // v1.8.1 removed from the icons and left behind on this one surface.
    const { container } = renderHeader()
    const mark = container.querySelector('[data-testid="app-mark"]')
    expect(mark).toBeTruthy()
    expect(mark.querySelector('svg')).toBeTruthy()
    // Rects, not text: proof it is the pixel grid rather than a glyph in a box.
    expect(mark.querySelectorAll('rect').length).toBeGreaterThan(1)
    expect(mark.querySelector('text')).toBeNull()
  })

  it('leaves no ₿ character anywhere in the exported tree', () => {
    // The assertion that would have caught the original: the glyph renders
    // perfectly on the machine that draws it and fails only on somebody else's.
    const { container } = renderHeader()
    expect(container.textContent).not.toContain('₿')
  })

  it('draws the mark from the shared artwork rather than a second copy of it', () => {
    // `markSvg` makes three geometry decisions — whole-pixel cells, the grid
    // centred on the remainder, the corner radius snapped to the cell. A
    // component that redrew the mark in JSX would have to make them again.
    const body = readFileSync(join(COMPONENTS, 'Mark.jsx'), 'utf8')
    expect(body).toMatch(/markSvg/)
    expect(body).not.toMatch(/<svg/)
  })

  // `markSvg` draws from `MARK_THEME` unless it is told otherwise, which is
  // right for an icon — an OS has no visitor to ask — and wrong here, because
  // this image follows the reader's theme and the glyph it replaced took
  // `p.accent`. Left on the default, a light card carries the dark theme's
  // `accent-fill` beside the light theme's `accent` rule and wordmark: two
  // different brand pinks in one picture, permanent once it is posted.
  it.each(['dark', 'light'])('is drawn in the theme the image is exported in, %s', (theme) => {
    const { container } = renderHeader({ theme })
    const tile = container.querySelector('[data-testid="app-mark"] rect')
    expect(tile.getAttribute('fill')).toBe(PALETTE[theme]['accent-fill'])
  })

  it('draws the letterform in the tone that pairs with that tile', () => {
    // `accent-ink` is the token whose whole job is being readable on the accent
    // fill, and the two invert between themes — near-black on dark, white on
    // light. Following one without the other is an unreadable mark.
    const { container } = renderHeader({ theme: 'light' })
    const rects = [...container.querySelectorAll('[data-testid="app-mark"] rect')]
    expect(rects.length).toBeGreaterThan(1)
    for (const r of rects.slice(1)) {
      expect(r.getAttribute('fill')).toBe(PALETTE.light['accent-ink'])
    }
  })
})

describe('the CRT raster on the exported sheet', () => {
  // The other half of this claim is in `crt.test.js`, which owns the geometry
  // and the contrast; this is the part that needs JSX to render.
  //
  // It asserts the *rendered style* rather than scanning the source, because
  // the first draft scanned for `grainBackground` — which matches the import
  // line, so deleting the actual call left the test green and four mutations
  // walked through it.
  function sheet() {
    const { container } = render(
      <ShareCanvas
        selectedCards={['btcPrice']}
        sentimentSummary=""
        cardData={{ priceUsd: 100_000 }}
        currency="usd"
        forwardedRef={null}
      />
    )
    return container
  }

  it('paints the raster on the sheet html2canvas captures', () => {
    // `backgroundImage` also catches the `background:` shorthand coming back —
    // the shorthand resets the image, so it reads empty rather than wrong.
    expect(sheet().firstChild.firstChild.style.backgroundImage)
      .toContain('data:image/svg+xml')
  })

  it('leaves the cards themselves clear of it', () => {
    // Deliberate: the cards are opaque panels sitting on one screen rather than
    // eight small screens, which is also what keeps every figure in the image
    // out of the contrast budget. See `EXPORT_GRAIN_LAYERS`.
    const card = sheet().querySelector('[style*="border-radius: 12px"]')
    expect(card, 'no card found to check').not.toBeNull()
    // Not `toBe('')`: setting the `background` shorthand expands every longhand,
    // so jsdom reports `initial` here rather than nothing. The claim is that the
    // card carries no raster, which is what this says.
    expect(card.style.backgroundImage).not.toContain('data:image/svg+xml')
  })
})
