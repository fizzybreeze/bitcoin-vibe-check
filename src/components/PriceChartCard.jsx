import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import { PALETTE } from '../lib/palette.js'
import useTheme from '../hooks/useTheme.js'
import CardTooltip from './CardTooltip.jsx'
import ChartTooltip from './ChartTooltip.jsx'
import Icon from './Icon.jsx'
import Skeleton from './Skeleton.jsx'
import { CARD, CARD_LABEL } from '../lib/typography.js'
import { CURRENCY_META } from '../utils.js'

const chartVolumeTooltip = pair =>
  `Volume bars show trading activity on Kraken's BTC/${pair} pair only. The 24H Volume card shows global volume aggregated across all exchanges by CoinPaprika — the two figures are not directly comparable.`

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
 *
 * **Two currencies, on purpose.** `currency` is what the header's selector says;
 * `chartCurrency` is what the candles are actually denominated in, which
 * `fetchChartSeries` reports and which differs only when Kraken has no market
 * for the selection. Every mark on the chart reads the second — because the
 * defect this card shipped with was the heading reading the first while the
 * axis, the reference lines and the tooltip were hard-coded to dollars.
 */
export default function PriceChartCard({
  chart, chartLoading, chartError, chartChange,
  range, setRange, refreshChart, ranges, currency, chartCurrency, chartRequestedCurrency,
}) {
  // recharts takes colours as props, not classes, so it cannot read the
  // stylesheet — every hex below comes from the palette for the theme that is
  // on. The volume bars are deliberately the *support* colour rather than the
  // accent: both series were orange before, which made two unrelated readings
  // look like one.
  const { theme } = useTheme()
  const colors = PALETTE[theme]

  // Falling back to the selection when the parent passes nothing keeps a wiring
  // mistake from throwing during render — this app has no error boundary, so a
  // throw here takes the whole page rather than the card. `e2e/chartCurrency.spec.js`
  // is what stops that tolerance hiding the bug it tolerates.
  const served      = String(chartCurrency ?? currency).toLowerCase()
  const meta        = CURRENCY_META[served] ?? CURRENCY_META.usd
  const servedUpper = served.toUpperCase()

  // Both halves come off the *series*, never off the live selector. Comparing
  // against `currency` looks equivalent and is not: the selector updates in the
  // render that follows the change event, while the new candles arrive an effect
  // later — so a switch from a drawn USD chart to GBP would paint "No Kraken GBP
  // market" for a frame, on a currency that has one. The series compared with
  // itself has no such window, and needs no gating on the error or loading state
  // to get there.
  const requested        = String(chartRequestedCurrency ?? served).toLowerCase()
  const showFallbackNote = requested !== served
  const fellBackFrom     = requested.toUpperCase()

  const chartPrices = chart?.map(d => d.price) ?? []
  const lo  = chartPrices.length ? Math.min(...chartPrices) : 0
  const hi  = chartPrices.length ? Math.max(...chartPrices) : 0
  const pad = (hi - lo) * 0.08
  const xInterval = chart?.length ? Math.max(0, Math.floor(chart.length / 7) - 1) : 0

  return (
    <div className={`${CARD} h-full`}>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <h2 className={`${CARD_LABEL} flex items-center`}>
            Price · {servedUpper}<CardTooltip text={chartVolumeTooltip(servedUpper)} />
          </h2>
          {chartChange != null && !chartLoading && (
            <span
              data-testid="chart-range-change"
              className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${chartChange >= 0 ? 'text-up' : 'text-down'}`}
            >
              <Icon name={chartChange >= 0 ? 'triangle-up' : 'triangle-down'} size="sm" />
              {chartChange >= 0 ? '+' : ''}{chartChange.toFixed(2)}%
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
            <Icon name="refresh" size="md" className={chartLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        {/* Only when the two disagree. The heading already names the currency
          * the chart is in, so a permanent caption restating it is noise — and
          * the caption this replaces was worse than noise, since it contradicted
          * a heading that followed the selector. */}
        {showFallbackNote && (
          <p data-testid="chart-currency-fallback" className="text-xs text-quiet">
            No Kraken {fellBackFrom} market · chart in {servedUpper}
          </p>
        )}
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
            <Icon name="refresh" size="md" />
          </button>
        </div>
      )}

      {chartLoading && !chart
        ? <Skeleton className="h-64" />
        : (
          <div className="relative">
            {/* `crt-wobble` and the overlay below are the CRT treatment — see
              * `src/lib/crt.js`. The wobble is on this wrapper rather than on the
              * series so the axes and gridlines move with it: a line displaced
              * against its own scale is a decorative effect changing a reading.
              * `relative` is what the overlay's `inset: 0` anchors to. */}
            <div className={`crt-wobble relative transition-opacity duration-200 ${chartLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
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
                    tickFormatter={v => `${meta.sym}${Math.round(v / 1000)}k`}
                    width={52}
                  />
                  <YAxis yAxisId="volume" hide />
                  <Tooltip content={<ChartTooltip currency={served} />} />
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
                        label={{ value: `H: ${meta.sym}${Math.round(hi).toLocaleString(meta.locale)}`, position: 'insideTopRight', fill: colors.up, fontSize: 10 }}
                      />
                      <ReferenceLine
                        yAxisId="price"
                        y={lo}
                        stroke={colors.down}
                        strokeDasharray="3 3"
                        strokeWidth={1}
                        label={{ value: `L: ${meta.sym}${Math.round(lo).toLocaleString(meta.locale)}`, position: 'insideBottomRight', fill: colors.down, fontSize: 10 }}
                      />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
              {/* Inside the wobbling wrapper on purpose, so the scanlines travel
                * with the picture rather than sitting in front of a moving one,
                * and so they dim with the chart while a range is loading. */}
              <div className="crt-overlay" data-testid="chart-crt" aria-hidden="true" />
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
