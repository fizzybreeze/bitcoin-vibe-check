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

**The dashboard has no vibe.** It has two dozen excellent numbers. A visitor
who already knows what a Mayer Multiple is gets enormous value; everyone else
gets a wall. The name of the product promises a *read*, and the product currently
delivers *readings*. That gap is the single biggest product opportunity here.

**`metric_snapshots` is accruing data nothing reads.** The daily Actions job has
been upserting a full metrics row per UTC day since it moved off the home
Proxmox box, the table has public `SELECT`, and not one line of `src/` touches
it. Every day that passes makes the unbuilt history features more valuable and
costs nothing. This is the cheapest leverage in the repo.

**Sharing works; being shared does not.** `ShareCanvas` renders eight genuinely
good cards, and `html2canvas` is lazy-loaded so it costs nothing until used. But
when someone pastes `bitcoinvibecheck.com` into a group chat, the preview is
`/og-image.png` — a static file that says the same thing whether BTC is at 40k or
at an all-time high. The manual share path is polished and the automatic one,
which fires far more often, is inert.

---

## 3. Now — unlock what is already paid for

Everything in this horizon is small, uses infrastructure that already exists, and
needs no new architecture.

### 3.1 The Vibe Score

**What.** One composite 0–100 reading in the header, with the components visible
underneath it. Not a new data source — a synthesis of what is already fetched.

**Why.** The product is called Bitcoin Vibe Check. A single number is quotable,
screenshot-able, headline-able, and gives every other item on this roadmap
something to hang off: the newsletter gets a subject line, the daily post gets a
hook, the OG image gets a reason to change hourly, the history chart gets its
most interesting series. It also converts the dashboard from a reference tool
(for people who know the metrics) into a read (for people who don't) without
removing anything from the first group.

**How.** A pure function in `src/lib/calculations.js`, composed from data already
on screen:

| Dimension | Source already fetched | Rough contribution |
|---|---|---|
| Sentiment | Fear & Greed (alternative.me) | 25% |
| Valuation | Mayer Multiple + MVRV | 30% |
| Momentum | price vs 200-day MA | 20% |
| Network security | hash-rate 30-day trend | 15% |
| Congestion | mempool pressure + fee tiers | 10% |

Each dimension normalises to 0–100 and the weights sum to one. Pure function,
fully unit-testable, no network call, no new dependency.

**Non-negotiable: it is never a black box.** The card shows what is driving the
number — "72 · greed, extended vs the 200-day, network healthy" — the tooltip
publishes the formula, and this repo documents the weights. A composite index
that hides its arithmetic deserves the "made-up number" criticism it will get; one
that shows it invites people to argue with the weights, which is engagement, not
a problem. It is a summary of public metrics, not advice, and the copy must never
blur that.

**Success signal.** It becomes the thing people quote. Watch for it appearing in
screenshots that were not generated by the share button.

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

**Bonus, nearly free.** Serve MVRV from `metric_snapshots` when the BGeometrics
budget (15 requests/day) is exhausted. The snapshot job already stores
`mvrv_value` and `mvrv_date` daily. Yesterday's MVRV is a far better answer than
a blank card, and it removes the only hard rate limit in the stack from the
critical path.

### 3.3 A live link preview

**What.** Replace the static `/og-image.png` with a generated image: current
price, Vibe Score, Fear & Greed, timestamp.

**Why.** This is the highest growth-per-hour item on the list. Every paste of the
URL into a Signal group, a Slack channel, a Discord, or a post becomes a live
advertisement rendered by someone else's servers. It runs whether or not the
sharer thought about sharing, which is precisely why it beats the manual share
flow on volume.

**How.** A second Vercel serverless function alongside `api/chain-data.js`, using
Satori/`@vercel/og`, with the visual language already established in
`ShareCanvas`. Cache at the edge for a few minutes — link unfurlers hammer the
endpoint and the number does not need to be second-accurate to make the point.
Update the `og:image` and `twitter:image` tags in `index.html` to point at it.

**Watch out.** Some unfurlers cache aggressively and some ignore query strings;
a cache-busting path segment is usually needed, and the image must render
correctly at small sizes in a chat list, not just at 1200×630 in a preview tool.

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
extract a card when you touch it — is the right one; the Vibe Score work will
touch the header and the cycle row, so extract those.

**Data-source resilience.** Each source is a single point of failure. If
CoinPaprika has a bad morning, the price, volume, market cap and dominance cards
all go blank together. `Promise.allSettled` means the page survives, but the
cards do not. A documented fallback per source — Kraken REST already seeds
prices and could cover more — plus a test that asserts graceful degradation.

**Rate-limit and abuse posture.** Required before §4.2, and worth having before
§3.3, since a generated OG image is an unauthenticated compute endpoint that
anyone can hammer.

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
