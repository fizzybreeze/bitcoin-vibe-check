// The CRT treatment on the price chart, in a real browser.
//
// `crt.test.js` parses the stylesheet and proves the rules say the right things.
// It cannot tell you any of them reached the page: whether the class was emitted,
// whether `color-mix` resolved to a colour rather than being dropped as
// unparseable, or — the one that matters — whether an overlay covering the whole
// plot area still lets the reader hover it. That last is a feature the effect
// could take away silently, since the chart itself would carry on drawing
// perfectly and every other assertion in the suite would stay green.
import { test, expect } from '@playwright/test'
import { mockApis } from './mocks.js'

const TIMEOUT = 15_000

/** The computed style of one of the overlay's two layers, both pseudo-elements. */
function layerStyle(page, pseudo, prop) {
  return page.evaluate(
    ([ps, p]) => getComputedStyle(document.querySelector('[data-testid="chart-crt"]'), ps)
      .getPropertyValue(p),
    [pseudo, prop],
  )
}
const scanlineStyle = (page, prop) => layerStyle(page, '::before', prop)
const bandStyle = (page, prop) => layerStyle(page, '::after', prop)

test.describe('CRT chart treatment', () => {
  test.beforeEach(async ({ page }) => {
    // The scanlines are motion, so the control state for the rest of this file
    // is a visitor who has not asked for less of it. The reduced-motion half is
    // covered generically in accessibility.spec.js — but only since that sweep
    // learned to read pseudo-elements. It called `getComputedStyle(el)` with no
    // second argument, and both chart animations live on a `::before` and an
    // `::after`, so the claim made here was false when it was written: the
    // overlay element reports `0s` and the sweep saw nothing.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await mockApis(page)
    await page.goto('/')
    await expect(page.getByTestId('chart-crt')).toBeAttached({ timeout: TIMEOUT })
  })

  test('paints a real gradient rather than dropping an unparseable colour', async ({ page }) => {
    // `color-mix` is the one piece of modern syntax here. A browser that cannot
    // parse it drops the whole declaration, which leaves the element present,
    // correctly sized, animating — and completely invisible. Nothing in the DOM
    // says so; only the resolved value does.
    const image = await scanlineStyle(page, 'background-image')
    expect(image).toContain('repeating-linear-gradient')
    expect(image, 'the scanline colour did not resolve').not.toContain('color-mix')
    // A resolved mix arrives as an rgb/rgba triple. `transparent` alone would
    // mean the mix collapsed to nothing and the gradient draws no line at all.
    expect(image).toMatch(/rgba?\(/)
  })

  test('rolls the scanlines on the compositor', async ({ page }) => {
    expect(await scanlineStyle(page, 'animation-name')).toBe('crt-scanline-roll')
    // Belt and braces on the performance claim: `crt.test.js` proves the
    // keyframes move only `transform`, and this proves those keyframes are the
    // ones in force rather than a stale build's.
    expect(await scanlineStyle(page, 'animation-iteration-count')).toBe('infinite')
  })

  test('rolls a band that resolves to a real gradient', async ({ page }) => {
    // Same failure as the scanlines: an unparseable `color-mix` leaves an
    // element that is present, correctly sized and animating, with nothing in
    // it. The band is the more likely of the two to go unnoticed, because it is
    // off screen for most of every cycle anyway.
    const image = await bandStyle(page, 'background-image')
    expect(image).toContain('linear-gradient')
    expect(image, 'the band colour did not resolve').not.toContain('color-mix')
    expect(image).toMatch(/rgba?\(/)
    expect(await bandStyle(page, 'animation-name')).toBe('crt-band-roll')
  })

  test('runs the band and the wobble at different cadences', async ({ page }) => {
    // Two faults on one screen arriving together every cycle read as one
    // mechanism. This is the claim the browser can make that the stylesheet
    // cannot: that both animations are actually in force with those durations.
    const band = await bandStyle(page, 'animation-duration')
    const wobble = await page.locator('.crt-wobble')
      .evaluate(el => getComputedStyle(el).animationDuration)
    expect(band).not.toBe(wobble)
    for (const d of [band, wobble]) expect(parseFloat(d)).toBeGreaterThan(1)
  })

  test('wobbles the chart and its axes together', async ({ page }) => {
    // Not the series alone: a line displaced against its own gridlines is a
    // decorative effect changing where a reading appears to sit.
    const wobbling = page.locator('.crt-wobble')
    await expect(wobbling).toHaveCount(1)
    await expect(wobbling.locator('.recharts-cartesian-axis')).not.toHaveCount(0)
    expect(await wobbling.evaluate(el => getComputedStyle(el).animationName)).toBe('crt-wobble')
  })

  test('still lets the reader hover the chart for a tooltip', async ({ page, hasTouch }) => {
    // The regression the whole overlay risks. It sits over the entire plot area,
    // so without `pointer-events: none` the tooltip is unreachable — and the
    // chart still renders, so every other check in this suite stays green.
    //
    // Desktop only, and the reason is a property of the chart rather than of the
    // overlay: on the mobile project recharts produces no tooltip for a
    // synthetic mouse move *or* for a tap, measured with the overlay removed
    // from the DOM entirely. Its handlers are mouse-driven and the iPhone 13
    // descriptor emulates touch, so there is nothing there for a decorative
    // layer to block. Running this at both viewports would have failed for a
    // reason that has nothing to do with what it is asserting.
    test.skip(hasTouch, 'recharts shows no tooltip under touch emulation, overlay or not')

    const bar = page.locator('.recharts-bar-rectangle').first()
    await expect(bar).toBeVisible({ timeout: TIMEOUT })

    const box = await page.locator('.recharts-surface').first().boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

    await expect(page.locator('.recharts-tooltip-wrapper')).toBeVisible({ timeout: TIMEOUT })
    // The tooltip's own content, not just its container: recharts leaves the
    // wrapper in the DOM between hovers, so an empty one would satisfy a laxer
    // assertion while telling the reader nothing.
    await expect(page.locator('.recharts-tooltip-wrapper').getByText(/^\$[\d,]+/))
      .toBeVisible({ timeout: TIMEOUT })
  })

  test('holds the picture still while it is being read', async ({ page }) => {
    // Hovering to read a tooltip and having the thing you are reading jitter is
    // the one moment the wobble is actively unhelpful.
    const wobbling = page.locator('.crt-wobble')
    await wobbling.hover()
    expect(await wobbling.evaluate(el => getComputedStyle(el).animationPlayState)).toBe('paused')
  })

  test('grains the sparklines, and drifts the grain', async ({ page }) => {
    // The Fear & Greed sparkline is the one that renders under the mocks — the
    // Vibe Score's needs seven snapshot rows and the fixture returns none, so it
    // is deliberately not asserted here rather than asserted vacuously.
    const spark = page.getByRole('img', { name: /Fear and Greed/ })
    await expect(spark).toBeAttached({ timeout: TIMEOUT })

    const style = await spark.evaluate((el) => {
      const s = getComputedStyle(el, '::before')
      return { image: s.backgroundImage, animation: s.animationName }
    })
    // Same unparseable-`color-mix` failure as the chart layers: present, sized,
    // and drawing nothing.
    expect(style.image).toContain('repeating-linear-gradient')
    expect(style.image, 'the grain colour did not resolve').not.toContain('color-mix')
    expect(style.image).toMatch(/rgba?\(/)
    expect(style.animation).toBe('crt-scanline-roll')
    // Where this layer sits is deliberately *not* asserted from the computed
    // style any more. `z-index` there is what was declared rather than what was
    // painted, which is the trap the circuit tile's mask fell into one version
    // ago — and the placement is now provable in pixels instead, below.
  })

  test('actually moves the grain, rather than declaring an animation that does not', async ({ page }) => {
    // The claim no stylesheet parse can make. A layer can carry the right
    // keyframes and still never move — a zero-length travel, a paused parent, a
    // `transform` the compositor refuses — and the picture looks identical in
    // every screenshot either way.
    const spark = page.getByRole('img', { name: /Fear and Greed/ })
    await expect(spark).toBeAttached({ timeout: TIMEOUT })
    const at = () => spark.evaluate(el => getComputedStyle(el, '::before').transform)

    const before = await at()
    // Long enough to clear a fifth of the 6s period, so this cannot pass on
    // sub-pixel noise and cannot fail on a slow runner missing one frame.
    await page.waitForTimeout(1500)
    expect(await at(), 'the grain declares a drift it is not performing').not.toBe(before)
  })

  test('paints the grain over the chart inside the box, not under it', async ({ page }) => {
    // **The claim this file recorded as untestable, which inverting the layer
    // made testable.** While the raster was behind the series the obvious probe
    // — `elementFromPoint` at the box's centre — resolved inside the box either
    // way, so the placement was pinned structurally and never in paint. It no
    // longer has to be: a layer *in front* of opaque content shows up in the
    // pixels, where a `z-index` read out of a computed style is only ever what
    // somebody declared.
    //
    // The probe paints recharts' own wrapper — the real element at the real
    // depth, rather than an injected div that might sit at a different one — a
    // flat colour, and then asks whether anything modulates it. Behind the
    // series the wrapper hides the raster completely and every row of the box is
    // one value; in front, one row in three is lifted toward `ink`.
    const spark = page.getByRole('img', { name: /Fear and Greed/ })
    await expect(spark).toBeAttached({ timeout: TIMEOUT })
    await expect(spark.locator('.recharts-wrapper')).toBeAttached({ timeout: TIMEOUT })

    await spark.evaluate((el) => {
      el.querySelector('.recharts-wrapper').style.background = 'rgb(128, 128, 128)'
    })

    // `animations: 'disabled'` rewinds the drift to its first frame rather than
    // removing it, so the raster is still painted — it is only here so the rows
    // sampled are the same ones on every run.
    const shot = (await spark.screenshot({ animations: 'disabled' })).toString('base64')
    const rows = await page.evaluate(async (b64) => {
      const img = await new Promise((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = reject
        i.src = `data:image/png;base64,${b64}`
      })
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      // One mean per pixel row. A raster modulates whole rows, so this collapses
      // the horizontal axis without losing the only signal being looked for.
      return Array.from({ length: canvas.height }, (_, y) => {
        let sum = 0
        for (let x = 0; x < canvas.width; x++) sum += data[(y * canvas.width + x) * 4 + 1]
        return sum / canvas.width
      })
    }, shot)

    expect(rows.length, 'the sparkline screenshot has no rows').toBeGreaterThan(10)
    // Measured against both mutations rather than guessed at: the probe is 128
    // and a scanned row composites to ~143 in the dark theme, so the spread is
    // **13.4 with the layer in front and 1.3 behind it** — the residue being the
    // antialiased edge of the box. The bar sits between the two with room on
    // both sides, so this fails on the placement rather than on a rounding step.
    const spread = Math.max(...rows) - Math.min(...rows)
    expect(spread, `the grain is not painting over the chart (rows are flat at ${rows[0]})`)
      .toBeGreaterThan(6)
  })

  test('paints the circuit ground behind the page, without moving it', async ({ page }) => {
    // Three ways this layer fails while looking perfectly healthy in the DOM:
    // the `color-mix` drops and it draws nothing, the mask fails to load and it
    // floods the whole page with flat ink, or somebody animates it — which is
    // the one decision `circuitry.js` calls load-bearing.
    const frame = page.locator('.circuit-ground')
    await expect(frame).toHaveCount(1)

    // **Both of the first two assertions were vacuous in their first draft and a
    // mutation walked through each**, which is the lesson worth keeping about
    // computed style: it reports what was *declared*, not what happened.
    // Corrupting the tile's SVG left `maskImage` reporting the same data URI —
    // a resource that fails to decode is still the value in force — and
    // corrupting the `color-mix` dropped the declaration, so `backgroundColor`
    // came back `rgba(0, 0, 0, 0)`, which satisfied a "looks like a colour"
    // regex perfectly while painting nothing at all. So the tile is *decoded*
    // and the colour is checked for a non-zero alpha.
    const style = await frame.evaluate(async (el) => {
      const s = getComputedStyle(el, '::before')
      const url = s.maskImage.match(/url\("?(data:[^")]+)"?\)/)?.[1]
      const tile = url && await new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => resolve(null)
        img.src = url
      })
      return {
        tile,
        bg: s.backgroundColor,
        animation: s.animationName,
        zIndex: s.zIndex,
      }
    })
    expect(style.tile, 'the circuit tile is not a data URI that decodes').not.toBeNull()
    // The resource's own dimensions, so a tile that loads but is the wrong
    // drawing cannot pass — and `crt.spec.js` need not restate the number.
    expect(style.tile.w).toBe(style.tile.h)
    expect(style.tile.w).toBeGreaterThan(64)

    // An unparseable `color-mix` is dropped, and a dropped `background-color`
    // computes to transparent black — present, masked, and invisible.
    const alpha = Number(style.bg.match(/[\d.]+\s*\)$/)?.[0].replace(')', '') ?? 1)
    expect(alpha, `the trace colour did not resolve: ${style.bg}`).toBeGreaterThan(0)
    expect(style.bg, 'the trace colour did not resolve').not.toContain('color-mix')

    expect(style.animation).toBe('none')
    expect(style.zIndex).toBe('-1')
  })

  test('adds nothing that overflows the chart box', async ({ page }) => {
    // The overlay is `inset: 0` on a wrapper it does not control the size of,
    // and the layer inside it is deliberately taller than its frame. A missing
    // `overflow: hidden` puts scanlines across the card below.
    const overflow = await page.getByTestId('chart-crt').evaluate((el) => {
      const frame = el.getBoundingClientRect()
      const host = el.parentElement.getBoundingClientRect()
      return {
        taller: frame.height - host.height,
        clipped: getComputedStyle(el).overflow,
      }
    })
    expect(overflow.clipped).toBe('hidden')
    expect(Math.abs(overflow.taller)).toBeLessThanOrEqual(1)
  })
})
