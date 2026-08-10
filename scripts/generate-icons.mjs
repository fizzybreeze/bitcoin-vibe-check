// Rasterise the app icons from the mark.
//
// Run by hand, not in CI:  node scripts/generate-icons.mjs
// It commits binaries, which does not belong in a build step. The PNGs it
// writes are the artefacts; this file exists so "how were these made" has an
// answer other than "somebody's laptop".
//
// The artwork itself is `scripts/lib/mark.js` — a pixel grid, not a glyph. That
// split is deliberate: the drawing is pure and unit-tested, and this file is
// only the list of targets and the rasteriser. It also means the script no
// longer needs a font with U+20BF, so the probe that used to guard against
// committing a tofu box is gone with the dependency it was guarding.
//
// Why PNGs at all:
//
//   1. iOS ignores manifest icons entirely and wants a <link rel=
//      "apple-touch-icon"> pointing at a raster image. Without one, adding the
//      site to the home screen uses a screenshot of the page.
//   2. Chrome does not accept SVG for a *notification* icon, so the alerts
//      panel would have no icon it could name.
//   3. One rasterisation here means the tab, the home screen, the install
//      prompt and the notification all show the same mark — which they did not
//      before v1.7.7, and which no amount of per-consumer SVG would guarantee.

import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ICON_TARGETS, markSvg } from './lib/mark.js'

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH })

mkdirSync('public/icons', { recursive: true })
for (const { file, size, coverage, maskable } of ICON_TARGETS) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  // Transparent page background, and omitBackground on the shot, so the area
  // outside a rounded corner stays transparent. Without both, the page's
  // default white shows through as opaque white corners — which is what the
  // first run of this script actually produced, back when it was type.
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}</style>${markSvg({ size, coverage, maskable })}`,
  )
  writeFileSync(file, await page.screenshot({ omitBackground: true }))
  await page.close()
  console.log(`wrote ${file} (${size}x${size}${maskable ? ', maskable' : ''})`)
}

await browser.close()
