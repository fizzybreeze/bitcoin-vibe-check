// Rasterise the *static* link-preview card — `public/og-image.png`.
//
// Run by hand, not in CI:  node scripts/generate-og-image.mjs
// Like the icons, it writes a binary, so it is committed beside its output and
// "how was this made" has an answer other than "somebody's laptop".
//
// **This is the fallback, not the preview.** `api/og.js` renders the real one
// per request with live numbers; this is what an unfurler gets when that fails,
// when the route is rate-limited, or when the request carried a query string.
// So it deliberately carries **no numbers at all** — the same rule
// `ogModelIsRenderable` applies at the other end: a card with blank slots where
// figures should be looks broken in a way a generic card never does.
//
// Three things it has to be, none of which the image it replaced still was:
//
//   1. **The same shape as the thing it stands in for.** The live card is
//      1200×630. This was 3750×1969 — the same aspect at 3.1× the scale and
//      167 KB, all of it precached, for a file no browser ever requests.
//   2. **The same palette.** It was still pre-Afterglow orange: an orange rule,
//      an orange ₿, an orange domain. The app was re-skinned in v1.8.0 and this
//      binary was not, so every unfurl that shed to the fallback advertised a
//      colour scheme the site no longer has — and nothing reported it, because
//      a fallback rendering *is* the old behaviour.
//   3. **Free of the ₿ character.** `ogImage.test.js` pins the live card's
//      allowed character set for exactly this reason, and drawing the mark as a
//      grid means this one cannot regress into it either.
//
// The layout mirrors `api/lib/ogView.js`'s header — same accent rule, same
// letterspaced wordmark, same tagline and domain — so the fallback reads as the
// live card's sibling rather than as a different product's placeholder.
//
// **The prose here is set in whatever sans this machine resolves, and that is
// baked into the committed PNG.** Unlike the icons, that is not a defect being
// left in: it is latin text, every machine has a face for it, and the output is
// a binary reviewed by looking at it rather than a template resolved on a
// visitor's device. It is worth knowing about only when §5's typeface decision
// lands — at which point this script wants the chosen face and a re-run, the
// same as `ogView.js` wants it supplied to Satori.

import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { PALETTE } from '../src/lib/palette.js'
import { MARK_COLS, MARK_ROWS, markRuns, markSvg } from './lib/mark.js'

const C = PALETTE.dark
const WIDTH = 1200
const HEIGHT = 630
const OUT = 'public/og-image.png'

// The same strings the live card uses, so the two cannot drift apart in wording
// while looking identical.
const TITLE = 'BITCOIN VIBE CHECK'
const TAGLINE = 'Read the room.'
const BLURB = "Bitcoin's mood, money, and mempool. Real-time."
const DOMAIN = 'bitcoinvibecheck.com'

/**
 * The mark again, oversized and in one flat tone, as the background watermark.
 *
 * Built from `markRuns` rather than `markSvg` because it wants neither the
 * fuchsia tile nor the rounded corner — just the letterform. It is filled with
 * `raised` rather than the accent at some opacity: a solid token is a colour
 * this palette actually has, and the whole point of the Afterglow pass was that
 * nothing outside the stylesheet invents one.
 */
function watermark(cell, x, y) {
  return markRuns()
    .map(run =>
      `<rect x="${x + run.x * cell}" y="${y + run.y * cell}" ` +
      `width="${run.width * cell}" height="${cell}" fill="${C.raised}"/>`)
    .join('')
}

// Sized and placed so the *whole* letterform is visible and clear of the footer
// rule. The first draft bled it off three edges at cell 46, which does not read
// as a watermark of the mark — it reads as a handful of stray rectangles, since
// what makes this shape legible is the ticks and the counters, and cropping
// took both. A watermark nobody recognises is just noise behind the text.
const WATERMARK_CELL = 33
const card = `
<style>
  html, body { margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; position: relative; overflow: hidden;
    background: ${C.ground};
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color: ${C.ink};
  }
  /* The live card opens with a 10px accent rule. Same here. */
  .rule { position: absolute; inset: 0 0 auto 0; height: 10px; background: ${C.accent}; }
  .wm { position: absolute; right: 56px; top: 50px; }
  .content { position: absolute; inset: 10px 0 0 0; padding: 52px 56px 44px;
             display: flex; flex-direction: column; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 28px; }
  .title { font-size: 44px; font-weight: 700; letter-spacing: 0.14em; line-height: 1.1; }
  .tagline { font-size: 60px; font-weight: 700; color: ${C.ink}; letter-spacing: -0.01em; }
  .blurb { font-size: 30px; color: ${C.muted}; margin-top: 18px; }
  .foot { display: flex; align-items: center; justify-content: space-between;
          border-top: 1px solid ${C.line}; padding-top: 22px; }
  .domain { font-size: 26px; color: ${C.accent}; }
  .quiet { font-size: 24px; color: ${C.quiet}; letter-spacing: 0.16em; }
</style>
<div class="rule"></div>
<svg class="wm" width="${MARK_COLS * WATERMARK_CELL}" height="${MARK_ROWS * WATERMARK_CELL}"
     shape-rendering="crispEdges">${watermark(WATERMARK_CELL, 0, 0)}</svg>
<div class="content">
  <div class="brand">
    ${markSvg({ size: 96, coverage: 0.625 })}
    <div class="title">${TITLE}</div>
  </div>
  <div>
    <div class="tagline">${TAGLINE}</div>
    <div class="blurb">${BLURB}</div>
  </div>
  <div class="foot">
    <div class="domain">${DOMAIN}</div>
    <div class="quiet">LIVE BITCOIN DASHBOARD</div>
  </div>
</div>`

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH })
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
await page.setContent(card)
writeFileSync(OUT, await page.screenshot())
await browser.close()
console.log(`wrote ${OUT} (${WIDTH}x${HEIGHT})`)
