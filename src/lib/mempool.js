// The mempool's queue, not its size.
//
// `/api/mempool` reports a total vsize that barely moves whatever the fee market
// is doing. Measured across the 50 rows of `metric_snapshots` captured between
// 4 August and 22 September 2026, the whole range was **38.35 to 45.48 MB**,
// while the fastest fee never left 1 to 4 sat/vB. That total is not 41 MB of
// demand for block space. It is a few blocks of real bids plus a large tail of
// transactions paying at or near the relay floor, and that tail does not drain,
// so the total never falls.
//
// The old `congestionBand` read that total against thresholds of 5 MB and 50 MB,
// so it answered **"Moderate" on every one of those 50 days** and could not have
// answered anything else: the low boundary is eight times below the observed
// floor and the high one only 10% above the observed ceiling. The Vibe Score's
// congestion dimension had the same defect from the other side, averaging a fee
// reading that correctly said "empty" (heat 0 to 30) with a transaction *count*
// reading that said "half full" (heat 37 to 46, against a 200,000 anchor the
// count never approached). Two inputs measuring different things, cancelling.
//
// What a reader means by congestion is how much block space is being competed
// for *above the floor*. `fee_histogram` carries exactly that, and it arrives in
// the same `/api/mempool` response the app already fetches, so this costs no new
// request and no new source. It was being downloaded and discarded.
//
// ── On the shape of `fee_histogram` ──────────────────────────────────────────
// It is documented as an array of `[feeRate, vsize]` pairs. Nothing in this repo
// had ever read it (`e2e/fixtures.js` stubbed it as `[]`), and the sandbox this
// was written in cannot reach mempool.space, so the shape is **taken from the
// documentation rather than measured**. That is why the parsing below is strict
// and self-validating rather than trusting: a shape this code does not expect
// yields `null`, and `null` hides the reading instead of printing a wrong one.
// Summing above a threshold is deliberately order-independent, so it holds
// whether the buckets arrive ascending or descending.

const num = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  // A blank string is absent, not zero — `Number('')` is 0, which would enter a
  // bucket of no size at a fee rate of nothing and quietly pass every check.
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const isNum = v => typeof v === 'number' && Number.isFinite(v)

/** One block's worth of block space, in vbytes. */
export const BLOCK_VSIZE = 1_000_000

// sat/vB. 1 is the default minimum relay fee, so a transaction paying it is not
// bidding for position — it is paying the price of being allowed into the queue
// at all. Counting from 2 upwards is what lets an idle mempool read as idle,
// which is the entire complaint this module answers.
export const BACKLOG_MIN_FEE_RATE = 2

// The parsed histogram is summed and compared against the `vsize` the *same*
// response reports. A per-bucket histogram sums to roughly that total; a
// cumulative one would sum to several times it. Rejecting a sum that overshoots
// is what stops a histogram in an unexpected shape being reported as a backlog.
//
// The check is deliberately **one-sided**. A histogram that bins away or omits
// part of the low-fee end sums to *less* than the reported total while leaving
// the high-fee buckets this function actually reads perfectly intact, so a
// shortfall is not evidence of anything being wrong with the numbers used here.
export const HISTOGRAM_OVERSHOOT_TOLERANCE = 0.25

/**
 * `[[feeRate, vsize], …]` → `[{ rate, vsize }, …]`, or `null` if any entry is
 * not a usable pair. All-or-nothing on purpose: a histogram with one unreadable
 * bucket is one whose total is wrong by an unknown amount, and a backlog that is
 * wrong by an unknown amount is worse than no backlog.
 */
export function parseFeeHistogram(histogram) {
  if (!Array.isArray(histogram) || histogram.length === 0) return null
  const buckets = []
  for (const entry of histogram) {
    if (!Array.isArray(entry) || entry.length < 2) return null
    const rate = num(entry[0])
    const vsize = num(entry[1])
    if (rate == null || vsize == null || rate < 0 || vsize < 0) return null
    buckets.push({ rate, vsize })
  }
  return buckets
}

/**
 * Blocks of backlog bidding at or above `minFeeRate`. `null` when the histogram
 * is absent or unusable, which every caller renders as "no reading" rather than
 * as zero — an empty mempool and an unreadable one are not the same claim.
 */
export function mempoolBacklogBlocks(mempool, minFeeRate = BACKLOG_MIN_FEE_RATE) {
  const buckets = parseFeeHistogram(mempool?.fee_histogram)
  if (buckets == null) return null

  const reported = num(mempool?.vsize)
  if (reported != null && reported > 0) {
    const total = buckets.reduce((sum, b) => sum + b.vsize, 0)
    if (total > reported * (1 + HISTOGRAM_OVERSHOOT_TOLERANCE)) return null
  }

  const bidding = buckets.reduce((sum, b) => (b.rate >= minFeeRate ? sum + b.vsize : sum), 0)
  return bidding / BLOCK_VSIZE
}

// Where the bar reads full. The top of the "Congested" band, so the bar spans
// the whole range the labels describe rather than saturating inside it.
export const BACKLOG_BAR_FULL_BLOCKS = 30

/**
 * Bar fill for a backlog, 0–100.
 *
 * Log rather than linear, for the same reason the Vibe Score reads the fee tier
 * through `log10`: a fee market is log-distributed. Linear to 30 blocks would
 * leave every ordinary day in the bottom two percent of the bar, which is the
 * "pinned at one value" failure this change exists to remove, moved to the other
 * end of the scale rather than fixed.
 */
export function backlogBarPct(blocks) {
  if (!isNum(blocks) || blocks < 0) return null
  const pct = (Math.log10(1 + blocks) / Math.log10(1 + BACKLOG_BAR_FULL_BLOCKS)) * 100
  return Math.min(100, pct)
}
