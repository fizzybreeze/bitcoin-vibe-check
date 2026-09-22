import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readFeeTiers, FEE_TIERS, FLAT_CAPTION } from '../feeTiers.js'

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

describe('the flat caption', () => {
  const src = f => readFileSync(resolve('src/components', f), 'utf8')
  const SURFACES = ['NetworkFeesCard.jsx', 'ShareCanvas.jsx']

  // It was written out at both call sites and had already diverged: the card's
  // copy ended "so paying more buys nothing" and the share image's did not,
  // while the only test on the share wording matched either. Rewording one
  // would have left the other — the surface that cannot be re-rendered once
  // posted — on the old sentence with every gate green.
  // Asserted on the *render* rather than on the name: `FLAT_CAPTION` appears on
  // the import line too, so a file that imports it and then hand-writes a
  // sentence anyway satisfies a bare name scan. The v1.16.0 trap — a surface
  // check that matched the import and stayed green when the call was deleted.
  it.each(SURFACES)('%s renders the shared caption rather than its own', file => {
    expect(src(file)).toMatch(/\{FLAT_CAPTION\}/)
  })

  // The import line and the tooltip are both stripped first: the tooltip
  // legitimately explains what a premium for priority is, so scanning the whole
  // file for the phrase flags correct copy. What this forbids is a second
  // *rendered* sentence beside the shared one.
  it.each(SURFACES)('%s does not hand-write a caption beside it', file => {
    const body = src(file)
      .replace(/^import .*$/gm, '')
      .replace(/const FEES_TOOLTIP = '[^']*'/, '')
    expect(body).not.toMatch(/premium for priority|paying more buys nothing/i)
  })

  // Flatness means there is no premium for priority. It does **not** mean the
  // rate is the relay floor — three tiers agreeing at 5 sat/vB is a flat market
  // nowhere near it. All 22 observed flat days sat at exactly 1, so a floor
  // claim would have been true of the whole sample and wrong the first time it
  // mattered. The card's tooltip carried exactly that claim after the caption
  // had been corrected for it, on the one surface nothing tested.
  it('never explains the collapse by naming the relay floor', () => {
    const tooltip = src('NetworkFeesCard.jsx').match(/const FEES_TOOLTIP = '([^']*)'/)[1]
    for (const copy of [FLAT_CAPTION, tooltip]) {
      for (const sentence of copy.split(/(?<=\.)\s+/)) {
        const saysFlat  = /same rate|same number|one price|one figure/.test(sentence)
        const saysFloor = /relay floor/.test(sentence)
        expect(saysFlat && saysFloor,
          `copy ties the collapse to the relay floor: "${sentence}"`).toBe(false)
      }
    }
  })

  it('states the condition the card actually collapses on', () => {
    const tooltip = src('NetworkFeesCard.jsx').match(/const FEES_TOOLTIP = '([^']*)'/)[1]
    expect(tooltip).toMatch(/every tier carries the same rate/)
  })
})
