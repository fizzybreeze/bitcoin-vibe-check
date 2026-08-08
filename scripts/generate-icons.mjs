// Rasterise the app icons.
//
// Run by hand, not in CI:  node scripts/generate-icons.mjs
// It needs a Chromium with a font that has U+20BF, and it commits binaries —
// neither belongs in a build step. The PNGs it writes are the artefacts; this
// file exists so "how were these made" has an answer other than "somebody's
// laptop".
//
// Why PNGs at all, when public/icons/ already has SVGs:
//
//   1. iOS ignores manifest icons entirely and wants an <link rel=
//      "apple-touch-icon"> pointing at a raster image. Without one, adding the
//      site to the home screen uses a screenshot of the page.
//   2. Chrome does not accept SVG for a *notification* icon, so the alerts
//      panel had no icon it could name (v1.7.5 removed a dead /favicon.ico
//      rather than repoint it at an SVG that would not render).
//   3. The SVG icons draw the ₿ as <text> with a system font stack, so the
//      glyph is resolved on the visitor's device. A device without U+20BF gets
//      a tofu box as the app icon — the same trap v1.6.0 hit with Satori.
//      Rasterising once, here, ends that dependency for every consumer.
//
// public/favicon.svg is deliberately untouched: it is path-based already, so
// the browser tab never depended on a font.

import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const BACKGROUND = '#0a0a0f'
const ORANGE = '#f97316'
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI Symbol', system-ui, sans-serif"

/**
 * @param {number} size
 * @param {boolean} maskable Android masks these to its own shape (circle,
 *   squircle, …) and only guarantees the central 80% survives. A maskable icon
 *   therefore gets a full-bleed background — no rounded corners of its own,
 *   which would be visibly clipped — and a glyph small enough to sit inside
 *   that safe zone.
 */
function iconSvg(size, maskable = false, glyph, baseline) {
  const radius = maskable ? 0 : Math.round(size * 0.1667)
  const fontSize = Math.round(size * (glyph ?? (maskable ? 0.46 : 0.625)))
  const baselineY = Math.round(size * (baseline ?? (maskable ? 0.66 : 0.719)))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BACKGROUND}"/>
  <text x="${size / 2}" y="${baselineY}" font-family="${FONT}" font-size="${fontSize}"
        font-weight="700" text-anchor="middle" fill="${ORANGE}">₿</text>
</svg>`
}

const TARGETS = [
  { file: 'public/icons/icon-192.png', size: 192 },
  { file: 'public/icons/icon-512.png', size: 512 },
  { file: 'public/icons/icon-512-maskable.png', size: 512, maskable: true },
  // 180 is what current iOS asks for; it downscales cleanly for older sizes.
  // Full-bleed like the maskable one, because iOS applies its own squircle
  // mask and does not honour transparency — rounded corners of our own would
  // be either double-masked or filled in with black.
  { file: 'public/apple-touch-icon.png', size: 180, maskable: true, glyph: 0.58, baseline: 0.72 },
]

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH })

// Refuse to write a tofu box. Rendering the icon on a machine with no ₿ would
// bake a permanent missing-glyph square into a committed binary, which is far
// worse than the font dependency this script exists to remove.
const probe = await browser.newPage()
await probe.setContent('<span id="a">₿</span><span id="b">￿</span>')
const glyphWidths = await probe.evaluate(() => {
  const c = document.createElement('canvas').getContext('2d')
  c.font = '120px sans-serif'
  return { btc: c.measureText('₿').width, missing: c.measureText('￿').width }
})
if (glyphWidths.btc === glyphWidths.missing) {
  await browser.close()
  throw new Error(
    `No glyph for U+20BF on this machine (₿ and the missing-glyph box measure the same width, ` +
    `${glyphWidths.btc}px). Rasterising here would commit a tofu box as the app icon.`
  )
}

mkdirSync('public/icons', { recursive: true })
for (const { file, size, maskable, glyph, baseline } of TARGETS) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  // Transparent page background, and omitBackground so the area outside a
  // rounded corner stays transparent. Without both, the page's default white
  // shows through as opaque white corners — which is what the first run of
  // this script actually produced.
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}</style>${iconSvg(size, maskable, glyph, baseline)}`
  )
  writeFileSync(file, await page.screenshot({ omitBackground: true }))
  await page.close()
  console.log(`wrote ${file} (${size}x${size}${maskable ? ', maskable' : ''})`)
}

await browser.close()
