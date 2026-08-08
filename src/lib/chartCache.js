// The chart's per-range store — and the reason two prefetch paths can coexist
// without racing each other (#41).
//
// `App` warms all four ranges in a mount-time effect, and the main chart effect
// *also* loads the active range, behind a 400ms debounce. The effect checked the
// cache in its body — at t=0 — and then fetched at t=400ms without re-checking.
// Measured on a cold production build, all four prefetches landed by t≈388ms, so
// the entry the debounced fetch was about to refetch was already sitting in the
// cache it had consulted. Not an intermittent race: on any healthy connection
// the active range was requested twice, every load.
//
// Two rules follow, and they are the whole module:
//
//   1. **The cache is read when the request is made, not when it is scheduled.**
//      Any gap between the two — a debounce, a five-second retry timer — is a
//      window for another path's fetch to land in.
//   2. **A request already in flight is joined, not duplicated.** `fetchKrakenCandles`
//      collapses concurrent callers of one URL (#24), but only while they
//      overlap in time. These two paths do not overlap — the prefetch has
//      *finished* by the time the debounce expires — so the sharing has to
//      happen a layer up, where the result outlives the request that produced
//      it.
//
// Deliberately not generic beyond that: no TTL, no size bound. A range's candles
// are refreshed by `invalidate` from the Refresh button, and the whole store
// dies with the page.

/**
 * A per-key cache over an async fetcher, which joins a request in flight rather
 * than issuing a second one.
 *
 * `fetchRange(key)` is called at most once per key per settled request. Its
 * rejection is passed straight through to whoever called `load` — the chart's
 * error-and-retry path needs the throw — and leaves nothing cached, so the next
 * `load` tries again.
 */
export function createChartCache(fetchRange) {
  const cache = new Map()
  const inFlight = new Map()

  // Calls the fetcher in the caller's own tick — the request should leave as
  // early as it did when the effect called `fetchChart` directly — while turning
  // a synchronous throw into a rejection, since the fire-and-forget prefetch
  // callers have no try/catch to meet one.
  function startRequest(key) {
    try { return Promise.resolve(fetchRange(key)) } catch (err) { return Promise.reject(err) }
  }

  function load(key) {
    if (cache.has(key)) return Promise.resolve(cache.get(key))

    const existing = inFlight.get(key)
    if (existing) return existing

    const request = startRequest(key)
      .then(result => {
        // Only cache while this is still the request the key is waiting on.
        // `invalidate` dropping the entry is how Refresh says "the answer I am
        // waiting for is already stale"; writing unconditionally here would put
        // that discarded answer back and let it overwrite the fresh one.
        if (inFlight.get(key) === request) cache.set(key, result)
        return result
      })

    inFlight.set(key, request)

    // `then(clear, clear)` rather than `.finally(clear)`: finally re-throws, so
    // the derived promise would reject with nothing awaiting it and every failed
    // range fetch would raise an unhandled rejection. Same trap as `ohlc.js`.
    const clear = () => { if (inFlight.get(key) === request) inFlight.delete(key) }
    request.then(clear, clear)

    return request
  }

  return {
    /** Synchronous — the chart effect serves a cache hit without a loading flash. */
    has: key => cache.has(key),
    get: key => cache.get(key),
    load,
    /** Forget a range, and disown any request for it still in flight. */
    invalidate: key => { cache.delete(key); inFlight.delete(key) },
  }
}
