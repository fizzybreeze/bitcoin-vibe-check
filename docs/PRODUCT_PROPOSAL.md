# Bitcoin Vibe Check — Productisation Proposal

*Drafted 2026-08-05. Companion to [`DEV_WORKFLOW_AUDIT.md`](./DEV_WORKFLOW_AUDIT.md), which covers the engineering workflow; this document covers the product.*

---

## 1. Executive summary

Bitcoin Vibe Check is a glanceable, shareable, privacy-first **sentiment layer for Bitcoin** — not a pro dashboard, not a trading tool. The one-line positioning to build everything around:

> **"The Bitcoin dashboard you screenshot."**

The productisation play, in order:

1. **Instrument** the growth surfaces that already exist but are currently unmeasured.
2. **Activate** the dormant data asset — `metric_snapshots` has been quietly recording 27 metrics a day and nothing reads it.
3. **Grow an owned audience** through the newsletter and the branded share cards.
4. **Monetise the audience** (sponsorship, tasteful affiliates) — **never the users**. A privacy-first, no-login product structurally cannot charge users without destroying what makes it distinctive, so it shouldn't try.

Three hard calls made up front:

- **Newsletter sponsorship is the primary revenue path.** Premium tiers and a paid API are rejected (§5).
- **Nothing ships before the measurement foundation.** Every funnel is currently flying blind (§4).
- **"No login" is permanent.** It is the moat, not a gap to be filled.

Realistic 18-month target: **$300–800/month blended revenue, 3–5k newsletter subscribers, under 5 hours/week of maintainer time.** This is a lifestyle product with side-project economics, and the proposal treats that as the goal rather than a consolation prize (§10).

---

## 2. Positioning and differentiation

BVC answers one question in under ten seconds: *what's the vibe?* Price direction, cycle position, network health, and crowd sentiment, curated and framed emotionally ("Read the room", sats-per-fiat, fear/greed) rather than exhaustively.

| Competitor | Their game | Our counter-position |
|---|---|---|
| **mempool.space** | On-chain infrastructure for node operators and power users | Complement, not rival — we consume their API. We will never out-depth them and shouldn't try |
| **Clark Moody dashboard** | Maximal information density | Curation over density; mobile-first; shareable. Clark Moody is a terminal, BVC is a glance |
| **TradingView** | Trader tooling, accounts, paywalls | Deliberately anti-trading. No drawing tools, no order books, ever |
| **Exchange apps** | Transactional, KYC'd, conflicted | No login, no custody, no ads for leverage. The privacy posture is the marketing |

Differentiators to lean on: sats-first framing, cycle indicators explained in plain language, one-tap branded share cards, installable PWA glanceability, and a stated privacy posture ("No login, no account required" is already in the README — start saying it louder).

---

## 3. Target segments

In priority order:

1. **The daily-check HODLer.** Opens the site (or installed PWA) once or twice a day for the vibe. Drives retention and newsletter conversion. Everything on the dashboard already serves this person; Phase 3's push alerts serve them when the tab is closed.
2. **Bitcoin Twitter / Nostr sharers and content creators.** The acquisition engine. The share cards are built for them — branded PNG, watermarked `bitcoinvibecheck.com`, `navigator.share` on mobile. They need more card variety and a measurable loop.
3. **Newcomers.** The halving countdown, sats-per-fiat, and plain-language cycle indicators are orange-pill material. They arrive via segment 2's shares.

Explicitly **not** served: day traders, altcoin users, institutions. They demand features (multi-asset support, alert infrastructure at scale, SLAs, APIs) that would destroy both the positioning and the solo-maintainer budget.

---

## 4. Phase 0: the measurement foundation (non-negotiable)

Every growth surface in the product today is unmeasured. The only telemetry is Vercel Analytics pageviews — zero event tracking. Donate click-outs, share-card generations, newsletter modal impressions and signups, alert creations: all invisible. **No roadmap feature ships until this is fixed**, because without it every later decision is a guess.

Contents:

- **Privacy-respecting event tracking.** Vercel Analytics custom events are the zero-new-vendor option; self-hosted-style Plausible/Umami is the alternative if cookie-free branding matters more. Either way: no cookies, no fingerprinting, no consent banner needed — tracking must stay on-brand.
- **Canonical event taxonomy** (Appendix B): share generation and completion by card type, newsletter modal impression → signup, donate click-out, name submission, alert created/triggered, sound toggled.
- **Close the viral loop:** add `?ref=share` (plus card type) to the watermark URL rendered on share-card PNGs, so shared images become attributable acquisition.
- **Pull the Beehiiv subscriber baseline** and record it — growth targets need a starting number.

**North-star metric: weekly returning visitors.** Input metrics: shares/week and newsletter subscribers. Everything in the roadmap should move one of these three numbers or get cut.

---

## 5. Monetisation options, ranked honestly

| Rank | Option | Verdict | Rationale |
|---|---|---|---|
| 1 | **Newsletter sponsorship** | ✅ Primary | Beehiiv infrastructure already exists. Monetises an owned audience without touching the site's privacy posture. Bitcoin newsletter sponsorship is a functioning market and viable from roughly 2–5k engaged subscribers |
| 2 | **Donations, automated** | ✅ Secondary | On-brand and half-built. Today's flow is manual: click out to Strike, self-report a name, maintainer eyeballs payments against submissions. Replace with Strike API webhooks / LNURL-pay so attribution and approval are automatic. Low ceiling (~$50–150/mo) but pure upside and zero reputational risk |
| 3 | **Affiliate — self-custody hardware only** | ✅ Tertiary, gated | Hardware wallets (Coldcard, Trezor, Jade) fit the audience and the ethos. **Hard rule: no exchange or leverage-product affiliates** — reputational and regulatory poison for a "read the room, don't trade" brand |
| 4 | **Merch** | 🟡 Passive only | A print-on-demand link if a share card ever becomes a meme. Zero maintainer hours allocated |
| 5 | **Premium tier** | ❌ Reject | Requires accounts and a payments SDK; directly contradicts the product's most-marketed feature. The only future-acceptable form is an account-less Lightning "supporter unlock" for cosmetics (§6, Phase 4) — and only once an audience exists. Revisit no earlier than 12 months in |
| 6 | **Paid API / data product** | ❌ Reject | The dashboard data is other people's data repackaged (upstream ToS risk). The snapshot history only starts August 2026, and the repo is public — zero moat. `metric_snapshots` is a **product-feature asset**, not a sellable API |

The structural conclusion: **revenue comes from the audience side (sponsors, affiliates), never the user side.** That is what a privacy-first, no-login product permits, and it is enough for the goals in §10.

---

## 6. Roadmap

Four phases, roughly one quarter each, every one building on an asset that already exists. One theme per quarter is also the burnout guard (§8).

### Phase 1 — "Instrument & Tighten" (Q3 2026, ~6 weeks)

*Theme: measure everything, automate the leaky funnels.*

- Event analytics + share-ref tracking per §4.
- **Strike webhook → auto-approve donors.** Kills the manual reconciliation step; donation amounts become known; the supporter ticker updates without maintainer involvement.
- Newsletter CTA rendered onto the share-card PNG (the card is already the best-performing ad slot the product owns).
- Opportunistic `App.jsx` decomposition *only where these features touch it* — no big-bang refactor; engineering time is the scarcest resource.

**Exit criteria:** four weeks of clean funnel data; donation flow fully automated; baseline numbers recorded.

### Phase 2 — "Own the History" (Q4 2026)

*Theme: activate `metric_snapshots` — turn the write-only table into the differentiator.*

- **Vibe Timeline** view: the daily series (price, Mayer Multiple, MVRV, fees, hashrate, Fear & Greed…) charted over time, read directly via the existing anon `SELECT` policy. First and only consumer the table has ever had.
- **"Today's Vibe"** — a composite daily score with its own share card. Opinionated, plain-language, screenshot-ready.
- **Automated daily post to @BitcoinVibeCheck**: a GitHub Actions job renders the daily recap card and posts it. Zero-marginal-cost distribution that works while the maintainer sleeps.
- Snapshot-driven **"this week's vibe delta"** section in Satoshi's Weekly Brief — makes the newsletter differentiated rather than commodity Bitcoin news.

*Why this is the moat:* the repo is MIT and public — anyone can clone the code. Nobody can clone the **continuity of the dataset** or the daily brand voice built on top of it. The moat compounds daily at $0/month.

### Phase 3 — "Distribution & Alerts" (Q1 2027)

*Theme: reach people when the tab is closed, without identifying them.*

- **Anonymous Web Push alerts.** Upgrade the existing localStorage alerts (which only fire while the tab is open) to real push: a serverless endpoint + Supabase table storing push subscriptions only — endpoints, no identities, no accounts. Price thresholds and optionally the daily vibe.
- **Embeddable widget / dynamic OG images** — live cards other sites and posts can embed. First genuine reason to add routes; backlinks and brand distribution for free.
- **Nostr mirror** of the daily bot — native audience fit, trivial marginal cost.
- **First sponsorship outreach** once the newsletter crosses ~1k subscribers.

### Phase 4 — "Sustainable Revenue" (Q2 2027)

*Theme: turn the audience into recurring income; experiment cautiously.*

- Recurring **newsletter sponsor slot**, sold off a media-kit page with real numbers from Phase 1 instrumentation (public, on-brand).
- One labelled, tasteful **hardware-wallet affiliate** placement.
- Optional experiment: **account-less Lightning "supporter unlock"** — pay a Lightning invoice, get cosmetic extras (themes, extra share-card styles) tied to a local token, no account. This is the only acceptable test of user-side revenue, and it is a *test*, with a decision gate on whether it earns a permanent place.

---

## 7. Success metrics per phase

| Phase | Exit criteria |
|---|---|
| 1 | All five funnels instrumented; donation reconciliation time → 0; baselines recorded (published in the repo — public metrics are on-brand and keep the maintainer honest) |
| 2 | Shares/week +50% vs. baseline; newsletter ≥ 1,000 subs; ≥ 20% of sessions touch the Vibe Timeline; daily bot streak unbroken |
| 3 | ≥ 500 anonymous push subscribers; ≥ 30 referring domains via embeds/OG images; weekly returning visitors ≥ 2× Phase 1 baseline |
| 4 | First paid sponsorship closed; ≥ $300/mo blended revenue for 3 consecutive months; hosting + API costs fully covered |

---

## 8. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **API dependency** — free tiers (CoinPaprika, BGeometrics at 15 req/day), and geo-blocking has already bitten twice (Binance HTTP 451, issues #9 and #10) | High | Extend the serverless proxy-and-cache pattern from `api/chain-data.js` to all providers over time; a fallback provider per metric; `metric_snapshots` as last-known-good; the "US-served first" vendor rule stays written down in `CLAUDE.md` |
| **Regulatory** — anything smelling of financial advice or trading | High | "Vibes, not signals" copy rule: descriptive, historical, never predictive or prescriptive. No trading features, no custody, no exchange affiliates. Sponsorships clearly labelled |
| **Solo-maintainer burnout** | High | One theme per quarter, hard WIP limit. Every feature gets a kill criterion at inception. Automation-first bias (the daily bot posts while the maintainer sleeps). A defined **hibernation mode**: the site runs untouched at ~$0/month, which the architecture already supports |
| **Bear-market attention cycles** | Medium | Newsletter and push are the counter-cyclical retention assets — they reach people who stopped checking. Near-zero fixed costs make riding out a trough trivial, and the snapshot dataset *gains* value through a bear market |
| **Platform dependency** — Beehiiv, Supabase, Vercel free tiers | Medium | Export the Beehiiv subscriber list monthly (the list is the asset). Snapshot rows are tiny; monitor Supabase limits. Nothing is architecturally coupled to Vercel beyond the two serverless routes |
| **Public repo, "no moat"** | Accepted | The moat was never the code. It is the brand, the audience, the dataset continuity, and the daily voice — none of which ship in `git clone` |

---

## 9. What we will NOT build

- **Accounts / login** — the absence is the product's most-marketed feature and the privacy moat.
- **Multi-coin support** — positioning suicide; "Bitcoin" is in the name.
- **Native mobile apps** — the PWA is already installable; app-store review is hostile to crypto apps, and it doubles maintenance for a solo developer.
- **Trading or portfolio features** — regulatory exposure, and territory owned by better-funded competitors.
- **Paid API / data product** — no defensible data, upstream ToS landmines (§5).
- **Own node / indexing infrastructure** — mempool.space exists; consume, don't rebuild.

---

## 10. What success realistically looks like

This is a solo-run, MIT-licensed product with hobby-scale costs, and the plan is honest about that:

- **The 18-month picture:** $300–800/month blended (sponsor slot + automated donations + one affiliate), 10k+ monthly actives in bull conditions, 3–5k newsletter subscribers, under 5 hours/week, and a product the maintainer still enjoys touching.
- **Doors deliberately left open, but not planned for:** sponsorship rates stepping up in a bull run; acquisition interest from a Bitcoin media brand (the audience and the dataset are the assets); the newsletter outgrowing the site.
- **The failure criterion, stated up front:** if shares and subscribers are flat after Phase 2 — the phase that bets the product's one unique asset — stop building growth features and settle into hibernation mode. A finished, free, self-running dashboard that costs nothing and helps people read the room is also a perfectly good outcome for open-source software.

---

## Appendix A — Current-state asset inventory

| Asset | Where | State |
|---|---|---|
| Share cards | `src/components/ShareButton.jsx`, `ShareModal.jsx`, `ShareCanvas.jsx`, `shareCards.js`, `src/hooks/useShareImage.js` | 8 card types, html2canvas → PNG, `navigator.share` on mobile, `bitcoinvibecheck.com` watermark. Unmeasured; watermark URL carries no ref parameter |
| Newsletter | `NewsletterCard` / `NewsletterModal` in `src/App.jsx`, `src/components/BeehiivEmbed.jsx` | Beehiiv embed, sidebar + 5s first-visit modal (localStorage-suppressed). Subscriber count unknown to the repo |
| Donations | `DonationCard` in `src/App.jsx`, Supabase `donors` table | Manual two-step: Strike click-out + self-reported name, `approved: false`, human reconciliation. No amounts captured |
| Supporter display | `SupporterTickerCard`, `MobileSupportersCard` in `src/App.jsx` | Approved donors polled every 5 min |
| Price alerts | `src/components/PriceAlertsButton.jsx`, `PriceAlertsPanel.jsx`, `src/hooks/usePriceAlerts.js` | localStorage + Notification API; fires only while the tab is open |
| Daily metrics | `scripts/snapshot.js`, `.github/workflows/snapshot.yml`, Supabase `metric_snapshots` (see `scripts/SNAPSHOT_SETUP.md`) | 27 metrics/day since Aug 2026, anon-SELECTable, **read by nothing** |
| Analytics | `@vercel/analytics` in `src/App.jsx` | Pageviews only; zero custom events |
| Social handle | `@BitcoinVibeCheck` (`index.html` twitter:site meta) | Configured; no posting activity driven by the product |

## Appendix B — Canonical event taxonomy (Phase 1)

One namespace, snake_case, no free-text values:

```
share_opened          { }
share_generated       { cards: "price,sentiment,…", count }
share_completed       { method: "web_share" | "download" }
newsletter_impression { surface: "modal" | "sidebar" }
newsletter_subscribed { surface }
donate_clicked        { }
donor_name_submitted  { }
alert_created         { currency }
alert_triggered       { direction: "above" | "below" }
sound_toggled         { enabled }
```

Rules: no payloads that could identify a user; no values derived from user input; events reviewed against this table in PR review like any other behaviour change (they are behaviour changes, so per the repo's definition of done they need tests).

## Appendix C — Competitor snapshot (long form)

| | BVC | mempool.space | Clark Moody | TradingView | Exchange apps |
|---|---|---|---|---|---|
| Audience | Daily-check HODLers, sharers, newcomers | Node operators, on-chain analysts | Data-dense power users | Traders | Customers |
| Login required | Never | No | No | For most features | Yes + KYC |
| Mobile experience | PWA, mobile-first | Good | Poor (density) | App | App |
| Shareability | Branded PNG cards, one tap | Screenshots | Screenshots | Paywalled features | N/A |
| Sentiment framing | Core product | None | None | Indicator soup | Conflicted |
| Historical vibe data | `metric_snapshots` (unique going forward) | On-chain only | Live only | Deep but generic | N/A |
| Business model | Audience-side (this proposal) | Sponsors/enterprise | Donations | Subscriptions | Trading fees |
