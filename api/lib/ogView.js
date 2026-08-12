// The link-preview image, as data and as an element tree — no rendering, no
// network, no wasm. `api/og.js` fetches the numbers and hands them to
// `buildOgModel`; Satori turns `ogElement` into a PNG.
//
// The split exists so the layout is testable. Rasterising is slow and the
// output is a bitmap nobody can assert against; the model in between is plain
// strings and colours, and that is where every formatting decision lives.

import { PALETTE } from '../../src/lib/palette.js'
import { vibeLabelHex, fngLabelHex, fngScoreHex } from '../../src/lib/scales.js'
import {
  WORDMARK_LINES, GLYPH_HEIGHT, LINE_GAP, lineWidth, lineDataUri,
} from '../../src/lib/wordmark.js'
import { grainBackground } from '../../src/lib/crt.js'

export const OG_WIDTH  = 1200
export const OG_HEIGHT = 630

// **Always the dark theme, whatever the visitor has chosen.** An unfurler has
// no visitor and no `localStorage` to read one from, and the card is drawn once
// on the server for everybody who sees the link. Dark is the product's default
// and the identity people recognise in a feed, so it is what gets rendered —
// this is a deliberate choice rather than an oversight about light mode.
//
// Read from the palette rather than restated: this file used to carry its own
// constant block, which is how `#f97316` came to be the brand colour here while
// `#fb923c` was the brand colour in the app.
const C = PALETTE.dark
const BG       = C.ground
const ACCENT   = C.accent
const WHITE    = C.ink
const MUTED    = C.quiet
const DIM      = C.muted
const GREEN    = C.up
const RED      = C.down
const PANEL    = C.surface
const HAIRLINE = C.line

// Satori ships one font: Geist Regular. Every string in this file is drawn in
// it, and it has no ₿ (U+20BF) — that character would rasterise as a tofu box
// in every chat preview. Anything added here needs checking against the same
// font; `ogImage.test.js` pins the allowed character set.
//
// The title is the one thing that escaped that constraint: it is drawn now
// rather than set, from the same `wordmark.js` the header renders through, so
// the preview card and the site show the same picture instead of the same
// string in two different faces.
const OG_TAGLINE = 'Read the room.'
const OG_DOMAIN  = 'bitcoinvibecheck.com'

const isNum = v => v != null && Number.isFinite(v)

function fmtUsd(value) {
  if (!isNum(value)) return null
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function fmtSignedPct(value, digits = 2) {
  if (!isNum(value)) return null
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

// `As of 14:05 UTC · 6 August 2026` — the same phrasing ShareCanvas puts in the
// footer of an exported card. `now` is a parameter so the timestamp is testable
// and so the whole model stays a pure function of its inputs.
export function fmtOgTimestamp(now) {
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return `As of ${time} UTC · ${date}`
}

/**
 * Colour the Fear & Greed line by the classification alternative.me sent.
 *
 * The numeric fallback is for a response that carries a value but no label. It
 * is this project's reading of the scale, not the source's, and where the two
 * disagree the source wins — its word is the one printed on the card.
 *
 * Both halves now come from `scales.js`, which is the point: this file's own
 * ladder used slightly different cut-offs from the app's (`< 45` against
 * `<= 46`, `<= 55` against `<= 54`), so a score of 45 could be drawn in one
 * colour on the card and another in the preview of the same card.
 */
function fngHex(score, label) {
  return fngLabelHex(label, 'dark') ?? fngScoreHex(score, 'dark') ?? MUTED
}

/**
 * Shape whatever arrived into the strings and colours the image draws.
 *
 * Every field is optional and every field degrades to `null` on its own, which
 * the tree reads as "leave that line out". The one thing this does not do is
 * invent a value: a preview showing a stale or made-up price is worse than one
 * showing fewer numbers, because the entire point of replacing the static image
 * is that this one is true at the moment it renders.
 */
export function buildOgModel({
  priceUsd       = null,
  priceChange24h = null,
  athUsd         = null,
  fngScore       = null,
  fngLabel       = null,
  vibe           = null,
  now            = new Date(),
} = {}) {
  const athPct = isNum(priceUsd) && isNum(athUsd) && athUsd !== 0
    ? ((priceUsd - athUsd) / athUsd) * 100
    : null
  const atAth = athPct != null && athPct >= -0.1

  return {
    price: fmtUsd(priceUsd),
    change: isNum(priceChange24h)
      ? {
          text:  `${priceChange24h >= 0 ? '▲' : '▼'} ${fmtSignedPct(priceChange24h)} 24h`,
          color: priceChange24h >= 0 ? GREEN : RED,
        }
      : null,
    ath: athPct == null ? null
      : { text: atAth ? 'AT ALL-TIME HIGH' : `${athPct.toFixed(1)}% from ATH`,
          color: atAth ? GREEN : MUTED },
    vibe: vibe?.score != null
      ? { score: String(vibe.score), label: vibe.label ?? '', color: vibeLabelHex(vibe.label, 'dark') }
      : null,
    // The score can be null while its inputs are not — a composite needs 3 of 5
    // dimensions, the sentence needs one — so the summary is read independently
    // rather than nested under `vibe`.
    summary: vibe?.summary ?? null,
    fng: isNum(fngScore)
      ? { text: `Fear & Greed ${Math.round(fngScore)}${fngLabel ? ` · ${fngLabel}` : ''}`,
          color: fngHex(fngScore, fngLabel) }
      : null,
    timestamp: fmtOgTimestamp(now),
  }
}

/**
 * True when there is enough here to be worth rendering.
 *
 * Below this the caller falls back to the static image. An unfurl that says
 * "Bitcoin Vibe Check" with two blank slots looks broken in a way the old
 * static card never did, and a broken preview is a worse outcome than a generic
 * one.
 */
export function ogModelIsRenderable(model) {
  return Boolean(model?.price || model?.vibe)
}

// Satori takes React elements, but only reads `type`, `props` and `key` — so
// plain objects work and this function stays free of a React dependency inside
// a serverless function whose only job is to draw a bitmap.
export function h(type, props = {}, children) {
  return {
    type,
    key: null,
    props: children === undefined ? props : { ...props, children },
  }
}

// These take a style, not props. Satori renders once and reconciles nothing, so
// there are no keys to give — anything that looks like one here would be a CSS
// property named `key`, silently ignored.
const row = (style, children) => h('div', { style: { display: 'flex', ...style } }, children)
const col = (style, children) => h('div', { style: { display: 'flex', flexDirection: 'column', ...style } }, children)
const text = (style, value) => h('div', { style: { display: 'flex', ...style } }, value)

const LABEL = {
  fontSize: 22,
  color: MUTED,
  letterSpacing: '0.16em',
}

/**
 * The wordmark, as two `<img>` elements carrying inline SVG.
 *
 * **This is the reason the drawn wordmark is worth anything on this surface.**
 * Satori ships one font and no U+20BF, which is why `OG_TITLE` spells the name
 * out in Geist — a face nothing else in the product uses, so the preview card
 * and the site have never actually shared a wordmark, only a string. Drawing it
 * makes them the same picture: `lineSvg` is the same function the header
 * renders through, so the two cannot drift.
 *
 * Baked at the cell size rather than scaled by the `<img>` box, so every cell
 * lands on a whole pixel in the raster the way it does in the browser.
 */
const OG_WORDMARK_CELL = 6

function wordmark() {
  return WORDMARK_LINES.map((line, i) => {
    const width = lineWidth(line) * OG_WORDMARK_CELL
    const height = GLYPH_HEIGHT * OG_WORDMARK_CELL
    return h('img', {
      src: lineDataUri(line, { cell: OG_WORDMARK_CELL, fill: i === 0 ? WHITE : ACCENT }),
      width,
      height,
      style: { marginTop: i === 0 ? 0 : LINE_GAP * OG_WORDMARK_CELL },
    })
  })
}

/**
 * The 1200×630 tree.
 *
 * Sized for a chat list rather than for a preview tool: the price and the score
 * are the only things guaranteed to survive being scaled to a 200px-wide
 * thumbnail, so they get the space and everything else is support.
 */
export function ogElement(model) {
  return col({
    width: '100%',
    height: '100%',
    // `backgroundColor` plus the raster, never the `background` shorthand —
    // the shorthand resets `background-image` and would remove one of the two.
    //
    // **Satori draws the stylesheet's own shorthand gradient as something
    // else** — a smooth two-pixel ramp rather than a three-pixel hard raster,
    // measured — which is why this comes from `grainBackground` rather than
    // from a string copied out of `index.css`. See `crt.js`.
    backgroundColor: BG,
    ...grainBackground(WHITE),
    fontFamily: 'Geist',
    color: WHITE,
  }, [
    h('div', { style: { display: 'flex', height: 10, background: ACCENT } }),

    col({ flex: 1, padding: '40px 56px 36px', justifyContent: 'space-between' }, [

      row({ alignItems: 'center', justifyContent: 'space-between' }, [
        col({}, [
          ...wordmark(),
          text({ fontSize: 22, color: MUTED, marginTop: 10 }, OG_TAGLINE),
        ]),
        text({ fontSize: 22, color: DIM }, OG_DOMAIN),
      ]),

      row({ alignItems: 'center', justifyContent: 'space-between', gap: 40 }, [
        // Price side. Seven figures need the smaller size to clear the panel.
        col({ flex: 1 }, [
          text({ ...LABEL }, 'BTC / USD'),
          text({
            fontSize: model.price && model.price.length > 9 ? 96 : 112,
            color: WHITE,
            marginTop: 8,
            lineHeight: 1.1,
          }, model.price ?? '—'),
          model.change && text({ fontSize: 34, color: model.change.color, marginTop: 14 }, model.change.text),
          model.ath && text({ fontSize: 26, color: model.ath.color, marginTop: 10 }, model.ath.text),
        ].filter(Boolean)),

        // Vibe side
        model.vibe && col({
          width: 380,
          background: PANEL,
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 20,
          padding: '22px 28px 26px',
          alignItems: 'center',
        }, [
          text({ ...LABEL, fontSize: 20 }, 'VIBE SCORE'),
          text({ fontSize: 132, color: model.vibe.color, lineHeight: 1.05, marginTop: 4 }, model.vibe.score),
          text({ fontSize: 34, color: model.vibe.color }, model.vibe.label),
        ]),
      ].filter(Boolean)),

      col({}, [
        model.summary && text({ fontSize: 28, color: DIM, lineHeight: 1.4 }, model.summary),
        row({
          marginTop: 16,
          paddingTop: 16,
          borderTop: `1px solid ${HAIRLINE}`,
          alignItems: 'center',
          justifyContent: 'space-between',
        }, [
          // A spacer rather than a second copy of the domain: it already sits in
          // the header, and repeating it reads as a template with a hole in it.
          model.fng
            ? text({ fontSize: 24, color: model.fng.color }, model.fng.text)
            : h('div', { style: { display: 'flex' } }),
          text({ fontSize: 22, color: MUTED }, model.timestamp),
        ]),
      ].filter(Boolean)),
    ]),
  ])
}
