import { fmtCurrency, fmtVolume } from '../utils.js'
import { PALETTE } from '../lib/palette.js'
import useTheme from '../hooks/useTheme.js'

// Rendered by recharts into its own overlay, outside the card's DOM, so it is
// styled inline rather than with Tailwind classes — which means the theme has
// to be read rather than inherited from the stylesheet.
export default function ChartTooltip({ active, payload, label, currency }) {
  const { theme } = useTheme()
  const colors = PALETTE[theme]

  if (!active || !payload?.length) return null
  const priceEntry  = payload.find(p => p.dataKey === 'price')
  const volumeEntry = payload.find(p => p.dataKey === 'volume')
  if (!priceEntry) return null
  return (
    <div style={{
      background: colors.surface, border: `1px solid ${colors.line}`,
      borderRadius: 8, padding: '8px 12px', fontSize: 13,
      boxShadow: '0 4px 12px rgb(0 0 0 / 0.4)',
    }}>
      <p style={{ color: colors.quiet, marginBottom: 4, fontSize: 11 }}>{label}</p>
      <p style={{ color: colors.accent, fontWeight: 600 }}>{fmtCurrency(priceEntry.value, currency)}</p>
      {volumeEntry && (
        <p style={{ color: colors.quiet, marginTop: 4, fontSize: 11 }}>
          Vol&nbsp;{fmtVolume(volumeEntry.value, currency)}
        </p>
      )}
    </div>
  )
}
