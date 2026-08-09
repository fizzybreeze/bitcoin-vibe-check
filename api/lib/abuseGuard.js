// The abuse posture for the two public routes (roadmap §6).
//
// Neither `/api/og` nor `/api/chain-data` takes a parameter, and both were
// relying on the CDN as their entire defence. A CDN cache key includes the
// query string, so `?1`, `?2`, `?3` … each miss the cache and run the function:
// for `/api/og` that is six upstream fetches and a Satori rasterise per
// request, and for `/api/chain-data` it is a call to BGeometrics, whose free
// tier is 15 a day. The day's MVRV budget was fifteen requests from a browser
// address bar, and the live card would have gone to the snapshot fallback for
// the rest of the day.
//
// **Two defences, because they protect different things.**
//
//   * A parameterless route refusing query strings protects the *upstreams*.
//     There is no legitimate request carrying one — `App.jsx` fetches
//     `/api/chain-data` bare and `index.html` names `/og-live.png` bare — and
//     refusing costs no fetch and no render.
//   * A per-IP rate limit protects the *invocation count*, which the first one
//     does not touch at all: `/api/og` at the bare path is still an
//     unauthenticated rasteriser anyone can hold down.
//
// **What this is not, stated here rather than implied away.** The limiter is
// per instance and in memory. Vercel runs as many instances as it likes and a
// cold start begins at zero, so the real ceiling is the limit times however
// many are warm. That bounds a single-client flood, which is the shape a hand
// on a keyboard takes; a distributed one is a WAF's job and this is not one.
// §4.2's public API needs the real thing before it ships, and this module is
// not it.
//
// ─── Verifying this against production, and the trap in doing so ─────────────
//
// **Vercel's own fetch tooling appends `_vercel_share` to every request**, and
// a *protected* deployment consumes that parameter at the edge while production
// has nothing to consume it — so it arrives in `req.query` and is refused.
// Fetching `https://www.bitcoinvibecheck.com/api/chain-data` through that
// tooling therefore returns **400**, and `/og-live.png` sheds to the static
// image, on a site that is working perfectly. Measured, and misread once before
// it was measured properly: the giveaway is the response headers, because
// Vercel strips `s-maxage` from what it sends the client, so the live render
// arrives as `public, max-age=0` and the static file as
// `public, max-age=0, must-revalidate`.
//
// Verify with a plain browser instead — `smoke/production.spec.js` does, which
// is why those assertions live there rather than here.
//
// **The platform's parameters are deliberately not allowlisted**, tempting as
// it is after being caught by this. The CDN cache key includes the query string
// whatever this function decides, so exempting a key by name would make
// `?_vercel_share=<random>` a working cache-buster again — against the one
// route in the stack with a hard 15-a-day upstream budget, bounded then by
// nothing but the rate limit above. No visitor and no unfurler sends these
// parameters; only a developer holding Vercel's tooling does. Protecting the
// quota beats making that one tool convenient, so the trap is written down
// rather than engineered around.

const first = (value) => {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return null
  const trimmed = raw.split(',')[0].trim()
  // Blank counts as absent — a header present and empty is the same amount of
  // information as no header, and keying a bucket on '' would put every such
  // request in one shared bucket.
  return trimmed || null
}

/**
 * The client's address, as the platform reports it.
 *
 * `x-vercel-forwarded-for` and `x-real-ip` are set at Vercel's proxy and a
 * client can neither remove nor forge them. `x-forwarded-for` is a *list* that
 * an intermediary prepends to, and reading its first entry is precisely how a
 * caller rotates keys past a limiter — so it is the last resort, for a local
 * `vercel dev` where the platform headers are absent, and never the preference.
 *
 * Returns `null` when no header identifies the caller. The routes read that as
 * "do not limit" rather than "limit as one shared client": on the platform it
 * cannot happen, and if a header were ever renamed the shared-bucket reading
 * would turn one platform change into a site-wide 429.
 */
export function clientIp(headers = {}) {
  return first(headers['x-vercel-forwarded-for'])
      ?? first(headers['x-real-ip'])
      ?? first(headers['x-forwarded-for'])
}

/**
 * Does this request carry a query string?
 *
 * `req.query` is what Vercel's Node runtime parses; `req.url` is the fallback
 * for a bare handler call. A trailing `?` with nothing after it is not a
 * parameter and is not treated as one — it is what a URL bar produces, not what
 * a cache-buster does.
 */
export function hasQueryParams(req = {}) {
  const { query, url } = req
  if (query && typeof query === 'object') return Object.keys(query).length > 0
  if (typeof url !== 'string') return false
  const mark = url.indexOf('?')
  return mark !== -1 && url.length > mark + 1
}

/**
 * A fixed-window counter, bounded in the number of keys it will hold.
 *
 * The bound is the point as much as the counting is: a map keyed by client
 * address, grown without limit, is itself the memory-exhaustion vector a rate
 * limiter is added to prevent. At the cap the limiter **fails open** — expired
 * windows are pruned first, and if every key in the map is still live the new
 * caller goes unlimited rather than being refused. That is the right failure:
 * refusing at the cap would mean a flood of distinct addresses locks out
 * everybody who arrives after it, which converts an attack on the function
 * into an outage for the dashboard.
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 5_000 }) {
  const buckets = new Map()

  return {
    check(key, now = Date.now()) {
      const windowStart = Math.floor(now / windowMs) * windowMs
      const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000))

      let bucket = buckets.get(key)

      if (!bucket && buckets.size >= maxKeys) {
        for (const [k, b] of buckets) if (b.windowStart < windowStart) buckets.delete(k)
        if (buckets.size >= maxKeys) return { allowed: true, remaining: limit, retryAfterSeconds }
      }

      if (!bucket || bucket.windowStart !== windowStart) {
        bucket = { windowStart, count: 0 }
        buckets.set(key, bucket)
      }

      bucket.count += 1
      return {
        allowed: bucket.count <= limit,
        remaining: Math.max(0, limit - bucket.count),
        retryAfterSeconds,
      }
    },
    // Exported so a test can start from a clean window. Nothing in production
    // calls it — module state is per instance and dies with the instance.
    reset() { buckets.clear() },
    get size() { return buckets.size },
  }
}

/**
 * The rule both routes share: an identifiable caller is counted, an
 * unidentifiable one is let through. See `clientIp` for why that direction.
 */
export function rateLimitVerdict(limiter, req, now) {
  const ip = clientIp(req?.headers ?? {})
  if (!ip) return { allowed: true, remaining: Infinity, retryAfterSeconds: 0 }
  return limiter.check(ip, now)
}
