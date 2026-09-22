import { describe, it, expect } from 'vitest'
import { readFeeTiers, FEE_TIERS } from '../feeTiers.js'

const at = (hour, half, fastest) => ({ hourFee: hour, halfHourFee: half, fastestFee: fastest })

describe('readFeeTiers', () => {
  it('reports three distinct rates as a choice, slowest first', () => {
    const r = readFeeTiers(at(3, 8, 25))
    expect(r.flat).toBe(false)
    expect(r.tiers.map(t => [t.label, t.value])).toEqual([['Slow', 3], ['Medium', 8], ['Fast', 25]])
  })

  // The defect this exists for: 22 of the 50 captured days carried one rate
  // across all three tiers, drawn as three boxes under three different waits.
  it('reports one rate across all three tiers as flat', () => {
    const r = readFeeTiers(at(1, 1, 1))
    expect(r.flat).toBe(true)
    expect(r.rate).toBe(1)
  })

  // Flatness is about the premium, not the floor. Copy naming the relay floor
  // would be false here while looking right on every day in the sample.
  it('is flat at any rate, not only at the relay floor', () => {
    expect(readFeeTiers(at(5, 5, 5))).toMatchObject({ flat: true, rate: 5 })
  })

  // 38 of the 50 days had Slow == Medium with Fast above them. That is a real
  // choice — one extra sat/vB buys the next block — so it must not collapse.
  it('does not collapse when two tiers agree and one does not', () => {
    expect(readFeeTiers(at(1, 1, 2)).flat).toBe(false)
    expect(readFeeTiers(at(1, 2, 2)).flat).toBe(false)
  })

  it('drops a tier it cannot use and keeps the rest', () => {
    const r = readFeeTiers({ hourFee: null, halfHourFee: 4, fastestFee: 9 })
    expect(r.tiers.map(t => t.label)).toEqual(['Medium', 'Fast'])
  })

  // A rate of 0 is not something anyone can pay — the relay floor is 1.
  it.each([0, -1, NaN, Infinity, '4', undefined])('screens out a rate of %p', bad => {
    expect(readFeeTiers({ hourFee: bad, halfHourFee: bad, fastestFee: bad })).toBeNull()
  })

  // Declining to collapse is never wrong; collapsing on partial data asserts
  // something about tiers that are not there.
  it('never reports flat when a tier is missing, however the survivors agree', () => {
    expect(readFeeTiers({ halfHourFee: 1, fastestFee: 1 }).flat).toBe(false)
    expect(readFeeTiers({ fastestFee: 1 }).flat).toBe(false)
    expect(readFeeTiers({ hourFee: 1, halfHourFee: 1 }).flat).toBe(false)
  })

  it.each([null, undefined, {}, 'fees', 7])('answers null for an unusable response (%p)', bad => {
    expect(readFeeTiers(bad)).toBeNull()
  })

  // The minutes these used to carry stated the mean of an exponential wait as
  // though it were a deadline. Blocks are what the rate actually buys.
  it('labels every tier in blocks rather than in minutes', () => {
    expect(FEE_TIERS.map(t => t.blocks)).toEqual(['~6 blocks', '~3 blocks', 'next block'])
    for (const t of FEE_TIERS) expect(t.blocks).not.toMatch(/min|hour/)
  })

  it('names the mempool.space field each tier reads', () => {
    expect(FEE_TIERS.map(t => t.key)).toEqual(['hourFee', 'halfHourFee', 'fastestFee'])
  })
})
