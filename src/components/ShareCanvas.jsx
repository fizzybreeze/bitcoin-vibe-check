import { fmtCurrency, fmtVolume, blocksToNextHalving, epochPercentage, CURRENCY_META } from '../utils.js'
import {
  computeAthDistance, computeSatsPerFiat, computeIssuedSupply,
} from '../lib/calculations.js'
import { calcPowerLawFairValue, calcMayerMultiple } from '../utils/cycleCalculations.js'

const ORANGE = '#fb923c'
const CARD_BG = '#111827'
const MUTED = '#6b7280'
const WHITE = '#ffffff'
const GREEN = '#4ade80'
const RED = '#f87171'

const LABEL_STYLE = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: MUTED,
  margin: 0,
}

const VALUE_STYLE = {
  fontSize: 22,
  fontWeight: 700,
  color: ORANGE,
  margin: '6px 0 0',
  lineHeight: 1.2,
}

const SUB_STYLE = {
  fontSize: 11,
  color: '#9ca3af',
  margin: '4px 0 0',
  lineHeight: 1.4,
}

function formatTimestamp() {
  const now = new Date()
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return `As of ${time} UTC · ${date}`
}

function congestionInfo(vsize) {
  if (vsize == null) return null
  if (vsize < 5_000_000)   return { label: 'Low',      color: GREEN  }
  if (vsize <= 50_000_000) return { label: 'Moderate', color: ORANGE }
  return                           { label: 'High',     color: RED    }
}

function fngColorHex(classification) {
  const map = {
    'Extreme Fear': RED,
    'Fear':         '#fbbf24',
    'Neutral':      '#facc15',
    'Greed':        '#a3e635',
    'Extreme Greed': GREEN,
  }
  return map[classification] ?? ORANGE
}

function CardWrapper({ children, style }) {
  return (
    <div style={{
      background: CARD_BG,
      border: '1px solid rgba(255,255,255,0.08)',
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

function BtcPriceShareCard({ cardData, currency }) {
  const { priceUsd, priceGbp, priceEur, priceCad, priceChf, priceChange24h, athUsd } = cardData
  const price = { usd: priceUsd, gbp: priceGbp, eur: priceEur, cad: priceCad, chf: priceChf }[currency] ?? priceUsd
  const athPct = computeAthDistance(priceUsd, athUsd)
  const isAtATH = athPct != null && athPct >= -0.1
  const changePos = priceChange24h != null && priceChange24h >= 0
  return (
    <>
      <p style={LABEL_STYLE}>BTC Price</p>
      <p style={VALUE_STYLE}>{price != null ? fmtCurrency(price, currency) : '—'}</p>
      {athPct != null && (
        <p style={{ ...SUB_STYLE, color: isAtATH ? GREEN : MUTED }}>
          {isAtATH ? 'AT ALL-TIME HIGH' : `${athPct.toFixed(1)}% from ATH`}
        </p>
      )}
      {priceChange24h != null && (
        <p style={{ ...SUB_STYLE, color: changePos ? GREEN : RED }}>
          {changePos ? '▲' : '▼'} {changePos ? '+' : ''}{priceChange24h.toFixed(2)}% (24h)
        </p>
      )}
    </>
  )
}

function NetworkPulseShareCard({ cardData }) {
  const { fng, difficulty } = cardData
  const fngScore = fng?.value != null ? parseInt(fng.value, 10) : null
  const fngClass = fng?.value_classification ?? null
  const diffChange = difficulty?.difficultyChange ?? null
  const diffPos = diffChange != null && diffChange >= 0
  return (
    <>
      <p style={LABEL_STYLE}>Network Pulse</p>
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <p style={{ ...LABEL_STYLE, marginBottom: 4 }}>Fear &amp; Greed</p>
          <p style={{ ...VALUE_STYLE, color: fngScore != null ? fngColorHex(fngClass) : MUTED }}>
            {fngScore ?? '—'}
          </p>
          <p style={{ ...SUB_STYLE, color: fngScore != null ? fngColorHex(fngClass) : MUTED }}>
            {fngClass ?? '—'}
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ ...LABEL_STYLE, marginBottom: 4 }}>Difficulty</p>
          <p style={{ ...VALUE_STYLE }}>
            {diffChange != null ? `${diffChange >= 0 ? '+' : ''}${diffChange.toFixed(1)}%` : '—'}
          </p>
          {diffChange != null && (
            <p style={{ ...SUB_STYLE, color: diffPos ? GREEN : '#9ca3af' }}>
              {diffChange > 4 ? 'Miners Speeding Up Fast'
                : diffChange > 1 ? 'Miners Speeding Up'
                : diffChange > -1 ? 'Stable'
                : diffChange > -4 ? 'Miners Slowing'
                : 'Miners Slowing Fast'}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

function VolumeShareCard({ cardData, currency }) {
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
      <p style={LABEL_STYLE}>24h Volume</p>
      <p style={VALUE_STYLE}>{volume != null ? fmtVolume(volume, currency) : '—'}</p>
      {btcDominance != null && (
        <p style={SUB_STYLE}>BTC dominance {btcDominance.toFixed(1)}%</p>
      )}
      {satsPerFiat != null && (
        <p style={SUB_STYLE}>{satsPerFiat.toLocaleString('en-GB')} sats per {currSym}1</p>
      )}
      {supply != null && (
        <p style={SUB_STYLE}>{supply.toLocaleString('en-GB', { maximumFractionDigits: 0 })} BTC issued</p>
      )}
    </>
  )
}

function HalvingShareCard({ cardData }) {
  const { blockHeight } = cardData
  const blocksLeft = blockHeight != null ? Math.max(0, blocksToNextHalving(blockHeight)) : null
  const epochPct = blockHeight != null ? epochPercentage(blockHeight) : null
  const daysLeft = blocksLeft != null ? Math.round(blocksLeft * 10 / 60 / 24) : null
  return (
    <>
      <p style={LABEL_STYLE}>Next Halving</p>
      <p style={VALUE_STYLE}>{blocksLeft != null ? blocksLeft.toLocaleString('en-US') : '—'}</p>
      <p style={SUB_STYLE}>blocks remaining</p>
      {daysLeft != null && <p style={SUB_STYLE}>≈ {daysLeft} days</p>}
      {epochPct != null && (
        <>
          <div style={{ marginTop: 8, height: 4, background: '#1f2937', borderRadius: 9999, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: ORANGE, width: `${epochPct}%`, borderRadius: 9999 }} />
          </div>
          <p style={{ ...SUB_STYLE, marginTop: 4 }}>{epochPct.toFixed(1)}% of epoch complete</p>
        </>
      )}
    </>
  )
}

function RecentBlocksShareCard({ cardData }) {
  const { blockHeight, lastBlockTs, difficulty } = cardData
  const avgBlockMins = difficulty?.timeAvg != null ? difficulty.timeAvg / 60000 : null
  const lastBlockMinsAgo = lastBlockTs != null
    ? Math.max(0, Math.floor((Date.now() / 1000 - lastBlockTs) / 60))
    : null
  return (
    <>
      <p style={LABEL_STYLE}>Network Heartbeat</p>
      <p style={VALUE_STYLE}>{blockHeight != null ? blockHeight.toLocaleString('en-US') : '—'}</p>
      <p style={SUB_STYLE}>block height</p>
      {avgBlockMins != null && (
        <p style={{ ...SUB_STYLE, marginTop: 6 }}>
          Avg block time: {avgBlockMins.toFixed(1)} min
        </p>
      )}
      {lastBlockMinsAgo != null && (
        <p style={SUB_STYLE}>Last block: {lastBlockMinsAgo} min ago</p>
      )}
    </>
  )
}

function FeesShareCard({ cardData }) {
  const { fees, mempool } = cardData
  const cg = mempool?.vsize != null ? congestionInfo(mempool.vsize) : null
  return (
    <>
      <p style={LABEL_STYLE}>Network Fees</p>
      {fees ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {[
            { label: 'Slow',   value: fees.hourFee,     time: '~1 hr'  },
            { label: 'Medium', value: fees.halfHourFee, time: '~30 min' },
            { label: 'Fast',   value: fees.fastestFee,  time: '~10 min' },
          ].map(({ label, value, time }) => (
            <div key={label} style={{
              flex: 1, background: '#0f172a', borderRadius: 8, padding: '8px 6px',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <p style={{ ...LABEL_STYLE, fontSize: 9 }}>{label}</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: ORANGE, margin: '4px 0 0' }}>{value}</p>
              <p style={{ fontSize: 9, color: MUTED, margin: '2px 0 0' }}>sat/vB</p>
              <p style={{ fontSize: 9, color: MUTED, margin: '2px 0 0' }}>{time}</p>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ ...VALUE_STYLE, fontSize: 18 }}>—</p>
      )}
      {cg && (
        <p style={{ ...SUB_STYLE, marginTop: 8 }}>
          Mempool: <span style={{ color: cg.color }}>{cg.label}</span>
          {mempool?.count != null && ` · ${mempool.count.toLocaleString('en-US')} unconfirmed`}
        </p>
      )}
    </>
  )
}

function accumulationSignalLabel(btcHeld, btcHeld7dAgo) {
  if (btcHeld == null || btcHeld7dAgo == null) return null
  const pct = ((btcHeld - btcHeld7dAgo) / btcHeld7dAgo) * 100
  if (pct > 0.1)  return { text: '▲ Accumulating', color: '#4ade80' }
  if (pct < -0.1) return { text: '▼ Distributing', color: '#f87171' }
  return                  { text: '— Neutral',      color: '#facc15' }
}

function mvrvLabel(mvrv) {
  if (mvrv == null) return null
  if (mvrv < 1)    return { text: 'Deeply Undervalued',   color: '#4ade80'  }
  if (mvrv < 1.5)  return { text: 'Undervalued',          color: '#a3e635'  }
  if (mvrv < 2.4)  return { text: 'Fair Value',           color: '#facc15'  }
  if (mvrv < 3.7)  return { text: 'Overvalued',           color: '#fbbf24'  }
  return                   { text: 'Extremely Overvalued', color: '#f87171'  }
}

function mayerLabel(multiple) {
  if (multiple == null) return null
  if (multiple < 0.8) return { text: 'Historically Cheap', color: '#4ade80'  }
  if (multiple < 1.0) return { text: 'Below Average',      color: '#a3e635'  }
  if (multiple < 1.5) return { text: 'Normal Range',       color: '#facc15'  }
  if (multiple < 2.4) return { text: 'Elevated',           color: '#fbbf24'  }
  return                     { text: 'Overheated',         color: '#f87171'  }
}

function InstitutionalPulseShareCard({ cardData }) {
  const etf   = cardData.chainData?.etf ?? null
  const held  = etf?.btcHeld ?? null
  const signal = accumulationSignalLabel(etf?.btcHeld, etf?.btcHeld7dAgo)
  return (
    <>
      <p style={LABEL_STYLE}>Institutional Pulse</p>
      <p style={{ ...SUB_STYLE, marginBottom: 6 }}>US Spot ETF Holdings</p>
      <p style={VALUE_STYLE}>
        {held != null ? held.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
      </p>
      <p style={SUB_STYLE}>BTC held</p>
      {signal && (
        <p style={{ ...SUB_STYLE, marginTop: 8, color: signal.color, fontWeight: 600 }}>
          {signal.text}
        </p>
      )}
      {!held && <p style={{ ...SUB_STYLE, marginTop: 8 }}>Data unavailable</p>}
    </>
  )
}

function OnChainSignalsShareCard({ cardData }) {
  const mvrv  = cardData.chainData?.mvrv?.value ?? null
  const label = mvrvLabel(mvrv)
  return (
    <>
      <p style={LABEL_STYLE}>On-Chain Signals</p>
      <p style={{ ...SUB_STYLE, marginBottom: 6 }}>MVRV Ratio</p>
      <p style={VALUE_STYLE}>{mvrv != null ? mvrv.toFixed(2) : '—'}</p>
      {label && (
        <p style={{ ...SUB_STYLE, color: label.color, fontWeight: 600 }}>{label.text}</p>
      )}
      {mvrv == null && <p style={SUB_STYLE}>Data unavailable</p>}
    </>
  )
}

function CycleIndicatorsShareCard({ cardData }) {
  const ma200     = cardData.ma200 ?? null
  const price     = cardData.priceUsd ?? null
  const fairValue = calcPowerLawFairValue()
  const mayer     = calcMayerMultiple(price, ma200)
  const mLabel    = mayerLabel(mayer)
  return (
    <>
      <p style={LABEL_STYLE}>Cycle Indicators</p>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <p style={{ ...LABEL_STYLE, marginBottom: 2 }}>Power Law Fair Value</p>
          <p style={{ ...VALUE_STYLE, fontSize: 18 }}>
            {fairValue != null ? fmtCurrency(fairValue, 'usd') : '—'}
          </p>
        </div>
        <div>
          <p style={{ ...LABEL_STYLE, marginBottom: 2 }}>Mayer Multiple</p>
          <p style={{ ...VALUE_STYLE, fontSize: 18 }}>
            {mayer != null ? mayer.toFixed(2) : '—'}
          </p>
          {mLabel && (
            <p style={{ ...SUB_STYLE, color: mLabel.color, fontWeight: 600 }}>{mLabel.text}</p>
          )}
        </div>
      </div>
    </>
  )
}

function renderShareCard(key, cardData, currency) {
  switch (key) {
    case 'btcPrice':           return <BtcPriceShareCard cardData={cardData} currency={currency} />
    case 'networkPulse':       return <NetworkPulseShareCard cardData={cardData} />
    case 'volume':             return <VolumeShareCard cardData={cardData} currency={currency} />
    case 'halving':            return <HalvingShareCard cardData={cardData} />
    case 'recentBlocks':       return <RecentBlocksShareCard cardData={cardData} />
    case 'fees':               return <FeesShareCard cardData={cardData} />
    case 'institutionalPulse': return <InstitutionalPulseShareCard cardData={cardData} />
    case 'onChainSignals':     return <OnChainSignalsShareCard cardData={cardData} />
    case 'cycleIndicators':    return <CycleIndicatorsShareCard cardData={cardData} />
    default:                   return null
  }
}

export default function ShareCanvas({ selectedCards, sentimentSummary, cardData, currency, forwardedRef }) {
  return (
    <div style={{ position: 'absolute', left: '-9999px', top: 0, width: 1080 }} ref={forwardedRef}>
      <div style={{
        width: '100%',
        background: '#030712',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        {/* Top orange border */}
        <div style={{ height: 4, background: '#f97316', flexShrink: 0 }} />

        {/* Main content area */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '20px 28px 24px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28, color: ORANGE, lineHeight: 1 }}>₿</span>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: WHITE, lineHeight: 1.2 }}>Bitcoin Vibe Check</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Read the room.</div>
              </div>
            </div>
            {sentimentSummary && (
              <span style={{ fontSize: 12, color: MUTED, maxWidth: 360, textAlign: 'right', lineHeight: 1.4, paddingTop: 2 }}>
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
                <CardWrapper key={key} style={isLastOdd ? { gridColumn: '1 / -1' } : {}}>
                  {renderShareCard(key, cardData, currency)}
                </CardWrapper>
              )
            })}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>
              <span style={{ color: '#9ca3af' }}>bitcoinvibecheck.com</span>
              {' · '}
              {formatTimestamp()}
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
