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

    // The raster hangs off `.crt-picture` rather than off the labelled box: it
    // has to move with the stroke when the slip fires, or the two are a near
    // plane holding still over a far one — the parallax reading v1.18.0 removed.
    const style = await spark.locator('.crt-picture').evaluate((el) => {
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
    const at = () => spark.locator('.crt-picture').evaluate(el => getComputedStyle(el, '::before').transform)

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

// The two sparklines' own faults, and the one claim that needed a fixture this
// suite has never had.
//
// **Until this spec, the Vibe Score sparkline had never rendered in an e2e run
// at all.** `mocks.js` answers every Supabase read with `[]` — correctly, and
// deliberately — so `useVibeHistory` returns nothing and the card draws no line.
// The consequence is the interesting part: the two sparklines have never once
// been on screen together in any automated run, which is exactly how they came
// to be byte-identical in treatment with nothing to say so.
//
// The rows are registered *after* `mockApis`, because Playwright matches routes
// in reverse registration order — the `priceChange24h.spec.js` trick. They are
// not added to `mocks.js`, which would put a sparkline into the `btc-price`
// visual baseline and force a regeneration for a change that moves no pixels in
// it.
test.describe('sparkline faults', () => {
  // Dated off the clock rather than hard-coded: `buildVibeHistory` refuses the
  // whole series when the newest row is more than two days old, so fixed dates
  // render an empty box the day after they are written — and an empty box is
  // not a failing assertion, it is a test that quietly stops testing.
  function snapshotRows(days = 10) {
    const day = 86_400_000
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(Date.now() - i * day)
      return {
        captured_on: d.toISOString().slice(0, 10),
        // All seven inputs `vibeInputsFromMetrics` reads. Anything less and
        // `replayRow` drops the row as incomparable, which renders as nothing
        // rather than as a failure. The fastest fee must be above zero.
        metrics: {
          fear_greed_value: 40 + ((i * 7) % 25),
          mayer_multiple: 1.1 + (i % 5) * 0.05,
          mvrv_value: 2.0 + (i % 4) * 0.1,
          price_change_30d_pct: 5 - (i % 9),
          hashrate_trend_30d: 3 + (i % 3),
          fee_fastest_sv: 8 + (i % 6),
          mempool_tx_count: 40_000 + i * 1_000,
        },
      }
    })
  }

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await mockApis(page)
    await page.route(/\/rest\/v1\/metric_snapshots/, route =>
      route.fulfill({ json: snapshotRows() }))
    await page.goto('/')
  })

  /** Both grained boxes, keyed by the fault class each one wears. */
  const boxes = page => ({
    'crt-fault-a': page.getByRole('img', { name: /Vibe Score/ }),
    'crt-fault-b': page.getByRole('img', { name: /Fear and Greed/ }),
  })

  async function bothAttached(page) {
    for (const box of Object.values(boxes(page))) {
      await expect(box).toBeAttached({ timeout: TIMEOUT })
    }
  }

  test('renders both sparklines, which is what makes the rest of this block mean anything', async ({ page }) => {
    // The guard on the fixture. Without it every assertion below could pass by
    // finding one box and comparing it with itself.
    await bothAttached(page)
    const [a, b] = await Promise.all(
      Object.entries(boxes(page)).map(([cls, box]) =>
        box.evaluate((el, c) => el.classList.contains(c), cls)),
    )
    expect(a && b, 'the two sparklines are not wearing distinct fault classes').toBe(true)
  })

  test('measures a real box through the slipping element', async ({ page }) => {
    // `.crt-picture` sits between the sized frame and `ResponsiveContainer`,
    // which needs a definite height to measure. Drop its `height: 100%` and
    // recharts collapses to zero — the sparkline is still in the DOM, still
    // labelled, and draws nothing.
    await bothAttached(page)
    for (const [cls, box] of Object.entries(boxes(page))) {
      const size = await box.locator('.recharts-surface').evaluate(el => {
        const r = el.getBoundingClientRect()
        return { w: r.width, h: r.height }
      })
      expect(size.w, `${cls} drew no width`).toBeGreaterThan(10)
      expect(size.h, `${cls} drew no height`).toBeGreaterThan(10)
    }
  })

  test('resolves a real band on each sparkline, rather than a layer that draws nothing', async ({ page }) => {
    // The `color-mix` failure the chart's layers already guard against: present,
    // correctly sized, animating, and completely invisible.
    await bothAttached(page)
    for (const [cls, box] of Object.entries(boxes(page))) {
      const s = await box.locator('.crt-picture').evaluate(el => {
        const c = getComputedStyle(el, '::after')
        return { image: c.backgroundImage, name: c.animationName, dur: c.animationDuration }
      })
      expect(s.image, `${cls} has no band gradient`).toContain('linear-gradient')
      expect(s.image, `${cls} band colour did not resolve`).not.toContain('color-mix')
      expect(s.image).toMatch(/rgba?\(/)
      expect(s.name).toBe('crt-spark-band-roll')
      // The cadence came through the custom property. There is no fallback, so
      // a missing fault class leaves this invalid and the animation unnamed.
      expect(parseFloat(s.dur), `${cls} band has no duration`).toBeGreaterThan(1)
    }
  })

  /**
   * Where each band is in its cycle, as the browser's own timeline reports it.
   *
   * Not `transform`, which is the obvious probe and cannot answer this: the band
   * is parked at the identity matrix for 60% of every cycle, so two independent
   * bands read as identical whenever both happen to be parked — better than a
   * third of the time, and `crt-fault-a`'s parked run is 7.8 continuous seconds,
   * so widening the sampling window does not fix it. `progress` is derived from
   * the timeline rather than from the painted value, so it separates two parked
   * animations that are at different points of being parked — and it is still a
   * claim about what is *happening*, not about what was declared, because it
   * only advances if the animation is actually running.
   */
  const bandPhases = page => page.evaluate(() => {
    const out = {}
    for (const anim of document.getAnimations()) {
      const effect = anim.effect
      if (!effect || effect.pseudoElement !== '::after') continue
      const el = effect.target
      if (!el || !el.classList.contains('crt-picture')) continue
      const cls = [...(el.closest('.crt-grain')?.classList ?? [])].find(c => c.startsWith('crt-fault-'))
      if (cls) out[cls] = effect.getComputedTiming().progress
    }
    return out
  })

  test('runs the two sparklines independently of each other', async ({ page }) => {
    // The requirement, in a browser. Three samples two seconds apart, and the
    // interval is a derivation rather than a guess: the phase difference between
    // a 13s and a 19s cycle drifts at |1/13 - 1/19| = 0.0243 per second, so
    // three samples 2s apart span 0.097 of a cycle — wider than twice the 0.02
    // threshold, so they cannot all sit inside it. Two bands genuinely in step
    // would report a difference of exactly 0 at all three.
    await bothAttached(page)
    const samples = []
    for (let i = 0; i < 3; i++) {
      if (i) await page.waitForTimeout(2000)
      samples.push(await bandPhases(page))
    }
    for (const s of samples) {
      expect(Object.keys(s).sort(), 'a band is not animating at all').toEqual(['crt-fault-a', 'crt-fault-b'])
    }

    // Both are actually running, not frozen at the same value.
    for (const cls of ['crt-fault-a', 'crt-fault-b']) {
      expect(samples[0][cls], `${cls} is not advancing`).not.toBeCloseTo(samples[2][cls], 3)
    }

    // Circular, because progress wraps: 0.99 and 0.01 are close, not far.
    const apart = ({ 'crt-fault-a': a, 'crt-fault-b': b }) => {
      const d = Math.abs(a - b)
      return Math.min(d, 1 - d)
    }
    const distances = samples.map(apart)
    expect(
      distances.some(d => d > 0.02),
      `the two bands never left each other's phase: ${distances.map(d => d.toFixed(3)).join(', ')}`,
    ).toBe(true)
  })

  test('displaces each band when its sweep is under way', async ({ page }) => {
    // The pixels behind the phase numbers above: a band can advance perfectly
    // and translate nothing. Driven by seeking the real animation rather than by
    // waiting on the clock, so this costs no wall time and cannot land in the
    // parked 60%.
    await bothAttached(page)
    const shifted = await page.evaluate(() => {
      const out = {}
      for (const anim of document.getAnimations()) {
        const effect = anim.effect
        if (!effect || effect.pseudoElement !== '::after') continue
        const el = effect.target
        if (!el || !el.classList.contains('crt-picture')) continue
        const cls = [...(el.closest('.crt-grain')?.classList ?? [])].find(c => c.startsWith('crt-fault-'))
        if (!cls) continue
        const { duration, delay } = effect.getTiming()
        anim.currentTime = delay + duration * 0.9
        const m = getComputedStyle(el, '::after').transform
        out[cls] = Number(m.match(/matrix\(.*,\s*(-?[\d.]+)\)$/)?.[1] ?? 0)
      }
      return out
    })
    expect(Object.keys(shifted).sort()).toEqual(['crt-fault-a', 'crt-fault-b'])
    for (const [cls, y] of Object.entries(shifted)) {
      expect(y, `${cls} declares a sweep it does not perform`).toBeGreaterThan(10)
    }
  })

  test('slips each picture on its own cadence', async ({ page }) => {
    await bothAttached(page)
    const seen = {}
    for (const [cls, box] of Object.entries(boxes(page))) {
      seen[cls] = await box.locator('.crt-picture').evaluate(el => {
        const c = getComputedStyle(el)
        return { name: c.animationName, dur: c.animationDuration }
      })
      expect(seen[cls].name, `${cls} is not slipping`).toBe('crt-slip')
    }
    expect(seen['crt-fault-a'].dur, 'both sparklines slip at one cadence')
      .not.toBe(seen['crt-fault-b'].dur)
  })
})
