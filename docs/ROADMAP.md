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

**`metric_snapshots` is accruing data nothing reads.** The daily Actions job
upserts a full metrics row per UTC day since it moved off the home Proxmox box,
the table has public `SELECT`, and not one line of `src/` touches it. Be honest
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

**What.** Give any metric a history. Start with a sparkline under the Vibe Score
and the ability to see the last 30 / 90 / 365 days.

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

**The sparkline, decided.** The Vibe Score shipped in v1.5.0 without one —
history was never part of 3.1, and keeping it out kept that change a pure
function with no Supabase read. When this item lands: **show the sparkline from
7 data points, hide it below that**, and label it honestly (`since 4 Aug` until
30 days exist, then `30d`). Never render a 2-point line — it reads as broken
rather than as young — and never pad or backfill, because a fabricated history
under a credibility-sensitive number is the worst trade available.

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

So the answer to *is it too soon* is that **§3.2 is three sub-items with three
different readiness dates**, and only one of them is waiting on anything.

**3.2a — snapshot sufficiency. Shipped in v1.6.4; see the version-history row.**
The row now carries `price_change_30d_pct`, so a stored day replays into the
same Vibe Score the card showed. The rows captured before it — 4 to 6 Aug — stay
momentum-less permanently, which is the whole reason it went first.

**3.2b — MVRV fallback. Not gated on data age at all; shippable now.** Serve
MVRV from `metric_snapshots` when the BGeometrics budget (15 requests/day) is
exhausted. The snapshot job already stores `mvrv_value` and `mvrv_date` daily —
today's row carries MVRV dated the previous day, which is exactly the shape this
needs. Yesterday's MVRV is a far better answer than a blank card, and it removes
the only hard rate limit in the stack from the critical path. Three rows is
already full value here, because this reads the *latest* row rather than a
series.

**3.2c — the sparkline itself.** Wants 7 rows by the rule above, which arrives
around **10 Aug**. Building it before then is reasonable — the "not enough
history yet" branch is the one that will actually render on the day it merges,
which is a good reason to have written it deliberately rather than as an
afterthought. With 3.2a shipped this is no longer blocked on anything but the
row count. Recompute the score from a row's inputs via `vibeInputsFromMetrics`
in `scripts/lib/metrics.js` rather than reimplementing the mapping — and expect
the first three rows to score slightly differently from how the card read on
those days, because they have no momentum. Label that, or start the series on
7 Aug.

### 3.4 Alerts worth keeping

Two problems, one theme: alerts exist but do not yet do the job.

**Fee-window alerts.** "Tell me when fees drop below 5 sat/vB" is plausibly the
most practically useful alert this dashboard could offer. Price alerts are a
commodity; a nudge that saves someone real money when they move coins is a
reason to keep the PWA installed. `usePriceAlerts` generalises to
threshold-on-any-metric with modest surgery — extend it to fees, Fear & Greed
extremes, and Mayer crossings.

**They only fire when the tab is open.** `fireNotification` calls
`new Notification(...)` from inside the running page, so an alert set at 2am
fires only if the browser tab survived until 2am. Fixing that properly is Web
Push, which is §4.1 — but it is worth being clear that until then, alerts are a
convenience for open tabs rather than a background service, and the copy should
not overpromise.

#### 3.4a — generalise the rule, and extract the predicate

`usePriceAlerts` currently hard-codes both the shape of a rule
(`{targetPrice, currency, direction}`) and the crossing test, which is inline in
the price-tick effect. Widen the shape to name a metric, and **lift the crossing
test out into a pure function in `src/lib/`**, next to `calculations.js`, taking
a rule and a metrics object.

That extraction is the whole reason §3.4 and §4.1 are separable rather than one
change: §4.1's server-side evaluator imports the same function, so the browser
and the job cannot disagree about when an alert fires — and the decision stays
unit-testable without a service worker in the loop.

Alerts already saved to `localStorage` under `btc-vibe-price-alerts` have no
metric field. **Migrate them on read** — reading a stored price alert as an
unrecognised rule and dropping it silently deletes something a visitor set
deliberately.

#### 3.4b — the new metrics in the panel

Fees, Fear & Greed extremes, Mayer crossings, plus the copy fix above.
`PriceAlertsPanel.jsx` is already 153 lines and this is the change that grows
it, which is why it is worth its own diff: 3.4a's review question is "is the
rule model right", 3.4b's is "does this work on a phone". Both are worth asking;
neither is served by asking them in one PR.

> **These three metrics are all keyless** — mempool.space, alternative.me, and
> Kraken OHLC plus a price for the Mayer Multiple. Nothing in §3.4 touches the
> BGeometrics quota or needs §3.2. MVRV is the one metric that would, which is
> the argument for leaving it out of the first cut.

---

## 4. Next — become a destination, and a source

Bigger items. Each needs a design pass before anyone starts.

### 4.1 Real push notifications

**What.** Alerts that fire with the tab closed and the phone in a pocket.

**Why.** This is the strongest retention mechanic available to a product with no
login. An alert that arrives is a reason to open the app; an alert that requires
the app to already be open is not an alert. It also completes a feature that is
already advertised, which matters more than adding a new one.

**How.** Web Push via the existing service worker: VAPID keys, a Supabase
`push_subscriptions` table keyed by endpoint, and a scheduled job that evaluates
thresholds server-side and posts to the push service.

**The interesting constraint.** No login means the push endpoint *is* the
identity. RLS must let an anonymous client insert its own subscription and manage
only that row — the `donors` policy set is the precedent for getting this right,
and the security advisors must come back clean. Also: an evaluation job on a
short cadence is a different cost profile from one daily snapshot; check the
Actions minutes before committing to a frequency, and consider a Supabase edge
function instead.

**The service worker is not ready for this, and that is the hidden cost.**
`vite.config.js` configures `VitePWA` with a `workbox: {...}` block — the
generateSW strategy, where there is no service-worker source file to hang a
`push` or `notificationclick` listener on. Adding one means either
`injectManifest` with a new `src/sw.js`, or `workbox.importScripts`. Under
`injectManifest` the exported `runtimeCaching` array moves into the SW source,
so `pwaRuntimeCaching.test.js` gets reworked alongside it. Budget for this
explicitly; it is not a line of config.

#### 4.1a — subscription plumbing, no sender

SW strategy switch, the `push_subscriptions` migration and its RLS, the
subscribe/unsubscribe UI, and a `push` handler that renders a notification.
Nothing evaluates anything yet — verify by pushing to your own endpoint by hand.
Worth isolating because this is the diff the security review is *about*: can an
anonymous client reach a row that is not its own, and does the PWA still install.

#### 4.1b — the evaluator

The scheduled job, importing 3.4a's predicate. Its "read the current metrics"
half is a job `scripts/snapshot.js` already does — reuse that fetch layer rather
than inventing a second one, and note it is the *fetch* layer that is reusable,
not `metric_snapshots`: a daily row is far too stale to fire a fee alert against.

#### Sequencing

**§3.4 → §4.1, one way, and they are not one PR.** §3.4 is pure client — no
migration, no keys, no cron, no serverless, no service worker — and is verifiable
by `npm test` plus the e2e suite. §4.1 is almost entirely infrastructure, and
barely touches `src/`. The dependency is that §4.1's evaluator needs a *rule
format*, and §3.4a is the change that invents one; building §4.1 first means
inventing a provisional format and then rewriting it.

The overlap that tempts you to merge them is the crossing predicate, and 3.4a's
extraction is the answer to it. Four PRs, in order: **3.4a → 3.4b → 4.1a →
4.1b**. 3.4a and 3.4b merge cleanly into one if you want it shorter; 4.1a and
4.1b merge less cleanly. Nothing should merge across the §3/§4 boundary — the
review questions on either side have almost nothing in common, and the whole
point of the phone workflow is that a diff can be judged on its own terms.

### 4.2 Public data API and an embeddable badge

**What.** Promote the direct table read of §3.2 into documented public endpoints
— `/api/history` and `/api/vibe` — then ship a one-line embed that renders the
current Vibe Score on someone else's site with a link back.

**Why.** It changes what BVC *is* from a site people must remember to visit into
a source other people cite. Backlinks, distribution, and a moat that compounds:
the composite is only available from here.

**Prerequisites, in order.** Rate limiting and a caching posture first — an
unauthenticated public endpoint on a free tier is an invitation. Serve from
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

**Light mode and an accessibility pass.** Contrast audit, `prefers-reduced-motion`
honoured by the breathing dot and the supporter ticker, real labels on the
sparklines and the difficulty bar. Widens the audience, and is the right thing
to do regardless.

---

## 6. Enabling work

Not features. The roadmap stalls without them.

**Break up `src/App.jsx`.** It is ~1,985 lines and holds most of the app. Every
card added to it makes the next diff harder to review on a phone, which is the
whole workflow this project is built around. The rule already in `CLAUDE.md` —
extract a card when you touch it — is the right one. The Vibe Score work took
`BtcPriceCard` and `Skeleton` out in v1.5.0; the cycle row and the chart card
are the next obvious candidates.

**Data-source resilience.** Each source is a single point of failure. If
CoinPaprika has a bad morning, the price, volume, market cap and dominance cards
all go blank together. `Promise.allSettled` means the page survives, but the
cards do not. A documented fallback per source — Kraken REST already seeds
prices and could cover more — plus a test that asserts graceful degradation.

**Rate-limit and abuse posture.** Required before §4.2. §3.3 shipped the first
unauthenticated compute endpoint anyone can hammer, and its only defence is the
edge cache: `s-maxage=300` collapses a burst into one render per five minutes per
region, which is adequate for one endpoint and is not a rate-limiting story. A
second such endpoint, or any of §4.2, needs the real thing.

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
