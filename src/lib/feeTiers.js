// What the fee tiers are actually offering the reader — which is sometimes
// nothing, and the card has to be able to say so.
//
// The three tiers are rendered as a choice: Slow, Medium and Fast, each under a
// different confirmation time. Measured across the 50 rows of
// `metric_snapshots` captured between 4 August and 22 September 2026, **all
// three carried the same number on 22 of those days (44%)**, and only 5 days
// showed three genuinely distinct values. The slow tier was 1 sat/vB on **49 of
// the 50** — it is the relay floor, printed daily under a promise of an hour.
//
// **Those readings are correct, and that is the whole point.** When nothing is
// bidding above the floor, a 1 sat/vB transaction goes into the next block, so
// the next-block rate, the three-block rate and the six-block rate genuinely are
// the same number. The defect is presenting a true reading in a form that
// implies a choice: three boxes, three prices that are one price, three
// different waits. A reader takes that as "paying more buys nothing, but the
// card thinks it does", which is the worst of both.
//
// **Deriving our own tiers from `fee_histogram` was considered and refused.**
// We now parse that histogram for the backlog, so we could read the rate at
// which cumulative demand reaches one, three and six blocks. It would collapse
// on exactly the same days and for exactly the same true reason — with a
// backlog under one block, the top block of demand is the whole queue — while
// disagreeing with mempool.space's own figures and adding arithmetic of ours to
// be wrong about. Any change that makes the three numbers differ more often is
// fabricating a fee market that is not there.
//
// So this is a presentation decision, made once, in one place, for the two
// surfaces that draw the grid: the card and the share image. The weekly brief
// has said "Every fee tier is at 1 sat/vB" since v1.12.0 — one of the three
// surfaces reached this conclusion in prose twelve versions ago and nothing
// propagated it. It is deliberately left alone: it lists four tiers including
// economy, which the card does not draw, so forcing it through this module
// would be a change for its own sake.

const isNum = v => typeof v === 'number' && Number.isFinite(v)

// The tiers as data, in the order they are drawn, slowest first.
//
// `blocks` is what the rate buys and is mempool.space's own semantics for these
// fields: `fastestFee` is the next block, `halfHourFee` is within about three,
// `hourFee` within about six. **The minutes those used to be labelled with are
// gone deliberately.** A block interval is exponential with a mean of ten
// minutes, so half of blocks arrive inside seven and one in ten takes more than
// twenty-three: "~10 min" states a mean as though it were a deadline. Blocks are
// what is being bought, they are exact, and the congestion row directly above is
// already counted in blocks — one unit across the card rather than two.
export const FEE_TIERS = [
  { key: 'hourFee',     label: 'Slow',   blocks: '~6 blocks' },
  { key: 'halfHourFee', label: 'Medium', blocks: '~3 blocks' },
  { key: 'fastestFee',  label: 'Fast',   blocks: 'next block' },
]

// A rate of 0 is not something anyone can pay — the relay floor is 1 — so it is
// screened out rather than drawn as a free transaction.
const rate = v => (isNum(v) && v > 0 ? v : null)

/**
 * Read a `/api/v1/fees/recommended` response into what the card should draw.
 *
 * Answers `null` when no tier is usable, `{ flat: true, rate, tiers }` when
 * every tier carries one rate, and `{ flat: false, tiers }` otherwise.
 *
 * Flat means only that there is no premium for priority — the next-block rate
 * equals the six-block rate. It does **not** imply the rate is the relay floor,
 * even though it was 1 sat/vB on all 22 flat days observed: three tiers agreeing
 * at 5 sat/vB is a flat market nowhere near the floor, and copy that named the
 * floor would be false there while looking right on every day in the sample.
 *
 * **Flat requires all three tiers present**, not merely that the survivors
 * agree. The flat state makes a claim — that paying more buys nothing — and one
 * surviving tier is no evidence for it. Declining to collapse is never wrong;
 * collapsing on partial data asserts something the response did not say.
 */
export function readFeeTiers(fees) {
  if (!fees || typeof fees !== 'object') return null

  const tiers = FEE_TIERS
    .map(t => ({ ...t, value: rate(fees[t.key]) }))
    .filter(t => t.value != null)

  if (tiers.length === 0) return null

  const rates = new Set(tiers.map(t => t.value))
  const flat = tiers.length === FEE_TIERS.length && rates.size === 1

  return flat
    ? { flat: true, rate: tiers[0].value, tiers }
    : { flat: false, tiers }
}
