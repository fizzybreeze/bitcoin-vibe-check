import { describe, it, expect } from 'vitest'
import { krakenPrice, mergeMarketData, estimateMarketCapUsd } from '../marketData.js'

// `Promise.allSettled` already means the page survives an outage. It does not
// mean the cards do — and until this module existed, "what does the dashboard
// look like when CoinPaprika has a bad morning" was a question you could only
// answer on the morning it happened.

const PAPRIKA = {
  quotes: {
    USD: {
      price: 105000, volume_24h: 35e9, percent_change_24h: 2.5,
      market_cap: 2.1e12, ath_price: 109000,
    },
  },
}
const KRAKEN = {
  result: {
    XXBTZUSD: { c: ['104500'] },
    XBTGBP: { c: ['82000'] },
    XBTEUR: { c: ['96000'] },
    XBTCAD: { c: ['142000'] },
    XBTCHF: { c: ['93000'] },
  },
}
const ALL = { paprikaTicker: PAPRIKA, krakenTicker: KRAKEN }

describe('krakenPrice', () => {
  it("matches on the suffix, because Kraken's codes are not the pair you asked for", () => {
    // XBTUSD comes back as XXBTZUSD, and the X/Z prefixes differ per asset.
    expect(krakenPrice(KRAKEN.result, 'USD')).toBe(104500)
    expect(krakenPrice(KRAKEN.result, 'GBP')).toBe(82000)
  })

  it('returns null rather than NaN for anything unusable', () => {
    expect(krakenPrice(KRAKEN.result, 'JPY')).toBeNull()
    expect(krakenPrice({ XXBTZUSD: { c: ['nonsense'] } }, 'USD')).toBeNull()
    expect(krakenPrice({ XXBTZUSD: {} }, 'USD')).toBeNull()
    expect(krakenPrice({ XXBTZUSD: { c: ['0'] } }, 'USD')).toBeNull()
    expect(krakenPrice(null, 'USD')).toBeNull()
    expect(krakenPrice(undefined, 'USD')).toBeNull()
  })
})

describe('when everything answers', () => {
  it('prefers CoinPaprika for the USD price', () => {
    // Kraken is the fallback, not a second opinion — swapping between two
    // sources tick to tick would show the price jittering for no reason.
    expect(mergeMarketData(ALL).priceUsd).toBe(105000)
  })
})

describe('when CoinPaprika answers but the price is unusable', () => {
  // The failure mode that is *not* an outage, and the one `??` would miss: a
  // 200 with a broken body. `??` only falls through on null/undefined, so a
  // zero or a non-numeric price would be passed straight to the cards — the
  // same trap recorded in v1.6.5 and v1.6.6, pointing the other way.
  it.each([
    ['zero', 0],
    ['a non-numeric string', 'unavailable'],
    ['an empty string', ''],
    ['null', null],
  ])('falls back to Kraken when the price is %s', (_label, price) => {
    const out = mergeMarketData({
      paprikaTicker: { quotes: { USD: { price, volume_24h: 35e9 } } },
      krakenTicker: KRAKEN,
    })
    expect(out.priceUsd).toBe(104500)
  })

  it('does the same for a zero all-time high', () => {
    const out = mergeMarketData({
      paprikaTicker: { quotes: { USD: { price: 105000, ath_price: 0 } } },
      krakenTicker: KRAKEN,
    })
    // No fallback exists for ATH, but a zero must read as absent rather than
    // as an all-time high of nothing — which would put the ATH distance at
    // +infinity%.
    expect(out.athUsd).toBeNull()
  })
})

describe('when CoinPaprika is down', () => {
  const out = mergeMarketData({ paprikaTicker: null, krakenTicker: KRAKEN })

  it('still has a USD price, from a response already in hand', () => {
    // The whole point. This costs no extra request: the Kraken ticker call is
    // in the same Promise.allSettled burst and already carried XBTUSD.
    expect(out.priceUsd).toBe(104500)
  })

  it('keeps the fiat volumes computable', () => {
    // They divide by priceUsd, so before the fallback a CoinPaprika outage
    // blanked all four of these too — even though Kraken had supplied every
    // price involved.
    const withVolume = mergeMarketData({
      paprikaTicker: { quotes: { USD: { volume_24h: 35e9 } } },
      krakenTicker: KRAKEN,
    })
    expect(withVolume.volumeGbp).toBeCloseTo(35e9 * 82000 / 104500, 0)
  })

  it('blanks what genuinely has no other source', () => {
    // Honest blanks, not invented numbers. Each of these is documented in the
    // module as having no fallback and why.
    expect(out.volumeUsd).toBeNull()
    expect(out.priceChange24h).toBeNull()
    expect(out.athUsd).toBeNull()
  })

  it('blanks the market cap too when there is no block height to derive one from', () => {
    // `out` has no blockHeight, so both halves of the derivation are missing.
    // Two independent outages, not one.
    expect(out.marketCapUsd).toBeNull()
    expect(out.marketCapEstimated).toBe(false)
  })
})

describe('the market cap fallback', () => {
  // 900,000 blocks: 210k each at 50, 25, 12.5 and 6.25, then 60,001 at 3.125.
  // Spelled out rather than computed from `computeIssuedSupply`, so a change to
  // the epoch table has to be deliberate here as well as there.
  const SUPPLY_AT_900K = 19_875_003.125

  it('derives one from the price and the chain tip when CoinPaprika is down', () => {
    const out = mergeMarketData({
      paprikaTicker: null, krakenTicker: KRAKEN, blockHeight: 900_000,
    })
    // The price here is Kraken's, so the figure stands on two sources that are
    // not each other: mempool.space for the height, Kraken for the price.
    expect(out.marketCapUsd).toBeCloseTo(104500 * SUPPLY_AT_900K, 0)
    expect(out.marketCapEstimated).toBe(true)
  })

  it('prefers CoinPaprika whenever it answers, and says the figure is not derived', () => {
    const out = mergeMarketData({ ...ALL, blockHeight: 900_000 })
    expect(out.marketCapUsd).toBe(2.1e12)
    expect(out.marketCapEstimated).toBe(false)
  })

  it('treats a zero market cap as a broken body, not as an answer', () => {
    // The 200-with-a-broken-body case again: `??` would hand a market cap of
    // zero straight to the card. Same trap as v1.6.5 and v1.6.6.
    const out = mergeMarketData({
      paprikaTicker: { quotes: { USD: { price: 105000, market_cap: 0 } } },
      krakenTicker: KRAKEN,
      blockHeight: 900_000,
    })
    expect(out.marketCapUsd).toBeCloseTo(105000 * SUPPLY_AT_900K, 0)
    expect(out.marketCapEstimated).toBe(true)
  })

  it('refuses to derive one without a usable price', () => {
    // Every price source down. A market cap of zero is worse than none: it is
    // a headline figure, and 0 reads as a fact rather than as an absence.
    const out = mergeMarketData({ blockHeight: 900_000 })
    expect(out.marketCapUsd).toBeNull()
    expect(out.marketCapEstimated).toBe(false)
  })

  it('refuses a block height that is not a number', () => {
    // mempool.space answers that endpoint with a bare integer, so a failed
    // parse or an HTML error page arrives as a string or an object rather than
    // as null — and `computeIssuedSupply` would do arithmetic on either.
    for (const height of ['900000', {}, NaN, -1, null]) {
      const out = mergeMarketData({ paprikaTicker: null, krakenTicker: KRAKEN, blockHeight: height })
      expect(out.marketCapUsd, String(height)).toBeNull()
      expect(out.marketCapEstimated, String(height)).toBe(false)
    }
  })
})

describe('estimateMarketCapUsd', () => {
  it('is price × issued supply, and null the moment either half is missing', () => {
    expect(estimateMarketCapUsd(100_000, 900_000)).toBeCloseTo(1_987_500_312_500, 0)
    expect(estimateMarketCapUsd(0, 900_000)).toBeNull()
    expect(estimateMarketCapUsd(100_000, null)).toBeNull()
    expect(estimateMarketCapUsd(null, 900_000)).toBeNull()
    // Genesis alone is 50 BTC, which is a real supply — the guard is on the
    // height being a number, not on it being large.
    expect(estimateMarketCapUsd(100_000, 0)).toBe(5_000_000)
  })
})

describe('when Kraken is down', () => {
  const out = mergeMarketData({ paprikaTicker: PAPRIKA, krakenTicker: null })

  it('keeps the USD price and everything derived from it', () => {
    expect(out.priceUsd).toBe(105000)
    expect(out.volumeUsd).toBe(35e9)
    expect(out.athUsd).toBe(109000)
  })

  it('blanks the four currencies only Kraken supplies', () => {
    expect(out.priceGbp).toBeNull()
    expect(out.priceEur).toBeNull()
    expect(out.volumeGbp).toBeNull()
  })
})

describe('when both price sources are down', () => {
  it('returns nulls rather than NaN', () => {
    const out = mergeMarketData({})
    // NaN renders as "NaN" on a card; null is what the loading and empty
    // states already know how to handle.
    for (const key of ['priceUsd', 'priceGbp', 'volumeUsd', 'volumeGbp', 'athUsd', 'marketCapUsd']) {
      expect(out[key], key).toBeNull()
    }
  })

  it('does not throw on no argument at all', () => {
    expect(() => mergeMarketData()).not.toThrow()
  })
})

describe('the non-price sources', () => {
  it('passes each through, and nulls it when its call failed', () => {
    const out = mergeMarketData({
      ...ALL,
      fees: { fastestFee: 12 },
      blockHeight: 900000,
      difficulty: { progressPercent: 40 },
      mempool: { count: 1000 },
      lightning: { channel_count: 50000 },
      blocks: [{ timestamp: 1234 }, { timestamp: 1000 }],
    })
    expect(out.fees).toEqual({ fastestFee: 12 })
    expect(out.blockHeight).toBe(900000)
    expect(out.lastBlockTs).toBe(1234)

    const down = mergeMarketData(ALL)
    expect(down.fees).toBeNull()
    expect(down.lastBlockTs).toBeNull()
  })

  it('reads Fear & Greed oldest-first for the sparkline, newest for the value', () => {
    // alternative.me returns newest first. Drawing the series in that order is
    // a mirror image that still looks like a plausible chart — the same trap
    // `vibeHistory.js` guards against.
    const out = mergeMarketData({
      ...ALL,
      fng: { data: [{ value: '70' }, { value: '60' }, { value: '50' }] },
    })
    expect(out.fng).toEqual({ value: '70' })
    expect(out.fngHistory).toEqual([{ v: 50 }, { v: 60 }, { v: 70 }])
  })

  it('blanks Fear & Greed rather than inventing an empty series', () => {
    expect(mergeMarketData({ ...ALL, fng: { data: [] } }).fngHistory).toBeNull()
    expect(mergeMarketData({ ...ALL, fng: null }).fng).toBeNull()
  })

  it('survives an empty block list', () => {
    expect(mergeMarketData({ ...ALL, blocks: [] }).lastBlockTs).toBeNull()
  })
})
