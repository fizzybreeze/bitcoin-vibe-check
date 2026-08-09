import { describe, it, expect } from 'vitest'
import {
  ALL_BANDS, VIBE_BANDS, FNG_BANDS,
  vibeLabelClass, vibeLabelHex, fngLabelClass, fngLabelHex, fngScoreHex,
  blockTimeBand, congestionBand, mvrvBand, powerLawBand,
} from '../lib/scales.js'
import { PALETTE, THEMES } from '../lib/palette.js'

// The class and the hex are two renderings of one band, and the whole reason
// this module exists is that they used to be two independent declarations that
// drifted. These assertions are the thing standing between the app and that
// happening again — everything else here is boundary arithmetic.

describe('a band renders the same colour in both notations', () => {
  it.each(ALL_BANDS)('$text is drawn from $token', (b) => {
    expect(b.text).toBe(`text-${b.token}`)
  })

  it.each(ALL_BANDS.filter(b => b.bg || b.bar))('$token fills with the same token it writes with', (b) => {
    expect(b.bg ?? b.bar).toBe(`bg-${b.token}`)
  })

  it.each(ALL_BANDS)('$token is a real palette token in both themes', (b) => {
    for (const theme of THEMES) {
      expect(PALETTE[theme][b.token], `${b.token} missing from ${theme}`).toBeTruthy()
    }
  })
})

describe('the Vibe ladder', () => {
  it('covers every label the score can produce', () => {
    expect(Object.keys(VIBE_BANDS)).toEqual(
      ['Ice Cold', 'Cold', 'Cool', 'Warm', 'Hot', 'Overheated'],
    )
  })

  it('runs cold to hot without repeating a colour', () => {
    const tokens = Object.values(VIBE_BANDS).map(b => b.token)
    expect(new Set(tokens).size).toBe(tokens.length)
  })

  it('answers per theme, because the share image follows the app', () => {
    expect(vibeLabelHex('Hot', 'dark')).toBe(PALETTE.dark['vibe-hot'])
    expect(vibeLabelHex('Hot', 'light')).toBe(PALETTE.light['vibe-hot'])
  })

  it('falls back to the muted tier for an unknown label', () => {
    // A label this file does not know is missing data, not a reading — and a
    // temperature colour on a value that has none is a lie in the ladder.
    expect(vibeLabelClass('Lukewarm')).toBe('text-muted')
    expect(vibeLabelHex('Lukewarm', 'dark')).toBe(PALETTE.dark.muted)
  })
})

describe('Fear & Greed', () => {
  it('is keyed by the classification, not the number', () => {
    // alternative.me calls 25 "Extreme Fear". Colouring by the number would
    // put it in the next band up and contradict the word beside it.
    expect(fngLabelClass('Extreme Fear')).toBe('text-fng-extreme-fear')
    expect(fngScoreHex(25, 'dark')).toBe(PALETTE.dark['fng-extreme-fear'])
  })

  it('answers null for an unknown classification rather than guessing', () => {
    expect(fngLabelHex('Panic', 'dark')).toBeNull()
  })

  it('falls back to the quiet tier as a class', () => {
    expect(fngLabelClass('Panic')).toBe('text-quiet')
  })

  it.each([
    [0, 'fng-extreme-fear'], [25, 'fng-extreme-fear'],
    [26, 'fng-fear'], [46, 'fng-fear'],
    [47, 'fng-neutral'], [54, 'fng-neutral'],
    [55, 'fng-greed'], [75, 'fng-greed'],
    [76, 'fng-extreme-greed'], [100, 'fng-extreme-greed'],
  ])('scores %i as %s', (score, name) => {
    expect(fngScoreHex(score, 'dark')).toBe(PALETTE.dark[name])
  })

  it('refuses a score that is not a number', () => {
    for (const junk of [null, undefined, NaN, '55']) {
      expect(fngScoreHex(junk, 'dark')).toBeNull()
    }
  })
})

describe('block time', () => {
  it('treats 9 to 11 minutes as on target, inclusive', () => {
    expect(blockTimeBand(9).text).toBe('text-accent')
    expect(blockTimeBand(10).text).toBe('text-accent')
    expect(blockTimeBand(11).text).toBe('text-accent')
  })

  it('reads faster than 9 as the up signal and slower than 11 as down', () => {
    expect(blockTimeBand(8.9).text).toBe('text-up')
    expect(blockTimeBand(11.1).text).toBe('text-down')
  })

  it('treats an unknown block time as on target rather than as a problem', () => {
    // Preserved from `blockTimeColors`: no data is not a slow chain, and
    // painting the heartbeat dot red on a failed fetch reads as an outage.
    expect(blockTimeBand(null).text).toBe('text-accent')
  })
})

describe('mempool congestion', () => {
  it.each([
    [0, 'Low'], [4_999_999, 'Low'],
    [5_000_000, 'Moderate'], [50_000_000, 'Moderate'],
    [50_000_001, 'High'],
  ])('calls %i vbytes %s', (vsize, label) => {
    expect(congestionBand(vsize).label).toBe(label)
  })

  it('answers null when the mempool fetch failed', () => {
    expect(congestionBand(null)).toBeNull()
  })
})

describe('MVRV', () => {
  it.each([
    [0.9, 'Deeply Undervalued'], [1, 'Undervalued'], [1.4, 'Undervalued'],
    [1.5, 'Fair Value'], [2.3, 'Fair Value'],
    [2.4, 'Overvalued'], [3.6, 'Overvalued'],
    [3.7, 'Extremely Overvalued'], [9, 'Extremely Overvalued'],
  ])('calls %f %s', (mvrv, label) => {
    expect(mvrvBand(mvrv).label).toBe(label)
  })

  it('draws fair value in the muted tier rather than a colour', () => {
    // "Near its collective break-even" is the absence of a reading.
    expect(mvrvBand(2).text).toBe('text-muted')
  })

  it('answers null when MVRV is unavailable', () => {
    // Its free tier is 15 requests a day, so this is the ordinary path.
    expect(mvrvBand(null)).toBeNull()
  })
})

describe('power law deviation', () => {
  it.each([[21, 'text-warn'], [20, 'text-muted'], [0, 'text-muted'], [-20, 'text-up'], [-50, 'text-up']])(
    'draws %i%% vs fair as %s', (pct, cls) => {
      expect(powerLawBand(pct).text).toBe(cls)
    },
  )

  it('answers null for a deviation it cannot compute', () => {
    expect(powerLawBand(NaN)).toBeNull()
    expect(powerLawBand(null)).toBeNull()
  })
})

describe('the ladders stay distinct from each other', () => {
  it('does not reuse a Vibe colour for a Fear & Greed band', () => {
    // Two different axes — hot/cold is not fear/greed — drawn on one screen.
    // Sharing a hex would make the two ladders look like one scale.
    const vibe = new Set(Object.values(VIBE_BANDS).map(b => b.token))
    const overlap = Object.values(FNG_BANDS).map(b => b.token).filter(t => vibe.has(t))
    expect(overlap).toEqual([])
  })
})
