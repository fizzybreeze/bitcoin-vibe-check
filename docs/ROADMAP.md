# Product Roadmap

**What this is:** a living list of where Bitcoin Vibe Check could go next, with the
reasoning attached so a future session (human or agent) can disagree with the
reasoning rather than guess at it.

**What this is not:** a commitment, an estimate, or a schedule. Horizons are
ordering, not dates. Nothing here is approved until it has a PR.

For what has already shipped, read the version-history table in
[`CLAUDE.md`](../CLAUDE.md) — that table is the record, this file is the intent.
The two should never describe the same thing: when an item here ships, delete it
from here and add a row there.

---

## 1. The thesis

> **Read the room.** Everything about Bitcoin's current state, on one page, in
> five seconds, with no login, no account, and no wallet connection.

That sentence is the filter. Every idea below has to survive it:

| Filter | The question it asks |
|---|---|
| **Five seconds** | Can a visitor get the answer without scrolling, tapping, or reading a paragraph? |
| **No login** | Does this work for someone who will never create an account? (They are the overwhelming majority, and they always will be.) |
| **One page** | Does this earn its pixels, or is it a second page pretending to be a feature? |
| **Free to run** | Does it fit Vercel + Supabase + GitHub Actions free tiers? A dashboard that costs money per visitor cannot stay free to visit. |
| **Keyless where possible** | Every keyed or geo-restricted source is a future outage. Binance taught this twice (HTTP 451, see `CLAUDE.md`); BGeometrics' 15-requests-per-day free tier is the current ceiling. |

An idea that fails one filter is not automatically dead — but it needs an
explicit argument, written down, for why the exception is worth it.

---

## 2. The honest starting position

Three facts shape everything below, and each is an opportunity rather than a complaint.

**The dashboard had no vibe — v1.5.0 is the first answer to that.** It has two
dozen excellent numbers. A visitor who already knows what a Mayer Multiple is
gets enormous value; everyone else got a wall. The name of the product promises
a *read*, and the product delivered *readings*. The Vibe Score closes the first
half of that gap: one number, in the first card, with its components beside it.
What it does not yet have is context — a 68 means nothing without knowing
whether last week was 40 or 80, which is §3.2 and is why that item is now the
most valuable thing on this list.

**`metric_snapshots` is barely read.** The daily Actions job upserts a full
metrics row per UTC day since it moved off the home Proxmox box, and the table
has public `SELECT`. As of v1.6.9 it has two consumers — `api/chain-data.js`
reads the latest row's MVRV when BGeometrics is unavailable (§3.2b), and the
Vibe Score sparkline replays the last 30 rows (§3.2c), which is the first line
of `src/` to touch it. Be honest
about the scale, though: on 2026-08-06 the table held **3 rows** (4–6 Aug), of
which the cron produced two — every field populated on all three, and no failed
run yet. Nothing is broken; it is simply young. That makes this the cheapest
leverage in the repo *prospectively*, and it also means there is no history
against which to calibrate anything, including the Vibe Score weights. It stores
the Vibe Score's inputs rather than the score, which is the right choice, and as
of v1.6.4 it stores all seven of them.

**Sharing works, and as of v1.6.0 so does being shared.** `ShareCanvas` renders
eight genuinely good cards, and `html2canvas` is lazy-loaded so it costs nothing
until used — but that is the path someone has to choose. The automatic one, which
fires far more often, used to be a static `/og-image.png` that said the same
thing whether BTC was at 40k or at an all-time high; §3.3 replaced it with a
rendered card. What is still unmeasured is whether unfurlers actually re-fetch
it: X and Facebook cache preview images for days, so the live number may reach
fewer people than the endpoint's five-minute cache implies. Nobody has checked,
and the honest next step is to look at a real paste in each of the three or four
places this link actually gets pasted before building anything else on top.

---

## 3. Now — unlock what is already paid for

Everything in this horizon is small, uses infrastructure that already exists, and
needs no new architecture.

### 3.2 Read the snapshot table

**What.** Give any metric a history. The sparkline under the Vibe Score has
shipped; the range selector (30 / 90 / 365) and histories for other metrics
have not.

**Why.** The data already exists, the table is already publicly readable, and
"how does today compare" is the question the current dashboard cannot answer at
all. A composite is also the one series that is ours by construction — anyone can
chart price, but the Vibe Score only exists here, so its history is the part of
this that cannot simply be looked up elsewhere.

**How.** `metric_snapshots` has a `SELECT`-to-public RLS policy, so
`src/lib/supabase.js` can query it directly with the anon key — no new serverless
route needed for v1. One row per UTC day, `metrics` as `jsonb`, so a single
query returns every series at once. Two things to respect: `supabase.js` fails
soft and returns `null` when env vars are absent, so history must degrade to
"unavailable" rather than throw; and any new fetch needs a matching
`runtimeCaching` rule, because `pwaRuntimeCaching.test.js` pins the rule set to
the documented sources and will fail otherwise. That test is doing its job — let
it.

**The sparkline rules, kept.** Shipped as decided: **7 data points minimum,
hidden below that**, labelled `since 4 Aug` until 30 exist and `30d` after. No
padding, no backfill. Those rules now live in `src/lib/vibeHistory.js` with
tests, so anything built on top of this series inherits them rather than
re-deciding them.

#### Readiness, checked 2026-08-06

The cadence question this item was gated on is now answered — **the job is
healthy**. Three rows (4, 5, 6 Aug), all 28 metric fields non-null on every one,
five runs green: three manual dispatches and **two scheduled**, so the cron has
now fired on consecutive days rather than once. One observation worth recording:
`snapshot.yml` asks for 06:17 UTC and the two scheduled runs actually started at
09:10 and 09:11 UTC. That is ordinary GitHub queueing for scheduled workflows,
not a fault, and ~15 hours of headroom before the delay could push a row onto
the wrong `captured_on` — but it is the reason to read the cron as "some time
that morning" rather than as a clock.

The answer to *is it too soon* was that **§3.2 is three sub-items with three
different readiness dates**. All three have now shipped; what remains of the
item is below them.

**3.2a — snapshot sufficiency. Shipped in v1.6.4; see the version-history row.**
The row now carries `price_change_30d_pct`, so a stored day replays into the
same Vibe Score the card showed. The rows captured before it — 4 to 6 Aug — stay
momentum-less permanently, which is the whole reason it went first.

**3.2b — MVRV fallback. Shipped in v1.6.5; see the version-history row.**
`/api/chain-data` serves the last stored `mvrv_value` when BGeometrics does not
answer, capped at 7 days old and labelled on the card. It is the first thing in
the repo to read `metric_snapshots`.

**3.2c — the sparkline. Shipped in v1.6.9; see the version-history row.** It
answered "start the series on 7 Aug" with a rule rather than a date: a row is
plotted only if it reproduces all seven Vibe Score inputs, so the
momentum-less rows exclude themselves and so does any future input added
without a snapshot field.

**What is left of §3.2** is the part the sparkline deliberately did not take:
the 30 / 90 / 365 selector, and a history for anything other than the Vibe
Score. Both want the table to be older than it is — the sparkline draws nothing
until 7 comparable rows exist, and a 365-day control over 3 weeks of data is a
control that lies about what is behind it. Revisit when the table has a
quarter in it.

---

## 4. Next — become a destination, and a source

Bigger items. Each needs a design pass before anyone starts.

### 4.2 Public data API and an embeddable badge

**What.** Promote the direct table read of §3.2 into documented public endpoints
— `/api/history` and `/api/vibe` — then ship a one-line embed that renders the
current Vibe Score on someone else's site with a link back.

**Why.** It changes what BVC *is* from a site people must remember to visit into
a source other people cite. Backlinks, distribution, and a moat that compounds:
the composite is only available from here.

**Prerequisites, in order.** Rate limiting and a caching posture first — an
unauthenticated public endpoint on a free tier is an invitation. **The first
half of that shipped in v1.7.17** and is deliberately not enough for this item:
`api/lib/abuseGuard.js` bounds a single-client flood in a *per-instance* map,
which is right for two routes nobody is supposed to call directly and wrong for
an endpoint whose whole purpose is to be called by other people's servers. A
public API needs shared state — the limit has to mean the same thing on every
instance — and that is the piece nobody has designed yet. Serve from
`metric_snapshots` (own data, no upstream cost) rather than proxying live sources,
and cache hard at the edge. A stale-by-an-hour public API is fine; a serverless
bill is not.

### 4.3 Explainer pages that rank

**What.** A page per indicator — `/what-is/mayer-multiple`, `/what-is/mvrv`,
`/what-is/fear-and-greed` — each combining a plain-English explanation with the
**live current value** and its history.

**Why.** The whole site is currently one URL competing for one set of keywords.
Each page would be a natural entry point that lands a visitor one click from the
dashboard, and BVC has something a static blog post cannot match: the number is
live and the chart is today's.

**Validate before building.** This item rests entirely on there being real search
demand for these terms, which nobody has measured. An afternoon in a keyword tool
decides whether it is worth the routing work — do that first, and if the demand
is not there, move this to §7 with the numbers attached.

**The catch — this is the first real architectural decision on this list.** It
needs routing, which the app does not have, and the PWA precache story has to
survive it. Prerender to static HTML rather than bolting on a client-side router
that serves an empty shell to crawlers; the content is not personalised, so
build-time generation is both simpler and better. Do the design work before the
implementation work.

### 4.4 Automate the daily post and the newsletter draft

**What.** After the snapshot job runs, render the Vibe card and draft the day's
summary automatically.

**Why.** "Satoshi's Weekly Brief" already exists and the Beehiiv integration is
already built. Newsletters go quiet because writing them is manual, and the
value here is not the prose — it is the numbers, which are already collected,
already formatted, and already have a rendering pipeline. Automating the draft
removes the only expensive part.

**How.** Extend `snapshot.yml`: generate the card image server-side (shares
machinery with §3.3), compose a summary from the day's metrics and the Vibe
Score delta, and leave it as a draft. **Keep a human in the send loop** — an
automated dashboard posting automated commentary about markets is exactly the
kind of thing that is fine 364 days a year and mortifying on the day of a
crash.

---

## 5. Later — deepen

Directionally right, not yet specified. Listed so they are not forgotten.

**A personal layer that never leaves the device.** Enter a cost basis and a stack
size in `localStorage`; see position value, personal break-even against the
Power Law and the 200-day, "your MVRV". No account, no wallet connect, no upload
— and say so loudly on the card itself, because the trust claim *is* the feature.
`usePersistedState` already does the storage half.

**Vibe history replay.** Once the table has a year: "this day last year", cycle
overlays, "the last time the vibe was this low". Gated purely on data age, which
is why §3.2 matters now rather than later.

**More currencies and locales.** Kraken carries more fiat pairs than the five
currently subscribed, and the marginal cost per pair is close to zero.

**Nostr-native.** Zaps alongside the Strike link, the daily vibe published to a
relay, optional NIP-07. The audience overlap with an opinionated no-login
Bitcoin dashboard is about as high as it gets.

**What the v1.7.12 accessibility pass deliberately did not cover**, so nobody reads v1.7.12 as
"accessible, done": focus indicators and visible focus order, keyboard
operability of the alerts panel and share modal, heading structure, and any
audit by an actual screen reader rather than by assertion. Contrast was fixed
for text on `bg-gray-900` specifically — the one background this app uses for
cards — and not proven for any other pairing.

---

## 6. Enabling work

Not features. The roadmap stalls without them.

**Data-source resilience. The price half shipped in v1.7.9.** `priceUsd` now
falls back to the Kraken ticker already fetched in the same burst, the mapping
lives in `src/lib/marketData.js` where each source failing is a unit test, and
`e2e/resilience.spec.js` aborts a source outright to check what a visitor is
left with. Which sources deliberately have *no* fallback — 24h volume, 24h
change, market cap, dominance — is written down in that module with the reason.

**The remaining half shipped in v1.7.10.** Market cap took the second of the
two options this file offered — price × issued supply, from the chain tip the
dashboard already fetches — and answered the "headline figure people compare
against other sites" objection with a label rather than a blank, on the v1.6.5
precedent. The same change found that `VolumeCard` gated its whole body on the
volume, so a CoinPaprika outage had been blanking **sats per fiat** too, which
needs only the price v1.7.9 had already rescued.

**What is left is a genuine dead end, recorded as one.** 24h volume, 24h change
and BTC dominance have no second source in this stack and cannot be honestly
derived from one: Kraken's `v[1]` is one pair on one exchange against a figure
advertised as global, a candle-derived change is "since yesterday's close"
rather than a rolling 24 hours, and nothing else the app fetches knows altcoins
exist. The only remaining option is a second aggregator, which is a new
dependency against §1's keyless preference for three secondary numbers that
already fail visibly rather than wrongly. Not worth it today; revisit only if
CoinPaprika's reliability becomes a real complaint rather than a hypothetical.

**Rate-limit and abuse posture. The first pass shipped in v1.7.17.** The premise
was that the edge cache was an adequate-if-thin defence; it turned out not to be
a defence at all against anyone who thought about it for a second, because a CDN
cache key includes the query string and neither public route took a parameter or
rejected one. `?1`, `?2`, `?3` on `/api/chain-data` is fifteen requests from
spending the whole day's BGeometrics quota. Both routes now refuse a query
string outright — which protects the *upstreams* — and count requests per client
address, which protects the *invocation count*; see the version-history row for
why those are two defences rather than one.

**What is left is the part that needs shared state.** The limiter is per
serverless instance and in memory, so the real ceiling is the limit times
however many are warm, and a cold start begins at zero. That bounds one client
holding a key down, which is the shape this was for. It does not bound a
distributed flood, and it cannot be the answer for §4.2, whose endpoints are
*meant* to be called by other people's servers — that needs a counter every
instance can see (Supabase, or a KV store) and a documented quota, and neither
has been designed. Revisit with §4.2, not before: a rate limiter with no
endpoint to protect is a guess about the shape of traffic that does not exist.

---

## 7. Deliberately not doing

Saying no is most of what makes a roadmap useful. Each of these has been
considered and rejected on the thesis, not on effort.

| Not doing | Why |
|---|---|
| Accounts and logins | The no-login constraint is the product, not a limitation to grow out of. Every feature here is designed to work without one. |
| Wallet connect / exchange API keys | Asking a Bitcoiner to connect a wallet to a dashboard is asking for trust that a dashboard has no business requesting. The local-only personal layer gets most of the value at none of the risk. |
| Altcoin coverage | BTC dominance is the one altcoin-adjacent number that tells you something about Bitcoin. Everything past that is a different product. |
| Price predictions or buy/sell signals | Power Law and Mayer Multiple are *models with published formulas*, presented as such. A signal is advice, and advice is a liability. |
| Native App Store apps | The PWA installs on iOS, Android and desktop today. App-store review, two more build pipelines and a 30% cut buy nothing the install prompt does not already provide. |
| Ads | They would undercut the fast, dense, no-nonsense feel that is the entire reason to prefer this over a block explorer. Lightning donations, and the supporter ticker, stay the model. |

---

## 8. Keeping this file honest

- **Shipped items leave.** Delete the entry here, add a version-history row in
  `CLAUDE.md`. A roadmap that also documents the past becomes a second source of
  truth about the present, which is worse than having neither.
- **Rejected items move to §7 with a reason.** A "no" with reasoning attached
  stops the same idea being re-litigated in six months.
- **No market research went into this.** The arguments here are drawn from the
  codebase and the thesis, not from competitor analysis, keyword data or user
  interviews — none of which anyone has done. Claims about what other dashboards
  offer or what people search for should be treated as assumptions to test before
  they justify a sprint, and rewritten with evidence once someone has any.
- **Stale beats absent, but not by much.** If nothing here has moved in a
  quarter, the honest fix is to re-scope it, not to leave it as decoration —
  `docs/DEV_WORKFLOW_AUDIT.md` carries a status banner for exactly this reason.
