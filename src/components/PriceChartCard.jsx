import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import { PALETTE } from '../lib/palette.js'
import useTheme from '../hooks/useTheme.js'
import CardTooltip from './CardTooltip.jsx'
import ChartTooltip from './ChartTooltip.jsx'
import Skeleton from './Skeleton.jsx'

const CHART_VOLUME_TOOLTIP = "Volume bars show trading activity on Kraken's BTC/USD pair only. The 24H Volume card shows global volume aggregated across all exchanges by CoinPaprika — the two figures are not directly comparable."

/**
 * The price chart and its range toggles.
 *
 * `ranges` is passed in rather than imported: App owns the range → days
 * mapping because it is also what drives the fetch, and two copies of that list
 * is exactly the kind of split-brain #22 exists to avoid.
 *
 * The y-axis bounds and the x-axis tick interval are derived here rather than
 * in App. They are presentation, they are used nowhere else, and deriving them
 * beside the axes they configure is what keeps the prop list honest.
 */
export default function PriceChartCard({
  chart, chartLoading, chartError, chartChange,
  range, setRange, refreshChart, ranges, currency,
}) {
  // recharts takes colours as props, not classes, so it cannot read the
  // stylesheet — every hex below comes from the palette for the theme that is
  // on. The volume bars are deliberately the *support* colour rather than the
  // accent: both series were orange before, which made two unrelated readings
  // look like one.
  const { theme } = useTheme()
  const colors = PALETTE[theme]

  const chartPrices = chart?.map(d => d.price) ?? []
  const lo  = chartPrices.length ? Math.min(...chartPrices) : 0
  const hi  = chartPrices.length ? Math.max(...chartPrices) : 0
  const pad = (hi - lo) * 0.08
  const xInterval = chart?.length ? Math.max(0, Math.floor(chart.length / 7) - 1) : 0

  return (
    <div className="rounded-2xl bg-surface p-6 h-full">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-quiet flex items-center">
            Price · {currency.toUpperCase()}<CardTooltip text={CHART_VOLUME_TOOLTIP} />
          </h2>
          {chartChange != null && !chartLoading && (
            <span
              data-testid="chart-range-change"
              className={`text-xs font-semibold ${chartChange >= 0 ? 'text-up' : 'text-down'}`}
            >
              {chartChange >= 0 ? '▲' : '▼'}&nbsp;{chartChange >= 0 ? '+' : ''}{chartChange.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex flex-col items-start md:items-end gap-1">
        <div className="flex items-center gap-1 overflow-x-auto">
          {ranges.map(({ label }) => (
            <button
              key={label}
              onClick={() => setRange(label)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                range === label
                  ? 'bg-accent-fill text-accent-ink'
                  : 'bg-raised text-muted hover:text-ink-dim'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={refreshChart}
            disabled={chartLoading}
            aria-label="Refresh chart"
            className="ml-1 rounded-full p-1 text-quiet transition-colors hover:text-ink-dim disabled:opacity-30"
          >
            <svg
              width="13" height="13" viewBox="0 0 13 13"
              fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"
              className={chartLoading ? 'animate-spin' : ''}
              aria-hidden="true"
            >
              <path d="M11.5 6.5a5 5 0 1 1-1.33-3.35"/>
              <polyline points="11.5 1.5 11.5 5 8 5"/>
            </svg>
          </button>
        </div>
        <p className="text-xs text-quiet">Chart in USD</p>
        </div>
      </div>

      {chartError === 'temp' && (
        <p className="mb-4 text-xs text-down/70">Data temporarily unavailable. Retrying...</p>
      )}
      {chartError === 'permanent' && (
        <div className="mb-4 flex items-center gap-2">
          <p className="text-xs text-down/70">Unable to load chart data. Try again shortly.</p>
          <button
            onClick={refreshChart}
            aria-label="Retry chart"
            className="text-quiet transition-colors hover:text-muted"
          >
            <svg
              width="13" height="13" viewBox="0 0 13 13"
              fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M11.5 6.5a5 5 0 1 1-1.33-3.35"/>
              <polyline points="11.5 1.5 11.5 5 8 5"/>
            </svg>
          </button>
        </div>
      )}

      {chartLoading && !chart
        ? <Skeleton className="h-64" />
        : (
          <div className="relative">
            <div className={`transition-opacity duration-200 ${chartLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <ResponsiveContainer width="100%" height={264}>
                <ComposedChart data={chart ?? []} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={colors.accent} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={colors.accent} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.line} vertical={false} />
                  <XAxis
                    dataKey="date"
                    interval={xInterval}
                    tick={{ fill: colors.quiet, fontSize: 11 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    yAxisId="price"
                    domain={[lo - pad, hi + pad]}
                    tick={{ fill: colors.quiet, fontSize: 11 }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => `$${Math.round(v / 1000)}k`}
                    width={52}
                  />
                  <YAxis yAxisId="volume" hide />
                  <Tooltip content={<ChartTooltip currency="usd" />} />
                  <Bar
                    yAxisId="volume" dataKey="volume"
                    fill={colors.support} fillOpacity={0.15}
                    strokeWidth={0} legendType="none"
                    isAnimationActive={false}
                  />
                  <Area
                    yAxisId="price"
                    type="monotone" dataKey="price"
                    stroke={colors.accent} strokeWidth={2}
                    fill="url(#priceGrad)" dot={false}
                    activeDot={{ r: 4, fill: colors.accent, strokeWidth: 0 }}
                  />
                  {chartPrices.length > 0 && (
                    <>
                      <ReferenceLine
                        yAxisId="price"
                        y={hi}
                        stroke={colors.up}
                        strokeDasharray="3 3"
                        strokeWidth={1}
                        label={{ value: `H: $${Math.round(hi).toLocaleString('en-US')}`, position: 'insideTopRight', fill: colors.up, fontSize: 10 }}
                      />
                      <ReferenceLine
                        yAxisId="price"
                        y={lo}
                        stroke={colors.down}
                        strokeDasharray="3 3"
                        strokeWidth={1}
                        label={{ value: `L: $${Math.round(lo).toLocaleString('en-US')}`, position: 'insideBottomRight', fill: colors.down, fontSize: 10 }}
                      />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {chartLoading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <p className="text-xs text-quiet">Loading...</p>
              </div>
            )}
          </div>
        )
      }
    </div>
  )
}
