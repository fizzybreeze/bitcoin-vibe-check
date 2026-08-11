/**
 * The Satoshi quotes, in one place.
 *
 * They were private to `SatoshiQuote.jsx` until the weekly brief wanted to sign
 * off with one — and a second copy of the list is the `ORANGE`-in-three-files
 * problem in prose: the footer and the newsletter drifting to different
 * quotations of the same person, with nothing on screen to say which is the
 * real one. The dashboard rotates through them at random; the brief takes one
 * per week, deterministically, so consecutive issues do not repeat and a brief
 * re-generated for the same week is byte-identical to the first attempt.
 */

export const SATOSHI_QUOTES = Object.freeze([
  { text: "If you don't believe it or don't get it, I don't have the time to try to convince you, sorry.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "The root problem with conventional currency is all the trust that's required to make it work.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "It might make sense just to get some in case it catches on.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "Lost coins only make everyone else's coins worth slightly more. Think of it as a donation to everyone.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "Writing a description for this thing for general audiences is bloody hard. There's nothing to relate it to.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "In a few decades when the reward gets too small, the transaction fee will become the main compensation for nodes.", attribution: 'Satoshi Nakamoto, Bitcoin Whitepaper' },
  { text: "The nature of Bitcoin is such that once version 0.1 was released, the core design was set in stone for the rest of its lifetime.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
  { text: "Governments are good at cutting off the heads of centrally controlled networks like Napster, but pure P2P networks like Gnutella and Tor seem to be holding their own.", attribution: 'Satoshi Nakamoto, Bitcointalk' },
])

/**
 * One quote per calendar week, chosen from the date rather than from a counter.
 *
 * A counter would need somewhere to live, and the only durable store this job
 * has is a table of market metrics. Weeks-since-epoch is state nobody has to
 * keep: it advances by exactly one every seven days, so consecutive briefs get
 * consecutive quotes, and re-running a brief for a past week reproduces the
 * quote that brief carried.
 */
export function quoteForWeek(iso) {
  const ms = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(ms)) return null
  // Shifted four days because the Unix epoch was a **Thursday**, so the naïve
  // division groups Thursday-to-Wednesday and the quote changes mid-week. Two
  // consecutive Sunday briefs get consecutive quotes either way, so nothing the
  // brief does would have shown it — the name would simply have been a lie for
  // anyone who called this with another date.
  const weeks = Math.floor((ms + 4 * 86_400_000) / (7 * 86_400_000))
  return SATOSHI_QUOTES[((weeks % SATOSHI_QUOTES.length) + SATOSHI_QUOTES.length) % SATOSHI_QUOTES.length]
}
