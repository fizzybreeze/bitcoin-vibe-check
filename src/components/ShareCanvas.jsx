import { useState } from 'react'
import { fmtCurrency, fmtVolume, blocksToNextHalving, epochPercentage, CURRENCY_META } from '../utils.js'
import {
  computeAthDistance, computeSatsPerFiat, computeIssuedSupply, calcFiatFee,
} from '../lib/calculations.js'
import { calcPowerLawFairValue, calcMayerMultiple } from '../utils/cycleCalculations.js'
// html2canvas rasterises this tree, so nothing here can read a CSS variable —
// every colour is an inline hex, and the palette is where those hexes come from.
// The image follows the theme the visitor is actually looking at: a light-mode
// reader sharing a card gets a light card.
import { PALETTE, resolveTheme } from '../lib/palette.js'
// The direction arrows were `▲`/`▼` — device-font glyphs, in an image. Whether
// html2canvas draws an inline <svg> instead was measured rather than assumed
// (Chromium, html2canvas 1.4.1: it rasterises), because the failure mode here
// is a blank where an arrow used to be, in a picture somebody already posted.
import Icon from './Icon.jsx'
import Wordmark from './Wordmark.jsx'
// Shared with api/og.js and with the live cards — the exported card, the link
// preview and the dashboard show the same labelled scales, so they cannot be
// allowed to colour them differently. This file carried its own copies of the
// congestion and MVRV ladders until the Afterglow pass; the MVRV one had
// disagreed with the live card's for the same five bands.
import { congestionBand, mvrvBand, vibeLabelHex, fngLabelHex } from '../lib/scales.js'
import { FONT_STACKS } from '../lib/typography.js'

/** The three text styles every share card is built from, at one theme. */
function shareStyles(p) {
  return {
    label: {
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      color: p.quiet,
      margin: 0,
    },
    value: {
      fontSize: 22,
      fontWeight: 700,
      color: p.accent,
      margin: '6px 0 0',
      lineHeight: 1.2,
    },
    sub: {
      fontSize: 11,
      color: p.muted,
      margin: '4px 0 0',
      lineHeight: 1.4,
    },
  }
}

function formatTimestamp() {
  const now = new Date()
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return `As of ${time} UTC · ${date}`
}

function fngColorHex(classification, theme) {
  return fngLabelHex(classification, theme) ?? PALETTE[theme].accent
}

function CardWrapper({ children, style, theme }) {
  const p = PALETTE[theme]
  return (
    <div style={{
      background: p.surface,
      border: `1px solid ${p.line}`,
      borderRadius: 12,
      padding: 16,
      overflow: 'hidden',
      boxSizing: 'border-box',
      minHeight: 140,
      ...style,
    }}>
      {children}
    </div>
  )
}

const VIBE_SHARE_DIMENSIONS = [
  ['sentiment',  'Sentiment'],
  ['valuation',  'Valuation'],
  ['momentum',   'Momentum'],
  ['congestion', 'Mempool'],
  ['network',    'Network'],
]

function BtcPriceShareCard({ cardData, currency, theme }) {
  const p = PALETTE[theme]
  const S = shareStyles(p)
  const { priceUsd, priceGbp, priceEur, priceCad, priceChf, priceChange24h, athUsd, vibe } = cardData
  const price = { usd: priceUsd, gbp: priceGbp, eur: priceEur, cad: priceCad, chf: priceChf }[currency] ?? priceUsd
  const athPct = computeAthDistance(priceUsd, athUsd)
  const isAtATH = athPct != null && athPct >= -0.1
  const changePos = priceChange24h != null && priceChange24h >= 0
  return (
    <>
      <p style={S.label}>BTC Price</p>
      <p style={S.value}>{price != null ? fmtCurrency(price, currency) : '—'}</p>
      {athPct != null && (
        <p style={{ ...S.sub, color: isAtATH ? p.up : p.quiet }}>
          {isAtATH ? 'AT ALL-TIME HIGH' : `${athPct.toFixed(1)}% from ATH`}
        </p>
      )}
      {priceChange24h != null && (
        <p style={{ ...S.sub, color: changePos ? p.up : p.down, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name={changePos ? 'triangle-up' : 'triangle-down'} size="sm" />
          {changePos ? '+' : ''}{priceChange24h.toFixed(2)}% (24h)
        </p>
      )}
      {/* Mirrors the live card, which carries the score in this same position.
          Deliberately shows the components rather than vibe.summary: ShareCanvas
          already draws that same sentence in the image header as
          sentimentSummary, and printing it twice in one exported image is the
          duplication the live card was restructured to avoid. */}
      {vibe && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${p.line}` }}>
          <p style={S.label}>Vibe Score</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: p.accent, lineHeight: 1.1 }}>{vibe.score}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: vibeLabelHex(vibe.label, theme) }}>
              {vibe.label}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 20px', marginTop: 8 }}>
            {VIBE_SHARE_DIMENSIONS.map(([key, label]) => {
              const value = vibe.dimensions?.[key]
              return (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: p.quiet }}>{label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: value == null ? p['line-strong'] : p['ink-dim'] }}>
                    {value == null ? '—' : Math.round(value)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

function NetworkPulseShareCard({ cardData, theme }) {
  const p = PALETTE[theme]
  const S = shareStyles(p)
  const diffChange      = cardData.difficulty?.difficultyChange ?? null
  const remainingBlocks = cardData.difficulty?.remainingBlocks ?? null
  const diffPos = diffChange != null && diffChange >= 0
  const diffDays = remainingBlocks != null
    ? Math.round(remainingBlocks * 10 / 60 / 24)
    : null
  const interpText = diffChange == null ? null
    : diffChange > 4  ? 'Miners Speeding Up Fast'
    : diffChange > 1  ? 'Miners Speeding Up'
    : diffChange > -1 ? 'Stable'
    : diffChange > -4 ? 'Miners Slowing'
    : 'Miners Slowing Fast'
  return (
    <>
      <p style={S.label}>Network Health</p>
      <p style={{ ...S.label, marginTop: 8, marginBottom: 4 }}>Difficulty Adjustment</p>
      <p style={S.value}>
        {diffChange != null ? `${diffChange >= 0 ? '+' : ''}${diffChange.toFixed(1)}%` : '—'}
      </p>
      {interpText && (
        <p style={{ ...S.sub, color: diffPos ? p.up : p.muted, fontWeight: 600, marginTop: 4 }}>
          {interpText}
        </p>
      )}
      {diffDays != null && (
        <p style={{ ...S.sub, marginTop: 4 }}>
          Next adjustment in ~{diffDays}d
        </p>
      )}
    </>
  )
}

function MarketSentimentShareCard({ cardData, theme }) {
  const p = PALETTE[theme]
  const S = shareStyles(p)
  const fngScore = cardData.fng?.value != null ? parseInt(cardData.fng.value, 10) : null
  const fngClass = cardData.fng?.value_classification ?? null
  const color    = fngScore != null ? fngColorHex(fngClass, theme) : p.quiet
  return (
    <>
      <p style={S.label}>Market Sentiment</p>
      <p style={{ ...S.label, marginTop: 8, marginBottom: 4 }}>Fear &amp; Greed</p>
      <p style={{ ...S.value, color }}>{fngScore ?? '—'}</p>
      <p style={{ ...S.sub, color, fontWeight: 600, marginTop: 4 }}>{fngClass ?? '—'}</p>
    </>
  )
}

function VolumeShareCard({ cardData, currency, theme }) {
  const S = shareStyles(PALETTE[theme])
  const { priceUsd, priceGbp, priceEur, priceCad, priceChf,
          volumeUsd, volumeGbp, volumeEur, volumeCad, volumeChf,
          btcDominance, blockHeight } = cardData
  const price = { usd: priceUsd, gbp: priceGbp, eur: priceEur, cad: priceCad, chf: priceChf }[currency] ?? priceUsd
  const volume = { usd: volumeUsd, gbp: volumeGbp, eur: volumeEur, cad: volumeCad, chf: volumeChf }[currency] ?? volumeUsd
  const currSym = CURRENCY_META[currency]?.sym ?? '$'
  const satsPerFiat = computeSatsPerFiat(price)
  const supply = computeIssuedSupply(blockHeight)
  return (
    <>
      <p style={S.label}>24h Volume</p>
      <p style={S.value}>{volume != null ? fmtVolume(volume, currency) : '—'}</p>
      {btcDominance != null && (
        <p style={S.sub}>BTC dominance {btcDominance.toFixed(1)}%</p>
      )}
      {satsPerFiat != null && (
        <p style={S.sub}>{satsPerFiat.toLocaleString('en-GB')} sats per {currSym}1</p>
      )}
      {supply != null && (
        <p style={S.sub}>{supply.toLocaleString('en-GB', { maximumFractionDigits: 0 })} BTC issued</p>
      )}
    </>
  )
}

function HalvingShareCard({ cardData, theme }) {
  const p = PALETTE[theme]
  const S = shareStyles(p)
  const { blockHeight } = cardData
  const blocksLeft = blockHeight != null ? Math.max(0, blocksToNextHalving(blockHeight)) : null
  const epochPct = blockHeight != null ? epochPercentage(blockHeight) : null
  const daysLeft = blocksLeft != null ? Math.round(blocksLeft * 10 / 60 / 24) : null
  return (
    <>
      <p style={S.label}>Next Halving</p>
      <p style={S.value}>{blocksLeft != null ? blocksLeft.toLocaleString('en-US') : '—'}</p>
      <p style={S.sub}>blocks remaining</p>
      {daysLeft != null && <p style={S.sub}>≈ {daysLeft} days</p>}
      {epochPct != null && (
        <>
          <div style={{ marginTop: 8, height: 4, background: p.raised, borderRadius: 9999, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: p.accent, width: `${epochPct}%`, borderRadius: 9999 }} />
          </div>
          <p style={{ ...S.sub, marginTop: 4 }}>{epochPct.toFixed(1)}% of epoch complete</p>
        </>
      )}
    </>
  )
}

function RecentBlocksShareCard({ cardData, theme }) {
  const S = shareStyles(PALETTE[theme])
  const { blockHeight, lastBlockTs, difficulty } = cardData
  // Frozen at mount: this card is rendered off-screen purely to be captured as
  // a static image, so the timestamp must not change between render and capture.
  const [capturedAt] = useState(() => Date.now())
  const avgBlockMins = difficulty?.timeAvg != null ? difficulty.timeAvg / 60000 : null
  const lastBlockMinsAgo = lastBlockTs != null
    ? Math.max(0, Math.floor((capturedAt / 1000 - lastBlockTs) / 60))
    : null
  return (
    <>
      <p style={S.label}>Network Heartbeat</p>
      <p style={S.value}>{blockHeight != null ? blockHeight.toLocaleString('en-US') : '—'}</p>
      <p style={S.sub}>block height</p>
      {avgBlockMins != null && (
        <p style={{ ...S.sub, marginTop: 6 }}>
          Avg block time: {avgBlockMins.toFixed(1)} min
        </p>
      )}
      {lastBlockMinsAgo != null && (
        <p style={S.sub}>Last block: {lastBlockMinsAgo} min ago</p>
      )}
    </>
  )
}

function FeesShareCard({ cardData, currency, theme }) {
  const p = PALETTE[theme]
  const S = shareStyles(p)
  const { fees, mempool,
    priceUsd, priceGbp, priceEur, priceCad, priceChf } = cardData
  const price = { usd: priceUsd, gbp: priceGbp, eur: priceEur, cad: priceCad, chf: priceChf }[currency] ?? priceUsd
  const currSym = CURRENCY_META[currency]?.sym ?? '$'
  const cg = mempool?.vsize != null ? congestionBand(mempool.vsize) : null

  function fmtFiatFee(feeRate) {
    if (!(price > 0)) return null
    const f = calcFiatFee(feeRate, price)
    return `≈ ${currSym}${f >= 0.10 ? f.toFixed(2) : f.toFixed(4)}`
  }

  return (
    <>
      <p style={S.label}>Network Fees</p>
      {fees ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {[
            { label: 'Slow',   value: fees.hourFee,     time: '~1 hr'  },
            { label: 'Medium', value: fees.halfHourFee, time: '~30 min' },
            { label: 'Fast',   value: fees.fastestFee,  time: '~10 min' },
          ].map(({ label, value, time }) => {
            const fiatStr = fmtFiatFee(value)
            return (
              <div key={label} style={{
                flex: 1, background: p.raised, borderRadius: 8, padding: '8px 6px',
                border: `1px solid ${p['line-soft']}`,
              }}>
                <p style={{ ...S.label, fontSize: 9 }}>{label}</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: p.accent, margin: '4px 0 0' }}>{value}</p>
                <p style={{ fontSize: 9, color: p.quiet, margin: '2px 0 0' }}>sat/vB</p>
                <p style={{ fontSize: 9, color: p.quiet, margin: '2px 0 0' }}>{time}</p>
                {fiatStr && <p style={{ fontSize: 9, color: p.muted, margin: '3px 0 0' }}>{fiatStr}</p>}
              </div>
            )
          })}
        </div>
      ) : (
        <p style={{ ...S.value, fontSize: 18 }}>—</p>
      )}
      {cg && (
        <p style={{ ...S.sub, marginTop: 8 }}>
          Mempool: <span style={{ color: p[cg.token] }}>{cg.label}</span>
          {mempool?.count != null && ` · ${mempool.count.toLocaleString('en-US')} unconfirmed`}
        </p>
      )}
    </>
  )
}

function mayerLabel(multiple) {
  if (multiple == null) return null
  if (multiple < 0.8) return { text: 'Historically Cheap' }
  if (multiple < 1.0) return { text: 'Below Average'      }
  if (multiple < 1.5) return { text: 'Normal Range'       }
  if (multiple < 2.4) return { text: 'Elevated'           }
  return                     { text: 'Overheated'         }
}

function CycleIndicatorsShareCard({ cardData, theme }) {
  const p = PALETTE[theme]
  const S = shareStyles(p)
  const mvrv      = cardData.chainData?.mvrv?.value ?? null
  // `/api/chain-data` serves the last stored MVRV when the BGeometrics budget
  // is exhausted. This image gets posted publicly and outlives the moment it
  // was made, so it has to carry the same caveat the live card does — a week-old
  // number presented as today's is worse in a share than it is on screen.
  const mvrvStored = cardData.chainData?.mvrv?.source === 'snapshot'
    ? cardData.chainData.mvrv.date
    : null
  const ma200     = cardData.ma200 ?? null
  const price     = cardData.priceUsd ?? null
  const fairValue = calcPowerLawFairValue()
  const mayer     = calcMayerMultiple(price, ma200)
  const mvrvLbl   = mvrvBand(mvrv)
  const mayerLbl  = mayerLabel(mayer)

  const SMALL_VAL = { ...S.value, fontSize: 17 }

  return (
    <>
      <p style={S.label}>Cycle Indicators</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginTop: 10 }}>
        <div>
          <p style={{ ...S.label, marginBottom: 4 }}>MVRV Ratio</p>
          <p style={{ ...SMALL_VAL, color: mvrvLbl ? p[mvrvLbl.token] : p.accent }}>
            {mvrv != null ? mvrv.toFixed(2) : '—'}
          </p>
          {mvrvLbl && <p style={{ ...S.sub, color: p[mvrvLbl.token], fontWeight: 600 }}>{mvrvLbl.label}</p>}
          {mvrvStored && (
            <p style={{ ...S.sub, color: p.quiet, fontSize: 10 }}>
              {mvrvStored} · from daily snapshot
            </p>
          )}
        </div>
        <div>
          <p style={{ ...S.label, marginBottom: 4 }}>Power Law Fair Value</p>
          <p style={SMALL_VAL}>
            {fairValue != null ? fmtCurrency(fairValue, 'usd') : '—'}
          </p>
        </div>
        <div>
          <p style={{ ...S.label, marginBottom: 4 }}>200-Day MA</p>
          <p style={SMALL_VAL}>
            {ma200 != null ? fmtCurrency(ma200, 'usd') : '—'}
          </p>
        </div>
        <div>
          <p style={{ ...S.label, marginBottom: 4 }}>Mayer Multiple</p>
          <p style={SMALL_VAL}>
            {mayer != null ? mayer.toFixed(2) : '—'}
          </p>
          {mayerLbl && <p style={{ ...S.sub, color: p.quiet }}>{mayerLbl.text}</p>}
        </div>
      </div>
    </>
  )
}

function renderShareCard(key, cardData, currency, theme) {
  switch (key) {
    case 'btcPrice':        return <BtcPriceShareCard cardData={cardData} currency={currency} theme={theme} />
    case 'marketSentiment': return <MarketSentimentShareCard cardData={cardData} theme={theme} />
    case 'volume':          return <VolumeShareCard cardData={cardData} currency={currency} theme={theme} />
    case 'networkPulse':    return <NetworkPulseShareCard cardData={cardData} theme={theme} />
    case 'halving':         return <HalvingShareCard cardData={cardData} theme={theme} />
    case 'recentBlocks':    return <RecentBlocksShareCard cardData={cardData} theme={theme} />
    case 'fees':            return <FeesShareCard cardData={cardData} currency={currency} theme={theme} />
    case 'cycleIndicators': return <CycleIndicatorsShareCard cardData={cardData} theme={theme} />
    default:                return null
  }
}

export default function ShareCanvas({ selectedCards, sentimentSummary, cardData, currency, forwardedRef, theme }) {
  // Anything unrecognised — including no prop at all — is the product's own
  // default rather than a colour, so a caller that forgets to pass one still
  // exports the card people expect.
  const t = resolveTheme(theme)
  const p = PALETTE[t]
  return (
    <div style={{ position: 'absolute', left: '-9999px', top: 0, width: 1080 }} ref={forwardedRef}>
      <div style={{
        width: '100%',
        background: p.ground,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        // The app's own stack, not a second one written here. html2canvas
        // rasterises whatever the document resolves, so a share image drawn in
        // a different face from the card it copies is a drift nothing reports —
        // and this stack had dropped the emoji families the ⚡ needs.
        fontFamily: FONT_STACKS.sans,
      }}>
        {/* Top accent border */}
        <div style={{ height: 4, background: p.accent, flexShrink: 0 }} />

        {/* Main content area */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '20px 28px 24px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28, color: p.accent, lineHeight: 1 }}>₿</span>
              <div>
                {/* Drawn, not set — the same wordmark the header and the link
                    preview render, so a posted image cannot carry a title in a
                    face the site does not use. html2canvas rasterises inline
                    SVG; that was measured before this was relied on. */}
                <Wordmark cell={2} />
                <div style={{ fontSize: 11, color: p.quiet, marginTop: 4 }}>Read the room.</div>
              </div>
            </div>
            {sentimentSummary && (
              <span style={{ fontSize: 12, color: p.quiet, maxWidth: 360, textAlign: 'right', lineHeight: 1.4, paddingTop: 2 }}>
                {sentimentSummary}
              </span>
            )}
          </div>

          {/* Card grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
          }}>
            {selectedCards.map((key, index) => {
              const isLastOdd = selectedCards.length % 2 !== 0 && index === selectedCards.length - 1
              return (
                <CardWrapper key={key} theme={t} style={isLastOdd ? { gridColumn: '1 / -1' } : {}}>
                  {renderShareCard(key, cardData, currency, t)}
                </CardWrapper>
              )
            })}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: p.quiet, margin: 0 }}>
              <span style={{ color: p.muted }}>bitcoinvibecheck.com</span>
              {' · '}
              {formatTimestamp()}
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
