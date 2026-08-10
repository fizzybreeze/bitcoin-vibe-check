// @vitest-environment node
//
// Node, not jsdom: this file rasterises a real PNG through Satori and resvg's
// wasm build, which is what `api/og.js` does on every cache miss.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import {
  buildOgModel, ogElement, ogModelIsRenderable, fmtOgTimestamp, OG_WIDTH, OG_HEIGHT,
} from '../../api/lib/ogView.js'
import { collectOgData } from '../../api/og.js'
// Read rather than transcribed. These used to be literals, which is the same
// mistake the file under test was making — and it meant the preview could be
// re-hued without a single assertion noticing, because the literals here would
// have been updated to match whatever it now produced. The image is always
// rendered in the dark theme; there is no visitor to ask for a preference.
import { PALETTE } from '../lib/palette.js'

const C = PALETTE.dark

/** The static card `api/og.js` redirects to when it cannot render a live one. */
const FALLBACK = new URL('../../public/og-image.png', import.meta.url)

const NOW = new Date('2026-08-06T14:05:00Z')

const FULL = {
  priceUsd: 118_432.51,
  priceChange24h: 2.41,
  athUsd: 126_000,
  fngScore: 72,
  fngLabel: 'Greed',
  vibe: { score: 68, label: 'Hot', summary: 'Market greedy, price climbing.' },
  now: NOW,
}

describe('buildOgModel', () => {
  it('formats the price as whole dollars', () => {
    expect(buildOgModel(FULL).price).toBe('$118,433')
  })

  it('marks a rise with an up arrow and green, a fall with a down arrow and red', () => {
    const up   = buildOgModel({ ...FULL, priceChange24h: 2.41 }).change
    const down = buildOgModel({ ...FULL, priceChange24h: -3.2 }).change
    expect(up.text).toBe('▲ +2.41% 24h')
    expect(up.color).toBe(C.up)
    expect(down.text).toBe('▼ -3.20% 24h')
    expect(down.color).toBe(C.down)
  })

  it('reports distance from the all-time high', () => {
    expect(buildOgModel(FULL).ath.text).toBe('-6.0% from ATH')
  })

  it('calls out an all-time high rather than printing -0.0%', () => {
    const at = buildOgModel({ ...FULL, priceUsd: 126_000, athUsd: 126_000 }).ath
    expect(at.text).toBe('AT ALL-TIME HIGH')
    expect(at.color).toBe(C.up)
  })

  it('colours the Vibe Score by its temperature label', () => {
    expect(buildOgModel(FULL).vibe).toEqual({ score: '68', label: 'Hot', color: C['vibe-hot'] })
    expect(buildOgModel({ ...FULL, vibe: { score: 12, label: 'Ice Cold' } }).vibe.color)
      .toBe(C['vibe-ice'])
  })

  it('renders a score of 0 rather than treating it as absent', () => {
    expect(buildOgModel({ ...FULL, vibe: { score: 0, label: 'Ice Cold' } }).vibe.score).toBe('0')
  })

  it('keeps the summary sentence when the score itself could not be composed', () => {
    // computeVibeScore needs 3 of 5 dimensions; the sentence needs one. The
    // image shows whichever survived.
    const model = buildOgModel({ ...FULL, vibe: { score: null, summary: 'Market fearful.' } })
    expect(model.vibe).toBeNull()
    expect(model.summary).toBe('Market fearful.')
  })

  // Caught on the preview: alternative.me returned 25 with "Extreme Fear", and
  // colouring by the number painted it amber — the Fear colour — inside a string
  // whose own last word said Extreme Fear. Their bands are theirs to move, and
  // the label is what the reader sees, so the label decides the colour.
  it('colours Fear & Greed by the label the source sent, not by the number', () => {
    expect(buildOgModel({ ...FULL, fngScore: 25, fngLabel: 'Extreme Fear' }).fng)
      .toEqual({ text: 'Fear & Greed 25 · Extreme Fear', color: C['fng-extreme-fear'] })
  })

  it('falls back to numeric bands only when no classification came back', () => {
    expect(buildOgModel({ ...FULL, fngScore: 12, fngLabel: null }).fng)
      .toEqual({ text: 'Fear & Greed 12', color: C['fng-extreme-fear'] })
    expect(buildOgModel({ ...FULL, fngScore: 90, fngLabel: null }).fng.color).toBe(C['fng-extreme-greed'])
  })

  it('stamps the time in UTC', () => {
    expect(buildOgModel(FULL).timestamp).toBe('As of 14:05 UTC · 6 August 2026')
    expect(fmtOgTimestamp(new Date('2026-01-09T03:07:00Z')))
      .toBe('As of 03:07 UTC · 9 January 2026')
  })

  it('degrades every field independently instead of throwing', () => {
    const empty = buildOgModel({ now: NOW })
    expect(empty.price).toBeNull()
    expect(empty.change).toBeNull()
    expect(empty.ath).toBeNull()
    expect(empty.vibe).toBeNull()
    expect(empty.fng).toBeNull()
    expect(empty.timestamp).toContain('UTC')
  })

  it('takes no arguments at all', () => {
    expect(() => buildOgModel()).not.toThrow()
  })
})

describe('ogModelIsRenderable', () => {
  it('renders on either the price or the score alone', () => {
    expect(ogModelIsRenderable(buildOgModel({ priceUsd: 100_000 }))).toBe(true)
    expect(ogModelIsRenderable(buildOgModel({ vibe: { score: 40, label: 'Cool' } }))).toBe(true)
  })

  // Falling back to the static image beats publishing a card with two blank
  // slots in it — the failure is invisible to whoever pasted the link.
  it('refuses a card with neither, so the caller falls back to the static image', () => {
    expect(ogModelIsRenderable(buildOgModel({ fngScore: 50 }))).toBe(false)
    expect(ogModelIsRenderable(null)).toBe(false)
  })
})

// Walk the plain-object element tree the way Satori does, collecting the text.
function textOf(node, out = []) {
  if (node == null || node === false) return out
  if (typeof node === 'string') { out.push(node); return out }
  if (Array.isArray(node)) { node.forEach(n => textOf(n, out)); return out }
  return textOf(node.props?.children, out)
}

describe('ogElement', () => {
  it('puts every number in the image', () => {
    const strings = textOf(ogElement(buildOgModel(FULL))).join(' | ')
    expect(strings).toContain('$118,433')
    expect(strings).toContain('68')
    expect(strings).toContain('Hot')
    expect(strings).toContain('Fear & Greed 72 · Greed')
    expect(strings).toContain('Market greedy, price climbing.')
    expect(strings).toContain('As of 14:05 UTC')
  })

  it('drops the score panel rather than drawing an empty one', () => {
    const strings = textOf(ogElement(buildOgModel({ ...FULL, vibe: null })))
    expect(strings).not.toContain('VIBE SCORE')
  })

  it('names the site without the ₿ character', () => {
    // The live site's wordmark is "₿ Bitcoin Vibe Check". Satori's bundled Geist
    // has no U+20BF glyph, so that character rasterises as a tofu box — see the
    // character-set guard below, which is the general form of this.
    expect(textOf(ogElement(buildOgModel(FULL))).join('')).not.toContain('₿')
  })

  // The renderer has exactly one font and it is not negotiable at request time.
  // Anything drawn outside this set is a box in every chat preview, and nothing
  // in the pipeline would report it — the PNG renders fine.
  it('draws only characters the bundled font covers', () => {
    const ALLOWED = /^[\x20-\x7E·—▲▼≈]*$/
    const samples = [
      buildOgModel(FULL),
      buildOgModel({ ...FULL, priceChange24h: -3.2, priceUsd: 126_000, athUsd: 126_000 }),
      buildOgModel({ now: NOW }),
    ]
    for (const model of samples) {
      for (const str of textOf(ogElement(model))) {
        expect(str, `unsupported glyph in ${JSON.stringify(str)}`).toMatch(ALLOWED)
      }
    }
  })
})

// PNG: an 8-byte signature, then an IHDR chunk whose payload opens with width
// and height as big-endian uint32s. Asserting the header rather than the byte
// length is what makes this a real check — Satori will happily produce a valid
// PNG of the wrong size, and 1200×630 is the dimension pair every unfurler
// expects from the meta tags.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngSize(bytes) {
  expect(Array.from(bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE)
  expect(String.fromCharCode(...bytes.subarray(12, 16))).toBe('IHDR')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

async function renderPng(model) {
  const { ImageResponse } = await import('@vercel/og')
  const image = new ImageResponse(ogElement(model), { width: OG_WIDTH, height: OG_HEIGHT })
  return new Uint8Array(await image.arrayBuffer())
}

describe('rendering', () => {
  it('rasterises to a 1200x630 PNG', async () => {
    expect(pngSize(await renderPng(buildOgModel(FULL)))).toEqual({ width: 1200, height: 630 })
  }, 30_000)

  it('rasterises the degraded card too', async () => {
    const model = buildOgModel({ priceUsd: 98_765.4, priceChange24h: -3.2, now: NOW })
    expect(pngSize(await renderPng(model))).toEqual({ width: 1200, height: 630 })
  }, 30_000)
})

// ─── The wiring ──────────────────────────────────────────────────────────────
//
// Three files have to agree for a link preview to work, and nothing else in the
// pipeline notices when they stop agreeing: the unfurl just goes stale or blank,
// which no test, build or page load can see.

describe('og:image wiring', () => {
  const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

  it('points both og:image and twitter:image at the generated path', () => {
    const html = read('index.html')
    expect(html).toContain('property="og:image" content="https://bitcoinvibecheck.com/og-live.png"')
    expect(html).toContain('name="twitter:image" content="https://bitcoinvibecheck.com/og-live.png"')
  })

  it('rewrites that path to the function', () => {
    const { rewrites } = JSON.parse(read('vercel.json'))
    expect(rewrites).toContainEqual({ source: '/og-live.png', destination: '/api/og' })
  })

  it('keeps the static fallback the function redirects to', () => {
    expect(existsSync(FALLBACK)).toBe(true)
  })

  it('ships that fallback as a real PNG the same size as the live render', () => {
    // The fallback and the live card occupy one slot, so they have to be one
    // shape. This drifted unnoticed for exactly the reason the redirect exists:
    // a fallback rendering *is* the old behaviour, so an unfurl that sheds to
    // it looks fine, and nothing anywhere compares the two. It was 3750×1969 —
    // the same aspect at 3.1× the scale, 167 KB of precache for a file no
    // browser ever requests — and still in the pre-Afterglow orange, months
    // after the app was re-skinned.
    const bytes = readFileSync(FALLBACK)
    const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    expect(magic.every((byte, i) => bytes[i] === byte), 'not a PNG').toBe(true)

    const read = at => bytes.readUInt32BE(at)
    expect({ width: read(16), height: read(20) })
      .toEqual({ width: OG_WIDTH, height: OG_HEIGHT })
  })
})

// ─── Reading the upstream sources ────────────────────────────────────────────
//
// The shaping between "what the APIs return" and "what the image draws" is
// where a silent failure lives: rename a field upstream and every field it
// feeds simply stops appearing, with a valid PNG rendered around the hole and
// nothing anywhere that reports it.

// Kraken candle: [time, open, high, low, close, vwap, volume, count].
const CANDLES = Array.from({ length: 231 }, (_, i) => [
  1_700_000_000 + i * 86_400, '100', '110', '90', String(100_000 + i * 10), '100', '1.5', 42,
])

const FIXTURES = {
  'api.coinpaprika.com': {
    quotes: { USD: { price: 118_432.51, percent_change_24h: 2.41, ath_price: 126_000 } },
  },
  'api.alternative.me': { data: [{ value: '72', value_classification: 'Greed' }] },
  'api.kraken.com': { error: [], result: { XXBTZUSD: CANDLES, last: 1 } },
  'fees/recommended': { fastestFee: 12, halfHourFee: 8, hourFee: 5, economyFee: 2 },
  'api/mempool': { count: 45_000, vsize: 12_000_000 },
  'mining/hashrate': { hashrates: [{ avgHashrate: 8.0e20 }, { avgHashrate: 8.6e20 }] },
}

function stubSources({ omit = [] } = {}) {
  const seen = []
  vi.stubGlobal('fetch', vi.fn(async url => {
    seen.push(url)
    const key = Object.keys(FIXTURES).find(k => url.includes(k))
    if (!key || omit.includes(key)) return { ok: false, status: 503, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => FIXTURES[key] }
  }))
  return seen
}

describe('collectOgData', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('builds a full card from the six keyless sources', async () => {
    stubSources()
    const model = await collectOgData(NOW)

    expect(model.price).toBe('$118,433')
    expect(model.change.text).toBe('▲ +2.41% 24h')
    expect(model.ath.text).toBe('-6.0% from ATH')
    expect(model.fng.text).toBe('Fear & Greed 72 · Greed')
    expect(model.timestamp).toBe('As of 14:05 UTC · 6 August 2026')
    expect(model.vibe.score).toMatch(/^\d{1,3}$/)
    expect(model.summary).toMatch(/\.$/)
    expect(ogModelIsRenderable(model)).toBe(true)
  })

  // The quota decision, pinned. `/api/chain-data` allows 15 requests a day and
  // the live dashboard spends them; an unfurl-driven endpoint calling it would
  // blank the MVRV card to decorate a chat message.
  it('never spends the MVRV quota', async () => {
    const seen = stubSources()
    await collectOgData(NOW)
    expect(seen.join(' ')).not.toMatch(/bgeometrics|chain-data/)
  })

  it('asks only for sources that are keyless and serve the US', async () => {
    // Binance answers US jurisdictions with 451, and this runs from Vercel's
    // US regions — the mistake that cost this project two releases.
    const seen = stubSources()
    await collectOgData(NOW)
    const hosts = [...new Set(seen.map(u => new URL(u).host))].sort()
    expect(hosts).toEqual([
      'api.alternative.me', 'api.coinpaprika.com', 'api.kraken.com', 'mempool.space',
    ])
  })

  it('still draws a card when the price source is the one that failed', async () => {
    stubSources({ omit: ['api.coinpaprika.com'] })
    const model = await collectOgData(NOW)

    expect(model.price).toBeNull()
    // Sentiment, momentum, congestion and network survive — enough dimensions
    // for a score, so the card is still worth rendering.
    expect(model.vibe).not.toBeNull()
    expect(ogModelIsRenderable(model)).toBe(true)
  })

  it('falls back to the static image when every source fails', async () => {
    stubSources({ omit: Object.keys(FIXTURES) })
    expect(ogModelIsRenderable(await collectOgData(NOW))).toBe(false)
  })

  it('reads numbers that arrive as strings', async () => {
    // CoinPaprika sends `price` as a string in some responses and a number in
    // others. An unconverted string is not finite, and a non-finite input is
    // dropped silently — the line just disappears from the image.
    vi.stubGlobal('fetch', vi.fn(async url => ({
      ok: true,
      status: 200,
      json: async () => url.includes('coinpaprika')
        ? { quotes: { USD: { price: '118432.51', percent_change_24h: '2.41', ath_price: '126000' } } }
        : {},
    })))
    const model = await collectOgData(NOW)
    expect(model.price).toBe('$118,433')
    expect(model.change.text).toBe('▲ +2.41% 24h')
    expect(model.ath.text).toBe('-6.0% from ATH')
  })
})

// ─── The handler's promises ──────────────────────────────────────────────────

function mockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v },
    status(code) { this.statusCode = code; return this },
    end(body) { this.body = body; return this },
  }
  return res
}

describe('api/og handler', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('redirects to the static image when every source is down', async () => {
    // The one promise this endpoint has to keep: unfurlers do not retry, so a
    // dead upstream must still produce an image.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { default: handler } = await import('../../api/og.js')

    const res = mockRes()
    await handler({ method: 'GET', headers: {} }, res)

    expect(res.statusCode).toBe(302)
    expect(res.headers.Location).toBe('/og-image.png')
    // A transient outage must not pin the generic card in front of every share
    // for the full five-minute image cache.
    expect(res.headers['Cache-Control']).toContain('s-maxage=60')
  }, 30_000)

  it('rejects methods other than GET and HEAD', async () => {
    const { default: handler } = await import('../../api/og.js')
    const res = mockRes()
    await handler({ method: 'POST', headers: {} }, res)
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('GET, HEAD')
  })
})
