import { describe, it, expect } from 'vitest'
import {
  mempoolBacklogBlocks, parseFeeHistogram, backlogBarPct,
  BLOCK_VSIZE, BACKLOG_MIN_FEE_RATE, BACKLOG_BAR_FULL_BLOCKS,
  HISTOGRAM_OVERSHOOT_TOLERANCE, CONGESTED_AT_BLOCKS,
} from '../mempool.js'
import { backlogBand } from '../scales.js'
import { VIBE_ANCHORS } from '../calculations.js'

// A histogram shaped like the days this change was written against: almost
// everything at the relay floor, a little above it. Totals to 41M vbytes, the
// middle of the range observed across 50 captured snapshots.
const IDLE = {
  count: 83_732,
  vsize: 41_000_000,
  fee_histogram: [[1, 40_700_000], [2, 200_000], [3, 100_000]],
}

describe('parseFeeHistogram', () => {
  it('reads [feeRate, vsize] pairs', () => {
    expect(parseFeeHistogram([[1, 100], [5, 200]]))
      .toEqual([{ rate: 1, vsize: 100 }, { rate: 5, vsize: 200 }])
  })

  it('accepts numeric strings, because the field is not pinned by anything here', () => {
    expect(parseFeeHistogram([['2', '300']])).toEqual([{ rate: 2, vsize: 300 }])
  })

  // The trap this repo keeps meeting: `Number('')` is 0, so a blank would enter
  // as a bucket of no size at a fee rate of nothing and pass every later check.
  it('refuses a blank rather than reading it as zero', () => {
    expect(parseFeeHistogram([['', '300']])).toBeNull()
    expect(parseFeeHistogram([[2, '']])).toBeNull()
  })

  it.each([
    ['not an array', { 1: 100 }],
    ['empty', []],
    ['a bare number', [5]],
    ['a short pair', [[5]]],
    ['a non-numeric rate', [['fast', 100]]],
    ['a negative vsize', [[1, -100]]],
    ['a null entry', [null]],
  ])('refuses %s', (_label, input) => {
    expect(parseFeeHistogram(input)).toBeNull()
  })

  // All-or-nothing: one unreadable bucket makes the total wrong by an unknown
  // amount, and a backlog wrong by an unknown amount is worse than no backlog.
  it('refuses the whole histogram when a single bucket is unreadable', () => {
    expect(parseFeeHistogram([[1, 100], [2, 'x'], [3, 300]])).toBeNull()
  })
})

describe('mempoolBacklogBlocks', () => {
  it('counts only vsize bidding at or above the floor threshold', () => {
    // 200k + 100k = 300k vbytes above 1 sat/vB.
    expect(mempoolBacklogBlocks(IDLE)).toBeCloseTo(0.3, 10)
  })

  // The defect. The mempool below is 41 MB, which the old bands called
  // "Moderate"; almost all of it is at the relay floor and is not bidding for
  // anything, so the queue is under a third of one block.
  it('calls a large but idle mempool nearly empty', () => {
    expect(mempoolBacklogBlocks(IDLE)).toBeLessThan(1)
  })

  it('rises with real competition rather than with total size', () => {
    const busy = {
      vsize: 90_000_000,
      fee_histogram: [[1, 40_000_000], [8, 30_000_000], [60, 20_000_000]],
    }
    expect(mempoolBacklogBlocks(busy)).toBeCloseTo(50, 10)
  })

  it('is independent of bucket ordering', () => {
    const ascending = { vsize: 1_000_000, fee_histogram: [[1, 500_000], [9, 300_000]] }
    const descending = { vsize: 1_000_000, fee_histogram: [[9, 300_000], [1, 500_000]] }
    expect(mempoolBacklogBlocks(ascending)).toBe(mempoolBacklogBlocks(descending))
  })

  it('honours the documented threshold constant', () => {
    const m = { vsize: 1_000_000, fee_histogram: [[BACKLOG_MIN_FEE_RATE, 250_000]] }
    // At the threshold, not above it: the bucket counts.
    expect(mempoolBacklogBlocks(m)).toBeCloseTo(0.25, 10)
    expect(mempoolBacklogBlocks({ ...m, fee_histogram: [[BACKLOG_MIN_FEE_RATE - 0.01, 250_000]] }))
      .toBe(0)
  })

  it('reports in blocks, not vbytes', () => {
    expect(mempoolBacklogBlocks({ vsize: 9e9, fee_histogram: [[5, BLOCK_VSIZE * 3]] })).toBe(3)
  })

  // The guard that makes an unverified field shape safe. A cumulative histogram
  // parses perfectly and means something else entirely, so it is caught by
  // summing to far more than the vsize the same response reports.
  it('refuses a histogram that overshoots the vsize beside it', () => {
    const cumulative = {
      vsize: 41_000_000,
      fee_histogram: [[1, 41_000_000], [2, 40_000_000], [3, 30_000_000]],
    }
    expect(mempoolBacklogBlocks(cumulative)).toBeNull()
  })

  it('allows a histogram that undershoots, because binning away the low end is harmless', () => {
    // The buckets this function reads are the high-fee ones; a histogram that
    // omits part of the floor leaves them intact.
    const truncated = { vsize: 41_000_000, fee_histogram: [[4, 2_000_000]] }
    expect(mempoolBacklogBlocks(truncated)).toBe(2)
  })

  it('applies the overshoot tolerance rather than demanding an exact match', () => {
    const within = HISTOGRAM_OVERSHOOT_TOLERANCE / 2
    const m = vsize => ({ vsize, fee_histogram: [[5, 1_000_000]] })
    expect(mempoolBacklogBlocks(m(1_000_000 / (1 + within)))).toBe(1)
    expect(mempoolBacklogBlocks(m(1_000_000 / (1 + HISTOGRAM_OVERSHOOT_TOLERANCE * 2)))).toBeNull()
  })

  it('reads the histogram when no vsize is reported to check it against', () => {
    expect(mempoolBacklogBlocks({ fee_histogram: [[5, 2_000_000]] })).toBe(2)
  })

  // An empty histogram is the one case where `[]` is an answer rather than a
  // failure: a chain with nothing queued reports exactly that, and it is the
  // "Clear" day this whole change exists to be able to show. Refusing it would
  // hide the indicator on the day it is most correct.
  it.each([
    ['vsize of zero', { count: 0, vsize: 0, fee_histogram: [] }],
    ['no vsize and no transactions', { count: 0, fee_histogram: [] }],
  ])('reads an empty histogram beside an empty mempool (%s) as zero backlog', (_label, input) => {
    expect(mempoolBacklogBlocks(input)).toBe(0)
    expect(backlogBand(mempoolBacklogBlocks(input)).label).toBe('Clear')
  })

  // The same `[]` beside a mempool with real size in it means the field did
  // not populate: the buckets cannot be empty while the transactions they
  // describe are not.
  it('refuses an empty histogram beside a mempool that has size in it', () => {
    expect(mempoolBacklogBlocks({ count: 84_000, vsize: 41_000_000, fee_histogram: [] })).toBeNull()
  })

  it.each([
    ['a missing mempool', null],
    ['an undefined mempool', undefined],
    ['a mempool with no histogram', { count: 1, vsize: 41_000_000 }],
    ['an empty histogram beside a full mempool', { count: 1, vsize: 41_000_000, fee_histogram: [] }],
  ])('answers null for %s, never zero', (_label, input) => {
    // Null and zero are different claims: one is "we cannot read this", the
    // other is "the chain is clear". Callers hide the first and draw the second.
    expect(mempoolBacklogBlocks(input)).toBeNull()
  })
})

describe('backlogBarPct', () => {
  it('is empty at no backlog and full at the top of the scale', () => {
    expect(backlogBarPct(0)).toBe(0)
    expect(backlogBarPct(BACKLOG_BAR_FULL_BLOCKS)).toBeCloseTo(100, 10)
  })

  it('clamps rather than overflowing the bar', () => {
    expect(backlogBarPct(10_000)).toBe(100)
  })

  // Linear to 30 blocks would put every ordinary day under 2% of the bar, which
  // is the "pinned at one value" failure moved to the other end of the scale
  // rather than fixed. Half a block has to be visible.
  it('gives an idle chain a readable share of the bar', () => {
    const pct = backlogBarPct(0.5)
    expect(pct).toBeGreaterThan(10)
    expect(pct).toBeLessThan(30)
  })

  it('separates the bands it is drawn under', () => {
    const [clear, light, moderate, busy] = [0.5, 2, 6, 20].map(backlogBarPct)
    expect(clear).toBeLessThan(light)
    expect(light).toBeLessThan(moderate)
    expect(moderate).toBeLessThan(busy)
  })

  it.each([[null], [undefined], [NaN], [-1]])('answers null for %p', input => {
    expect(backlogBarPct(input)).toBeNull()
  })
})

// The bar, the bands and the Vibe Score's hot anchor all describe the same
// point, and it used to be written out three times. Retuning the band boundary
// then left the bar saturating early and the score's anchor on the old figure,
// with every gate in the repo still green — so this is the test that fails if
// any of the three drifts from the other two.
describe('CONGESTED_AT_BLOCKS is the one figure all three scales share', () => {
  it('is where the band becomes Congested', () => {
    expect(backlogBand(CONGESTED_AT_BLOCKS).label).toBe('Congested')
    expect(backlogBand(CONGESTED_AT_BLOCKS - 0.01).label).toBe('Busy')
  })

  it('is where the bar reads full', () => {
    expect(BACKLOG_BAR_FULL_BLOCKS).toBe(CONGESTED_AT_BLOCKS)
    expect(backlogBarPct(CONGESTED_AT_BLOCKS)).toBeCloseTo(100, 10)
    expect(backlogBarPct(CONGESTED_AT_BLOCKS - 1)).toBeLessThan(100)
  })

  it("is the hot anchor of the score's backlog input", () => {
    expect(VIBE_ANCHORS.backlogLog10.hot).toBeCloseTo(Math.log10(1 + CONGESTED_AT_BLOCKS), 12)
  })
})
