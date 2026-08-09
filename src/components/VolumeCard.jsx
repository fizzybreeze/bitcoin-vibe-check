import { CURRENCY_META, fmtVolume, btcDominanceLabel } from '../utils.js'
import { computeSatsPerFiat, computeVol7dAvg } from '../lib/calculations.js'
import CardTooltip from './CardTooltip.jsx'
import Skeleton from './Skeleton.jsx'

const VOLUME_TOOLTIP = 'Total BTC traded across major exchanges in the last 24 hours. High volume during a price move confirms its strength; the same move on low volume is easier to reverse.'

export default function VolumeCard({ volumeUsd, volume, currency, btcDominance, volHistory, marketCapUsd, marketCapEstimated = false, price }) {
  const vol7dAvg = computeVol7dAvg(volHistory)
  const volVs7d  = vol7dAvg != null && volumeUsd != null
    ? ((volumeUsd - vol7dAvg) / vol7dAvg) * 100
    : null
  const domLabel = btcDominanceLabel(btcDominance)
  // Gated on the computed value, not on the price that produced it — which is
  // how `ShareCanvas` has always done it, and the two call sites disagreeing
  // was the bug. `computeSatsPerFiat` answers `null` for a price it cannot
  // use, so testing the input instead let `price === 0` through to
  // `null.toLocaleString()`. There is no error boundary in this app, so that
  // threw during render and blanked the entire dashboard.
  const satsPerFiat = computeSatsPerFiat(price)
  return (
    <div className="rounded-2xl bg-gray-900 p-6 h-full">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-450 flex items-center">24h Volume<CardTooltip text={VOLUME_TOOLTIP} /></p>
      <div className="mt-3">
        {volume == null
          ? <Skeleton className="h-9 w-32" />
          : <p className="text-2xl font-bold text-orange-400 md:text-3xl">{fmtVolume(volume, currency)}</p>
        }
        {/* Every line below gates on the input it actually needs. They used to
            share one `volume != null` wrapper, which quietly made CoinPaprika a
            single point of failure for the whole card — including sats per
            fiat, which needs only the price that v1.7.9 taught to survive a
            CoinPaprika outage via Kraken. On a healthy load this changes
            nothing: the volume is there and so is everything else. */}

        {/* Line 1: vol vs 7d avg — desktop only, skipped when history is insufficient */}
        {volVs7d != null && (
          <p className={`hidden md:block mt-1.5 text-xs ${volVs7d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {volVs7d >= 0 ? '+' : ''}{Math.abs(volVs7d).toFixed(0)}%&nbsp;{volVs7d >= 0 ? 'above' : 'below'} 7d avg
          </p>
        )}
        {/* Line 2: BTC dominance — always visible (the mobile-visible line) */}
        {btcDominance != null && (
          <p className="mt-1.5 text-xs text-gray-400">
            BTC dominance {btcDominance.toFixed(1)}%
          </p>
        )}
        {/* Line 3: season interpretation — desktop only */}
        {domLabel && (
          <p className={`hidden md:block mt-0.5 text-xs ${domLabel.cls}`}>
            {domLabel.text}
          </p>
        )}
        {/* Line 4: market cap — desktop only. Says outright when the figure is
            price × issued supply rather than CoinPaprika's own, on the v1.6.5
            precedent: a fallback that presents itself as the primary source is
            the one way it could be worse than the blank it replaces. */}
        {marketCapUsd != null && (
          <p className="hidden md:block mt-0.5 text-xs text-gray-450">
            Mkt cap {fmtVolume(marketCapUsd, 'usd')}{marketCapEstimated && ' · est. from issued supply'}
          </p>
        )}
        {/* Sats per fiat */}
        {satsPerFiat != null && (
          <>
            <div className="mt-3 border-t border-gray-700" />
            <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-gray-450">Sats per fiat</p>
            <p className="mt-1 text-lg font-bold text-white">
              {satsPerFiat.toLocaleString('en-GB')}&nbsp;sats per {CURRENCY_META[currency]?.sym ?? '$'}1
            </p>
          </>
        )}
      </div>
    </div>
  )
}
