import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pwaOptions } from '../../vite.config.js'

// The strategy switch is the whole of this change, and reverting it is silent:
// with `generateSW`, workbox writes the worker from the config block, the build
// succeeds, the PWA still installs and caches exactly the same things — and
// `src/sw.js` is never bundled, so the `push` and `notificationclick` listeners
// simply stop existing. Nothing else in the suite would notice, because no test
// environment can run a service worker.
//
// So these assertions are about the wiring rather than the behaviour. The
// decisions the listeners make are pure and live in `pushMessage.test.js`.

const ROOT = resolve(import.meta.dirname, '../..')
const swPath = join(ROOT, pwaOptions.srcDir, pwaOptions.filename)

describe('PWA service worker', () => {
  it('builds the worker from a source file rather than from config', () => {
    expect(pwaOptions.strategies).toBe('injectManifest')
    expect(existsSync(swPath)).toBe(true)
  })

  it('has no leftover generateSW config, which injectManifest would ignore', () => {
    // A `workbox` block is not rejected under injectManifest — it is simply
    // never read. Leaving the runtime caching rules there would have looked
    // configured and cached nothing at all.
    expect(pwaOptions.workbox).toBeUndefined()
  })

  it('precaches the same asset types generateSW did', () => {
    // The switch is meant to change how the worker is produced, not what ends
    // up in it. Narrowing this list would ship a PWA that installs and then
    // fails offline on whatever was dropped.
    expect(pwaOptions.injectManifest.globPatterns).toEqual([
      '**/*.{js,css,html,ico,png,svg,woff2}',
    ])
  })

  it('registers the push listeners the switch exists for', () => {
    // Read as text on purpose: this file imports service-worker globals and a
    // `__WB_MANIFEST` placeholder, so it cannot be imported here — and the
    // failure being guarded against is a refactor that quietly drops a
    // listener, which builds clean and shows nothing until a real push arrives.
    const source = readFileSync(swPath, 'utf8')
    expect(source).toMatch(/addEventListener\(\s*'push'/)
    expect(source).toMatch(/addEventListener\(\s*'notificationclick'/)
  })

  it('takes over immediately, as registerType autoUpdate promises', () => {
    // Under generateSW these two were implied by `registerType: 'autoUpdate'`.
    // Under injectManifest the plugin only generates the page-side half; the
    // worker's half is in this file, and without it a new build would wait for
    // every tab to close — which on a dashboard people leave open is never.
    const source = readFileSync(swPath, 'utf8')
    expect(pwaOptions.registerType).toBe('autoUpdate')
    expect(source).toMatch(/self\.skipWaiting\(\)/)
    expect(source).toMatch(/clientsClaim\(\)/)
  })
})
