import { describe, it, expect, vi } from 'vitest'
import { createChartCache, chartCacheKey } from '../chartCache.js'

/** A fetcher whose promises are resolved by hand, so overlap is exact. */
function deferredFetcher() {
  const calls = []
  const fetcher = vi.fn(key => new Promise((resolve, reject) => {
    calls.push({ key, resolve, reject })
  }))
  return { fetcher, calls }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('chartCacheKey', () => {
  it('separates the same range in two currencies', async () => {
    // The candles differ by currency — the chart is drawn off Kraken's market
    // for the selected one. A key that dropped it would hand the GBP chart the
    // dollar candles already stored, which renders perfectly and is wrong by an
    // exchange rate.
    const fetcher = vi.fn(key => Promise.resolve(`candles:${key}`))
    const cache = createChartCache(fetcher)

    await cache.load(chartCacheKey('7D', 'usd'))
    await cache.load(chartCacheKey('7D', 'gbp'))

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(cache.get(chartCacheKey('7D', 'gbp'))).not.toBe(cache.get(chartCacheKey('7D', 'usd')))
  })

  it('keeps the range and the currency both readable back out', () => {
    // App splits the key to build the fetch. A separator either side of it would
    // silently make the range unfindable and fall back to 7D for every request.
    const [range, currency] = chartCacheKey('1Y', 'chf').split(':')
    expect([range, currency]).toEqual(['1Y', 'chf'])
  })
})

describe('createChartCache', () => {
  it('fetches a key once and serves the stored result afterwards', async () => {
    const fetcher = vi.fn(key => Promise.resolve(`candles:${key}`))
    const cache = createChartCache(fetcher)

    await expect(cache.load('7D')).resolves.toBe('candles:7D')
    await expect(cache.load('7D')).resolves.toBe('candles:7D')

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(cache.has('7D')).toBe(true)
    expect(cache.get('7D')).toBe('candles:7D')
  })

  it('keys are independent', async () => {
    const fetcher = vi.fn(key => Promise.resolve(`candles:${key}`))
    const cache = createChartCache(fetcher)

    await Promise.all([cache.load('7D'), cache.load('1M')])

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(cache.get('1M')).toBe('candles:1M')
    expect(cache.has('1Y')).toBe(false)
  })

  // #41's first half: the prefetch has *finished* by the time the debounced
  // chart fetch fires, so `fetchKrakenCandles`'s in-flight sharing cannot help —
  // the two requests never overlap. Only a stored result collapses them.
  it('a load after an earlier one settled issues no second request', async () => {
    const { fetcher, calls } = deferredFetcher()
    const cache = createChartCache(fetcher)

    cache.load('7D').catch(() => {})   // the mount prefetch
    calls[0].resolve('candles:7D')     // …which lands inside the 400ms debounce
    await flush()

    // The debounce expires and the chart effect asks for the same range.
    await expect(cache.load('7D')).resolves.toBe('candles:7D')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  // #41's second half: a slow prefetch that is still in flight when the debounce
  // expires is joined, not duplicated.
  it('a load while a request is in flight joins it', async () => {
    const { fetcher, calls } = deferredFetcher()
    const cache = createChartCache(fetcher)

    const prefetch = cache.load('7D')
    const debounced = cache.load('7D')

    expect(fetcher).toHaveBeenCalledTimes(1)
    calls[0].resolve('candles:7D')

    await expect(prefetch).resolves.toBe('candles:7D')
    await expect(debounced).resolves.toBe('candles:7D')
  })

  it('passes a rejection through and caches nothing, so the next load retries', async () => {
    const { fetcher, calls } = deferredFetcher()
    const cache = createChartCache(fetcher)

    const first = cache.load('7D')
    calls[0].reject(new Error('Kraken OHLC: HTTP 520'))
    await expect(first).rejects.toThrow('HTTP 520')
    expect(cache.has('7D')).toBe(false)

    // The chart's five-second retry.
    const second = cache.load('7D')
    expect(fetcher).toHaveBeenCalledTimes(2)
    calls[1].resolve('candles:7D')
    await expect(second).resolves.toBe('candles:7D')
  })

  // The `.finally` trap from v1.6.10, met again: `request.finally(clear)`
  // re-throws, so the derived promise rejects with nothing awaiting it and every
  // failed range fetch logs an unhandled rejection — in the degraded path, where
  // the console is the only thing left to read.
  it('a failed load raises no unhandled rejection once its caller has handled it', async () => {
    const unhandled = vi.fn()
    globalThis.process.on('unhandledRejection', unhandled)
    try {
      const cache = createChartCache(() => Promise.reject(new Error('boom')))
      await cache.load('7D').catch(() => {})
      await flush()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      globalThis.process.off('unhandledRejection', unhandled)
    }
  })

  it('a fetcher that throws synchronously surfaces as a rejection, not out of load', async () => {
    const cache = createChartCache(() => { throw new Error('bad range') })
    let thrown = null
    let promise
    try { promise = cache.load('7D') } catch (err) { thrown = err }

    expect(thrown).toBeNull()
    await expect(promise).rejects.toThrow('bad range')
  })

  it('invalidate forgets a stored range so the next load refetches', async () => {
    const fetcher = vi.fn(key => Promise.resolve(`candles:${key}`))
    const cache = createChartCache(fetcher)

    await cache.load('7D')
    cache.invalidate('7D')

    expect(cache.has('7D')).toBe(false)
    await cache.load('7D')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  // Refresh presses through a request that is already in flight. That request's
  // answer is by definition the stale one — it must neither be handed back nor
  // allowed to land in the cache on top of the fresh one.
  it('invalidate disowns a request in flight, and its late result cannot overwrite the fresh one', async () => {
    const { fetcher, calls } = deferredFetcher()
    const cache = createChartCache(fetcher)

    const stale = cache.load('7D')
    cache.invalidate('7D')

    const fresh = cache.load('7D')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fresh).not.toBe(stale)

    calls[1].resolve('fresh')
    await expect(fresh).resolves.toBe('fresh')
    expect(cache.get('7D')).toBe('fresh')

    // The disowned request settles last, which is the ordering that matters.
    calls[0].resolve('stale')
    await stale
    await flush()
    expect(cache.get('7D')).toBe('fresh')
  })
})
