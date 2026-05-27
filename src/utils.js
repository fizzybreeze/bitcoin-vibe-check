export const CURRENCY_META = {
  usd: { sym: '$',   locale: 'en-US' },
  gbp: { sym: '£',   locale: 'en-GB' },
  eur: { sym: '€',   locale: 'de-DE' },
  cad: { sym: 'C$',  locale: 'en-CA' },
  chf: { sym: 'Fr.', locale: 'de-CH' },
}

export const fmtCurrency = (n, currency) =>
  new Intl.NumberFormat(CURRENCY_META[currency]?.locale ?? 'en-US', {
    style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0,
  }).format(n)

export const fmtVolume = (n, currency) => {
  if (n == null) return null
  const sym = CURRENCY_META[currency]?.sym ?? '$'
  if (n >= 1e9) return `${sym}${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${sym}${(n / 1e6).toFixed(0)}M`
  return fmtCurrency(n, currency)
}

export function computeChartChange(chartData) {
  if (!chartData || chartData.length < 2) return null
  const first = chartData[0].price
  const last  = chartData[chartData.length - 1].price
  return ((last - first) / first) * 100
}
