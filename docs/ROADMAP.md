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

**Nostr-native. The daily vibe reached a relay in v1.9.1**; the rest of this
item has not. What is left is the half that touches the *app* rather than a
cron: zaps alongside the Strike link, and optional NIP-07 so a visitor can be
recognised without an account. Both are real design work — NIP-07 in particular
has to survive §1's no-login filter, which it plausibly does (a signer extension
is not an account this site holds) but which needs the argument made rather than
assumed. The audience overlap with an opinionated no-login Bitcoin dashboard is
about as high as it gets.

**The typeface is chosen, and the choice is the platform UI face.** Shipped in
v1.8.5; see the version-history row. What is worth keeping here is the shape of
the remaining work, because the decision deliberately did not close it.

`--font-sans` and `--font-mono` are now `@theme` tokens mirroring
`src/lib/typography.js`, `tabular-nums` reaches every figure that changes
without a reload, and the two export surfaces that each declared their own
`-apple-system…` stack now read the shared one. **Adopting a display face is
therefore one token and its mirror**, not a hunt through fifteen components —
which was the actual point of the item.

**Two standing requirements come with that door, and they are why it stayed
shut.** Whatever face is chosen must carry real tabular figures, and it must be
supplied to *both* export surfaces in the same change: Satori takes font buffers
at request time inside a serverless function whose first constraint is that it
must never return nothing, and html2canvas needs the face loaded in the document
before it rasterises. Miss either and the preview card or the share image drifts
away from the site with nothing failing to say so.

**The title is no longer part of that question.** v1.11.0 draws the wordmark
from a ten-glyph pixel alphabet (`src/lib/wordmark.js`) rather than setting it,
so the header, the share canvas, the live preview card and the static fallback
all render the same picture with no font to resolve. That narrows the two
standing requirements below to *body* type: a display face would still have to
carry tabular figures and still have to reach both export surfaces, but it can
no longer take the product's name with it when it fails.

**`api/lib/ogView.js` remains the one surface whose *text* cannot follow** —
Satori's bundled Geist, which we do not supply, which has no weight axis and no ₿
(the reason `ogImage.test.js` pins the card's allowed character set). That
exception is recorded in `typography.js` and re-asserted by `typography.test.js`,
so it stays a decision rather than a surprise. Its title escaped by ceasing to be
text at all, which is not a route the rest of the card can take.

**What the tabular pass cannot be checked by, recorded so nobody re-learns it.**
`font-variant-numeric` only does anything if the resolved face has a `tnum`
table, and the CI container has none of SF, Segoe UI or Roboto. Measured there:
"111111" and "888888" render 6px apart *with the property set*. So the jitter is
real and that environment cannot show the fix — the eight visual baselines
passing this change proves nothing about how it renders on a phone, the same way
v1.7.12 found them blind to contrast.

**The layout pass is done, and two of its three complaints were resolved by
looking rather than by changing anything.** The icons shipped in v1.8.6, the
card label and the card shell in v1.8.7. The two questions left were held back
deliberately as design rather than consolidation, and both are now settled:

- **The `md:` versus `lg:` grid split is fine and stays.** The dashboard was
  looked at in a browser at 820px — the width where `md:` is on and `lg:` is
  off, so the first two rows are multi-column and the last two are stacked. That
  reads correctly. The complaint was that the inconsistency *looked* like drift;
  having actually been viewed, it is not worth a change that would repack the
  network row into ~253px columns, where the four-across fee grid would be the
  thing that broke.
- **The uneven `h-full` was a false alarm, and the measurement is the useful
  part.** The claim here was that "some rows have equal-height cards and others
  do not". Measured at 1100px, *every* card row is level regardless: Network
  Fees carries no `h-full` and renders at exactly the same 371px as the two
  cards beside it that do, and Supply Issued and the halving strip match at
  126px with neither carrying it. What does the work is CSS Grid's default
  `align-items: stretch`, which makes `h-full` a **no-op on a direct grid
  child** — it stays load-bearing one level down, where a card sits inside a
  wrapper div. The classes are therefore left alone rather than swept out, and
  `e2e/responsive.spec.js` now asserts the property the complaint actually
  cared about (rows look level) instead of the mechanism it guessed at.

**The item this section carried forward is closed. Shipped in v1.15.0; see the
version-history row.** What is worth keeping here is that its own instruction
was half wrong: it said to merge the two responsive-duplicate pairs "into one
component each", and only one of them is that shape. The supporters pair is one
card at two widths and became one card. The heartbeat pair is two cards at two
grid positions — a card of its own on mobile, a header merged into Recent Blocks
on desktop — so what was duplicated was the *interior*, and collapsing the two
cards into one component would have meant one component rendering two cards.
Read a "merge these" note as a claim about the duplication, not about the file
count.

**What the accessibility passes still do not cover**, so nobody reads them as
"accessible, done". Two of the four caveats that used to sit here are closed.
The contrast one went in v1.8.0: `palette.test.js` computes every text token
against `ground`, `surface` and `raised` in both themes, and `raised` is the one
that caught things. Focus indicators, keyboard operability of the three dialogs
and heading structure went in v1.8.4 — one blanket unlayered `:focus-visible`
rule, a shared `useDialogFocus`, and every card title promoted to `<h2>`.

**What is left is the item none of this can substitute for: an audit by an
actual screen reader.** Every assertion in the suite is a claim about markup —
that a role is present, that a label exists, that focus moved. None of them is a
claim about what someone actually *hears*, and the two come apart in ways a test
cannot see: whether "24h Volume" read aloud between fifteen other headings is
navigable or is noise, whether the Vibe Score breakdown reads as five figures or
as a stream of digits, whether an alert row announces its direction. That needs
VoiceOver or NVDA and a person, and it is the honest reason this item stays.

Two smaller things, both deliberate and both worth naming so they are not
mistaken for oversights. **`HalvingCountdown` has no heading** — it is a
three-panel strip with no title of its own on screen, and inventing one would
put a region in the outline that a sighted visitor cannot see;
`cardHeadings.test.js` carries it as a named exception with an assertion that
keeps the exception honest. And **the alerts panel does not trap Tab**, because
it is a popover over a still-usable page rather than a modal over a scrim —
trapping would claim otherwise. Neither is settled forever; both are recorded
decisions rather than gaps.

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
| Owning the newsletter form's markup | Settled on evidence rather than on effort, so it stops being re-proposed every time the embed looks off-brand. **Posting to beehiiv's form endpoint is not buildable**: the real request was captured from the live site, and `subscribe-forms.beehiiv.com/api/submit` sits behind a Rails `authenticity_token` minted for their iframe's own session, a PerimeterX token minted by their sensor script, Cloudflare bot management, and an `origin` check — every one of those from *their* origin, on third-party cookies our visitors' browsers increasingly refuse. Four walls, each fatal alone, and all of them deliberate anti-automation. **The v2 API is the only supported route and it is closed too**: an API key requires Stripe identity verification, which this project will not do. What shipped instead is v1.11.1's two forms, one per theme. Reopen only if beehiiv publishes a public form endpoint or drops the identity check. |

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
