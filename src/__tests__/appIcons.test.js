import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Icons are the one asset class this project has got wrong twice, both times
// silently: `/favicon.ico` was named by the notification path for as long as
// alerts existed and never existed at all, and the manifest pointed only at
// SVGs, which iOS ignores outright. Neither shows up as an error — a missing
// icon renders as the browser's own default, and a missing apple-touch-icon
// renders as a screenshot of the page. Nothing else in the suite looks at a
// file that no code imports.

const ROOT = resolve(import.meta.dirname, '../..')
const PUBLIC = join(ROOT, 'public')

const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.json'), 'utf8'))
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8')

/** PNG magic number, so "exists" cannot be satisfied by an empty or wrong file. */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function isPng(path) {
  // Indexed rather than compared via Buffer: `src/**` lints with the browser
  // globals, and `Buffer` is not one of them.
  const bytes = readFileSync(path)
  return PNG_MAGIC.every((byte, i) => bytes[i] === byte)
}

describe('web app manifest icons', () => {
  it('names only files that are actually there', () => {
    expect(manifest.icons.length).toBeGreaterThan(0)
    for (const icon of manifest.icons) {
      const path = join(PUBLIC, icon.src)
      expect(existsSync(path), `${icon.src} is missing`).toBe(true)
    }
  })

  it('offers a raster icon at 192 and 512, not only vectors', () => {
    // Chrome wants >=192 for the install prompt, and SVG support across
    // launchers is patchy enough that a PNG is the thing to guarantee.
    for (const size of ['192x192', '512x512']) {
      const match = manifest.icons.find(i => i.sizes === size && i.type === 'image/png')
      expect(match, `no PNG at ${size}`).toBeDefined()
      expect(isPng(join(PUBLIC, match.src))).toBe(true)
    }
  })

  it('has a maskable icon, and does not double up purposes on one file', () => {
    // A maskable icon needs its artwork inside the central 80% safe zone,
    // because Android crops to its own shape. The old manifest declared one
    // file as "any maskable" — the same full-bleed rounded square for both —
    // which gets visibly clipped when used as a mask.
    const maskable = manifest.icons.filter(i => i.purpose?.split(/\s+/).includes('maskable'))
    expect(maskable).toHaveLength(1)
    expect(maskable[0].purpose).toBe('maskable')
  })
})

describe('apple touch icon', () => {
  it('is declared in index.html', () => {
    // iOS ignores the manifest's icons entirely. Without this link, adding to
    // the home screen uses a screenshot of the page rather than the icon.
    expect(indexHtml).toMatch(/<link[^>]+rel="apple-touch-icon"/)
  })

  it('points at a real PNG', () => {
    const href = indexHtml.match(/<link[^>]+rel="apple-touch-icon"[^>]*href="([^"]+)"/)?.[1]
    expect(href).toBeTruthy()
    const path = join(PUBLIC, href)
    expect(existsSync(path), `${href} is missing`).toBe(true)
    expect(isPng(path)).toBe(true)
  })
})

describe('favicon', () => {
  it('is declared in index.html and is a real PNG', () => {
    // Was `favicon.svg` until the Afterglow redesign — a lightning bolt
    // inherited from the Vite starter, in a purple belonging to no part of
    // this product. It is now the same rasterised ₿ as every other icon, so a
    // stale reference here means the tab falls back to the browser's default
    // globe while the home screen still shows the mark.
    const href = indexHtml.match(/<link[^>]+rel="icon"[^>]*href="([^"]+)"/)?.[1]
    expect(href).toBe('/favicon.png')
    const path = join(PUBLIC, href)
    expect(existsSync(path), `${href} is missing`).toBe(true)
    expect(isPng(path)).toBe(true)
  })

  it('no longer ships the file it replaced', () => {
    // Left behind, it would still be precached and still be served to anything
    // that guesses the conventional path.
    expect(existsSync(join(PUBLIC, 'favicon.svg'))).toBe(false)
  })
})

describe('precaching', () => {
  it('ships every icon through the build', async () => {
    // Everything under public/ is copied to dist/ and matched by the PWA
    // globPatterns, which include png — so an icon added here is precached
    // without anyone remembering to say so. This asserts the pattern still
    // covers the extension the icons actually use.
    const { pwaOptions } = await import('../../vite.config.js')
    const patterns = pwaOptions.injectManifest.globPatterns.join(' ')
    expect(patterns).toMatch(/png/)
  })
})
