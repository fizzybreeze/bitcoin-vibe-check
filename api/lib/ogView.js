// The link-preview image, as data and as an element tree — no rendering, no
// network, no wasm. `api/og.js` fetches the numbers and hands them to
// `buildOgModel`; Satori turns `ogElement` into a PNG.
//
// The split exists so the layout is testable. Rasterising is slow and the
// output is a bitmap nobody can assert against; the model in between is plain
// strings and colours, and that is where every formatting decision lives.

import { vibeLabelHex, fngLabelHex } from '../../src/lib/vibePalette.js'

export const OG_WIDTH  = 1200
export const OG_HEIGHT = 630

// Shared with ShareCanvas, which is the visual language this image is meant to
// echo when the two appear in the same feed.
const BG      = '#030712'
const ORANGE  = '#f97316'
const WHITE   = '#ffffff'
const MUTED   = '#6b7280'
const DIM     = '#9ca3af'
const GREEN   = '#4ade80'
const RED     = '#f87171'
const PANEL   = '#111827'
const HAIRLINE = 'rgba(255,255,255,0.08)'

// Satori ships one font: Geist Regular. It has no ₿ (U+20BF) — the wordmark on
// the live site uses that character and it would rasterise as a tofu box in
// every chat preview, so this image spells the name out instead. Anything added
// here needs to be checked against the same font; `ogImage.test.js` pins the
// allowed character set.
export const OG_TITLE = 'BITCOIN VIBE CHECK'
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
 * The numeric bands below are a fallback for a response that carries a value
 * but no label — they are this project's reading of the scale, not the source's,
 * and where the two disagree the source wins, because its word is the one
 * printed on the card.
 */
function fngHex(score, label) {
  const byLabel = fngLabelHex(label)
  if (byLabel) return byLabel
  if (!isNum(score)) return MUTED
  if (score < 25) return RED
  if (score < 45) return '#fbbf24'
  if (score <= 55) return '#facc15'
  if (score < 75) return '#a3e635'
  return GREEN
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
      ? { score: String(vibe.score), label: vibe.label ?? '', color: vibeLabelHex(vibe.label) }
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
    background: BG,
    fontFamily: 'Geist',
    color: WHITE,
  }, [
    h('div', { style: { display: 'flex', height: 10, background: ORANGE } }),

    col({ flex: 1, padding: '40px 56px 36px', justifyContent: 'space-between' }, [

      row({ alignItems: 'center', justifyContent: 'space-between' }, [
        col({}, [
          text({ fontSize: 30, letterSpacing: '0.14em', color: WHITE }, OG_TITLE),
          text({ fontSize: 22, color: MUTED, marginTop: 6 }, OG_TAGLINE),
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
