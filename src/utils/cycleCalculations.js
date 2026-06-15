// Genesis block date used for Power Law calculation
const GENESIS = new Date('2009-01-03T00:00:00.000Z')

export function calc200DMA(ohlcData) {
  if (!ohlcData?.length) return null
  const closes = ohlcData.map(d => parseFloat(d[4]))
  const last200 = closes.slice(-200)
  if (last200.length === 0) return null
  return last200.reduce((sum, v) => sum + v, 0) / last200.length
}

export function calcMayerMultiple(currentPrice, ma200) {
  if (currentPrice == null || ma200 == null || ma200 === 0) return null
  return currentPrice / ma200
}

export function calcPowerLawFairValue() {
  const daysSinceGenesis = Math.floor((Date.now() - GENESIS.getTime()) / (1000 * 60 * 60 * 24))
  if (daysSinceGenesis <= 0) return null
  const log10Price = -17.01593313 + 5.84509376 * Math.log10(daysSinceGenesis)
  return Math.pow(10, log10Price)
}
