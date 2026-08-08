import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { runtimeCaching } from '../lib/runtimeCaching.js'

// The service worker's runtime caching drifted once already: it carried a rule
// for api.coingecko.com long after CoinGecko was replaced, while the two hosts
// that actually served price and chart data had no rule at all. The result was
// a PWA that cached a host it never called and dropped the data it did.
//
// These tests pin the rule set to the data sources in CLAUDE.md's "External
// APIs" table, so removing a source without removing its rule — or adding one
// without adding a rule — fails here rather than silently degrading offline.

// Every host the dashboard fetches from, with a representative URL.
const DATA_SOURCES = [
  ['CoinPaprika',  'https://api.coinpaprika.com/v1/tickers/btc-bitcoin'],
  ['Kraken OHLC',  'https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440'],
  ['mempool.space', 'https://mempool.space/api/v1/fees/recommended'],
  ['Alternative.me', 'https://api.alternative.me/fng/?limit=30'],
  ['chain-data',   'https://bitcoinvibecheck.com/api/chain-data'],
  ['metric snapshots', 'https://abcdef123456.supabase.co/rest/v1/metric_snapshots?select=captured_on,metrics'],
]

function ruleFor(url) {
  return runtimeCaching.find(r => r.urlPattern.test(url))
}

describe('PWA runtime caching', () => {
  it.each(DATA_SOURCES)('caches %s', (_name, url) => {
    expect(ruleFor(url)).toBeDefined()
  })

  it('has no rule for a host the app no longer calls', () => {
    expect(ruleFor('https://api.coingecko.com/api/v3/simple/price')).toBeUndefined()
  })

  it('has no rule matching Binance, which answers US visitors with HTTP 451', () => {
    expect(ruleFor('https://api.binance.com/api/v3/klines')).toBeUndefined()
  })

  it('does not cache the donor list alongside the snapshot history', () => {
    // The snapshot rule is scoped to one table on purpose. Widening it to the
    // Supabase host would put the supporter ticker — a list people expect to
    // see their own name appear in — behind the history's day-long expiry.
    expect(ruleFor('https://abcdef123456.supabase.co/rest/v1/donors?select=name')).toBeUndefined()
  })

  it('serves fresh data when the network is up', () => {
    // NetworkFirst everywhere. A CacheFirst rule on a price endpoint would show
    // hour-old numbers to a user with a working connection.
    for (const rule of runtimeCaching) {
      expect(rule.handler).toBe('NetworkFirst')
      expect(rule.options.networkTimeoutSeconds).toBeGreaterThan(0)
    }
  })

  it('never caches an error response', () => {
    // Without this, a 500 or a Kraken rate-limit body would be served from
    // cache for the whole expiration window.
    for (const rule of runtimeCaching) {
      expect(rule.options.cacheableResponse.statuses).toEqual([200])
    }
  })

  it('is actually registered by the service worker', () => {
    // These rules used to be handed to VitePWA's `workbox` block, which read
    // them. Under injectManifest nothing reads them unless `src/sw.js` does —
    // so without this, the array could keep passing every assertion above
    // while caching nothing at all.
    const source = readFileSync(
      join(resolve(import.meta.dirname, '../..'), 'src/sw.js'),
      'utf8'
    )
    expect(source).toMatch(/from '\.\/lib\/runtimeCaching\.js'/)
    expect(source).toMatch(/registerRoute\(/)
  })

  it('gives every rule a distinct cache name and a bounded expiration', () => {
    const names = runtimeCaching.map(r => r.options.cacheName)
    expect(new Set(names).size).toBe(names.length)

    for (const rule of runtimeCaching) {
      expect(rule.options.expiration.maxEntries).toBeGreaterThan(0)
      expect(rule.options.expiration.maxAgeSeconds).toBeGreaterThan(0)
    }
  })
})
