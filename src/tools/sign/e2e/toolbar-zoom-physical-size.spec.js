import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * MOBI-17: on an iPhone zoomed page (auto-zoom on focusing a small-font
 * field, or a deliberate pinch), the per-element floating toolbar used to be
 * magnified along with the page *and* forced to wrap into more rows, because
 * Floating UI's `size()`/`shift()` measure against `visualViewport` by
 * default - the zoomed, shrunken size, not the page's own unchanging layout
 * width. `DraggableWrapper.tsx` and `RedactBox.tsx` now counter-scale the bar
 * against a shared `--vv-scale` custom property (`useVisualViewportScale.ts`)
 * and measure the wrap cap against the page wrapper's static rect
 * (`rootBoundary: 'document'`) instead.
 *
 * This proves it in a real engine, which jsdom cannot: rendered rects, and
 * `getComputedStyle().transform` after Floating UI and our own CSS both ran.
 * Real `Emulation.setPageScaleFactor` is a true visual-viewport zoom (the
 * layout viewport, and therefore the page wrapper's own CSS width, is
 * unchanged) - the same mechanism MOBI-17's own research prototype used
 * (scratchpad `toolbar-zoom.spec.js`, whose `measure()` this borrows).
 *
 * Two bars, both real `.actions` instances of the same fix: the compact
 * Previous/Next/Aa bar a phone shows the moment a field is tapped (MOBI-16),
 * and the full `ElementToolbar` (Bold/Underline/Color/Duplicate/Delete/...)
 * reached by tapping "Aa" - the one whose wrapping is what MOBI-17.md's own
 * measured table is about. Two fixtures (income-tax-101, real-world
 * RTL/Hebrew "form 101"; health-declaration, LTR/English, MOBI-16's own
 * fixture), each with a field near the left edge and one near the right, so
 * a horizontally-asymmetric regression in the boundary math would show up on
 * at least one of the eight combinations.
 *
 * A note on what "inside the viewport" can and cannot prove with
 * `Emulation.setPageScaleFactor`, found empirically while building this
 * spec: it zooms around the layout viewport's top-left corner with **no pan
 * component** - unlike a real phone, which pans toward whatever was
 * focused/pinched as part of the same gesture. `window.scrollTo` does not
 * touch `visualViewport.offsetLeft` either (confirmed by trying it; it only
 * moves `window.scrollY`, a different axis, and this page has no horizontal
 * overflow to scroll at all). So under that specific CDP call, *any* element
 * positioned more than one shrunken-viewport-width from the page's left or
 * top edge reads as "outside the viewport" at 1.8x/2.5x, whether or not the
 * fix actually holds - a strict containment assertion there would test
 * whether CDP happened to pan (it doesn't), not the fix. Past that point
 * `visualViewportClamp` correctly prizes keeping the *bar* on screen over
 * its anchor relationship to a *reference element* a real, panning pinch
 * would never have let scroll out of view in the first place - so
 * `assertHoldsUnderZoom` below hard-asserts containment only at rest (1x),
 * and otherwise proves the ticket's *other* half - physical size and row
 * count holding constant, and the anchor corner (`transformOrigin` in
 * DraggableWrapper.tsx/RedactBox.tsx) sitting at the same CSS position -
 * only at a scale where the reference element is still inside this no-pan
 * method's shrunk `visualViewport` (`elementInsideViewport` in `measure()`).
 * "Shrinks in place around a fixed anchor, rather than drifting" is the
 * property a real pan-toward-the-anchor gesture depends on, and this is
 * where the no-pan method can still prove it.
 *
 * Containment itself - the actual acceptance criterion this ticket adds
 * (`visualViewportClamp.ts`) - needs a gesture that *does* pan. CDP's
 * `Input.synthesizePinchGesture` (Chromium only, hence this project only)
 * zooms around a given point exactly the way a real two-finger pinch does,
 * which pans the visible region toward it as a side effect - confirmed
 * empirically: pinching near a field close to a page edge leaves that field
 * visible but off-center, and (pre-fix) can leave the wide, edge-anchored
 * full toolbar entirely outside `visualViewport` even though its own anchor
 * corner never moved. The `pinchToward` suite below is that hard assertion,
 * for the compact and full bar, LTR and RTL, both edges.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');

const DOCUMENTS = [
  {
    name: 'income tax form 101 (RTL/Hebrew)',
    file: path.join(root, 'src', 'editor', 'adapters', 'pdf', 'corpus', 'scoring', 'forms', 'income-tax-101-2024.pdf'),
    direction: 'rtl',
  },
  {
    name: 'health declaration (LTR/English)',
    file: path.join(root, 'src', 'editor', 'adapters', 'pdf', '__fixtures__', 'health-declaration-page1-geometry.pdf'),
    direction: 'ltr',
  },
];

const SCALES = [1, 1.8, 2.5];
// A hair of slack for subpixel rounding across the three scales, not for a
// real regression: the acceptance is "holds the same physical size and row
// count", not "identical to the femtopixel".
const TOLERANCE_PX = 2;

test.use({ hasTouch: true, isMobile: true, viewport: { width: 440, height: 956 } });

async function openWithFixture(page, file) {
  await page.goto('/sign');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({
    name: 'form.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(file),
  });
  await expect(page.locator('[class*="page-overlay"]').first()).toBeVisible();
  const textTool = page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Text', exact: true });
  if ((await textTool.getAttribute('aria-pressed')) !== 'true') await textTool.click();
  await expect(page.locator('[class*="field-hint-cell"]').first()).toBeVisible();
}

/** The detected field hint whose box sits furthest left, or furthest right, on screen. */
async function edgeCellHint(page, edge) {
  const hints = page.locator('[class*="field-hint-cell"]');
  const count = await hints.count();
  let best = null;
  for (let i = 0; i < count; i += 1) {
    const box = await hints.nth(i).boundingBox();
    if (!box) continue;
    const x = edge === 'left' ? box.x : box.x + box.width;
    if (!best || (edge === 'left' ? x < best.x : x > best.x)) best = { hint: hints.nth(i), box };
  }
  return best;
}

function activeActions(page) {
  return page.locator('[data-editor-element][data-editor-active] [data-editor-actions]');
}

/**
 * Taps the given edge's field, opening an edit session directly (confirmed
 * against the running preview: a `.click()` on a `hasTouch` context lands on
 * the touch path here, not the mouse one - MOBI-21's one-tap-to-edit), which
 * on a coarse pointer is MOBI-16's collapsed Previous/Next/Aa bar.
 */
async function placeField(page, edge) {
  const { hint, box } = await edgeCellHint(page, edge);
  await hint.click({ position: { x: box.width / 2, y: box.height / 2 }, force: true });
  await expect(activeActions(page)).toBeVisible();
  await expect(activeActions(page).getByRole('button', { name: 'Next field' })).toBeVisible();
}

/** Tapping "Aa" expands the compact bar to the full `ElementToolbar` - Bold, Duplicate, Delete, ... */
async function expandToFullToolbar(page) {
  await activeActions(page).getByRole('button', { name: 'Formatting options' }).click();
  await expect(activeActions(page).getByRole('button', { name: 'Delete element' })).toBeVisible();
}

/** Row count: group the bar's buttons/dividers by their rounded `offsetTop`. */
async function measure(page, scale, direction) {
  const barHandle = await activeActions(page).elementHandle();
  const elHandle = await page.locator('[data-editor-element][data-editor-active]').elementHandle();
  return page.evaluate(([bar, el, s, dir]) => {
    const rect = bar.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const tops = new Set();
    bar.querySelectorAll('button, [class*="divider"]').forEach((child) => {
      tops.add(Math.round(child.getBoundingClientRect().top));
    });
    const vv = window.visualViewport;
    const viewport = vv
      ? { left: vv.offsetLeft, top: vv.offsetTop, right: vv.offsetLeft + vv.width, bottom: vv.offsetTop + vv.height }
      : null;
    const insideViewport = !viewport || (
      rect.left >= viewport.left - 1 && rect.top >= viewport.top - 1
      && rect.right <= viewport.right + 1 && rect.bottom <= viewport.bottom + 1
    );
    // MOBI-17: `Emulation.setPageScaleFactor` zooms with no pan (see the file
    // header), so a big enough scale shrinks `visualViewport` around the
    // layout viewport's *top-left corner* without ever moving to keep the
    // field in view - unlike a real pinch, which pans toward whatever was
    // focused. Past that point the reference element itself is no longer
    // inside `visualViewport`, and `visualViewportClamp` correctly pulls the
    // bar back to what *is* on screen - which necessarily breaks its
    // constant-gap/stable-anchor relationship to an element that a real
    // device would never have let scroll out of view in the first place.
    // `assertHoldsUnderZoom` only asserts those two invariants while this is
    // true, the same carve-out `insideViewport` above already needed.
    const elementInsideViewport = !viewport || (
      elRect.top >= viewport.top - 1 && elRect.left >= viewport.left - 1
      && elRect.bottom <= viewport.bottom + 1 && elRect.right <= viewport.right + 1
    );
    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      physicalWidth: rect.width * s,
      physicalHeight: rect.height * s,
      rows: tops.size,
      // The corner that touches the element: right edge for RTL (`top-end`),
      // left edge for LTR (`top-start`) - the horizontal position `shift()`
      // and `size()` place it at, which is zoom-invariant (neither reads
      // `--vv-scale`). Not the bottom edge too: that one is *supposed* to
      // move slightly, by design - see `physicalGapPx` below.
      anchorX: dir === 'rtl' ? rect.right : rect.left,
      // The element-to-bar gap, in physical (on-screen) terms: `offset()` is
      // 0 in Floating UI now, and the real gap is a CSS translate divided by
      // `--vv-scale`, so its *layout*-space size shrinks with zoom on
      // purpose (elRect.top - rect.bottom, a layout quantity, gets smaller)
      // so that this physical figure - what a person actually sees between
      // the element and the bar - stays constant instead.
      physicalGapPx: (elRect.top - rect.bottom) * s,
      insideViewport,
      elementInsideViewport,
      vvScaleProperty: getComputedStyle(document.documentElement).getPropertyValue('--vv-scale').trim(),
    };
  }, [barHandle, elHandle, scale, direction]);
}

/** Sweeps the three CDP scales, measuring the bar currently showing, and resets to 1x after. */
async function sweepScales(page, context, direction) {
  const cdp = await context.newCDPSession(page);
  const results = [];
  for (const scale of SCALES) {
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale });
    // Our own useVisualViewportScale listener is what has to catch this -
    // give the native visualViewport 'resize' event a moment to fire and the
    // CSSOM write to land before reading it back.
    await page.waitForTimeout(150);
    results.push({ scale, ...(await measure(page, scale, direction)) });
  }
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await page.waitForTimeout(150);
  return results;
}

/** Asserts the invariants this ticket actually promises, against a table `sweepScales` returned. */
function assertHoldsUnderZoom(results, { label, expectWrap }) {
  const baseline = results[0];
  if (expectWrap) {
    expect(baseline.rows, `${label}: non-vacuity, this bar really does wrap at rest`).toBeGreaterThan(1);
  }
  expect(baseline.vvScaleProperty, `${label}: the shared hook published a scale at all`).not.toBe('');
  // Rest (1x) is unaffected by the CDP pan gap explained in the file header,
  // so containment is a real, meaningful claim here - and it holds already,
  // proving no baseline regression.
  expect(baseline.insideViewport, `${label}: on screen at rest`).toBe(true);
  expect(baseline.elementInsideViewport, `${label}: element on screen at rest`).toBe(true);
  // A real form field sits well down the page, not pinned to its very top
  // edge, so a no-pan zoom's shrinking `visualViewport` clips *it* out too
  // (see `elementInsideViewport`'s comment above) at scales well below where
  // this suite's own physical-size claim gets interesting - measured: 1.8x
  // already does it on both fixtures here. So the loop below is frequently
  // vacuous past baseline for a realistic field, and that is the honest
  // shape of what this no-pan method can still prove, not a bug to paper
  // over with a non-vacuity requirement this method cannot actually meet.
  // The property this vacuity leaves unproven - the bar staying reachable
  // under a zoom that behaves like a real device (i.e. pans) - is exactly
  // what the `pinchToward` suite below proves instead, with a real pan.
  if (!results.slice(1).some((r) => r.elementInsideViewport)) {
    // eslint-disable-next-line no-console
    console.log(`${label}: every non-baseline scale already clips the reference element under this no-pan method; only the 1x baseline above is verified here.`);
  }

  for (const r of results) {
    expect(Number(r.vvScaleProperty), `${label}: --vv-scale reflects the CDP scale at ${r.scale}x`).toBeCloseTo(r.scale, 1);
    // Physical size/row-count/anchor/gap are only meaningful while the
    // reference element itself is still inside this no-pan CDP zoom's
    // shrunk `visualViewport` - see `elementInsideViewport`'s own comment in
    // `measure()`. Past that point `visualViewportClamp` correctly prizes
    // containment (the bar) over an anchor relationship to an element a
    // real, panning pinch would never have let scroll out of view.
    if (!r.elementInsideViewport) continue;
    expect(r.physicalWidth, `${label}: physical width holds at ${r.scale}x`)
      .toBeGreaterThan(baseline.physicalWidth - TOLERANCE_PX);
    expect(r.physicalWidth, `${label}: physical width holds at ${r.scale}x`)
      .toBeLessThan(baseline.physicalWidth + TOLERANCE_PX);
    expect(r.physicalHeight, `${label}: physical height holds at ${r.scale}x`)
      .toBeGreaterThan(baseline.physicalHeight - TOLERANCE_PX);
    expect(r.physicalHeight, `${label}: physical height holds at ${r.scale}x`)
      .toBeLessThan(baseline.physicalHeight + TOLERANCE_PX);
    expect(r.rows, `${label}: row count holds at ${r.scale}x`).toBe(baseline.rows);
    // The anchor corner's *horizontal* position is a CSS (layout-space)
    // value `shift()`/`size()` compute without ever reading `--vv-scale`, so
    // it must be exactly stable, not just close - any drift here is the
    // fix's own transform composition being wrong, not a measurement
    // artefact.
    expect(r.anchorX, `${label}: anchor corner x is stable at ${r.scale}x`)
      .toBeCloseTo(baseline.anchorX, 0);
    // The physical (on-screen) gap between the element and the bar, not the
    // bar's own vertical layout position - see `physicalGapPx`'s own comment
    // in `measure()` for why the latter is *supposed* to move.
    expect(r.physicalGapPx, `${label}: physical element-to-bar gap holds at ${r.scale}x`)
      .toBeGreaterThan(baseline.physicalGapPx - TOLERANCE_PX);
    expect(r.physicalGapPx, `${label}: physical element-to-bar gap holds at ${r.scale}x`)
      .toBeLessThan(baseline.physicalGapPx + TOLERANCE_PX);
  }
}

for (const doc of DOCUMENTS) {
  for (const edge of ['left', 'right']) {
    test(`${doc.name}, field near the ${edge} edge: the toolbar holds its physical size and row count under zoom`, async ({ page, context }) => {
      test.setTimeout(90_000);
      await openWithFixture(page, doc.file);
      await placeField(page, edge);

      const compact = await sweepScales(page, context, doc.direction);
      assertHoldsUnderZoom(compact, { label: 'compact bar', expectWrap: false });

      await expandToFullToolbar(page);
      const expanded = await sweepScales(page, context, doc.direction);
      assertHoldsUnderZoom(expanded, { label: 'full toolbar', expectWrap: true });

      // eslint-disable-next-line no-console
      console.log(`\nMOBI-17 measured table - ${doc.name}, ${edge} edge`);
      // eslint-disable-next-line no-console
      console.table([...compact.map((r) => ({ bar: 'compact', ...r })), ...expanded.map((r) => ({ bar: 'full', ...r }))]
        .map((r) => ({
          bar: r.bar,
          scale: r.scale,
          'physical w': r.physicalWidth.toFixed(1),
          'physical h': r.physicalHeight.toFixed(1),
          rows: r.rows,
          'inside viewport': r.insideViewport ? 'y' : 'n (CDP has no pan - see file header)',
        })));
    });
  }
}

// MOBI-17: the real containment acceptance, using a gesture that actually
// pans (see the file header). `2.5` matches the lead's request ("end up
// zoomed ~2.5x with the field visible").
const PINCH_SCALE = 2.5;

/**
 * A point near the given edge of `box`, biased toward that edge rather than
 * centered on it - the empirical way to make `Input.synthesizePinchGesture`
 * pan the visible region so the field ends up near that edge of the screen
 * instead of centered, matching the lead's repro ("panned so the box is
 * visible near the left of the screen"). Centering the pinch on the field
 * instead (tried first) pans the visible region to center the field too,
 * which never reproduces the bug even pre-fix.
 */
function pinchCenterFor(box, edge) {
  const bias = Math.min(15, box.width / 4);
  return {
    x: edge === 'left' ? box.x + bias : box.x + box.width - bias,
    y: box.y + box.height / 2,
  };
}

/** Zooms *and pans* around `point`, the way a real two-finger pinch does. Chromium-only CDP. */
async function pinchZoomToward(page, context, point, scaleFactor) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.synthesizePinchGesture', {
    x: point.x,
    y: point.y,
    scaleFactor,
    relativeSpeed: 1000,
    gestureSourceType: 'touch',
  });
  // Same reasoning as sweepScales' own wait: give useVisualViewportScale's
  // listener a moment to catch the native visualViewport 'resize' event.
  await page.waitForTimeout(300);
}

/**
 * MOBI-17 (flake fix): `measure()`'s `insideViewport`, polled rather than
 * read once. Floating UI's `autoUpdate` repositions the bar off a
 * `ResizeObserver` on the floating element itself, so growing it from the
 * compact bar to the full `ElementToolbar` (more buttons, more rows) can take
 * more than one observer/rAF tick to fully converge - `toBeAttached()` on the
 * new buttons only proves they exist in the DOM, not that `visualViewportClamp`
 * has finished clamping their container into view. Confirmed by capturing the
 * measured rect at the moment of a failing assertion and again 500ms later
 * (repeat-each=20, `-g` narrowed to this suite): every failure had `anchorX`
 * and `physicalGapPx` still visibly moving toward, and `insideViewport` always
 * `true` by, the 500ms mark - a still-settling position, not a wrong one.
 * Bounded well past that measured settle time, not a blind long sleep.
 */
async function assertEventuallyInsideViewport(page, scale, direction, label) {
  await expect
    .poll(async () => (await measure(page, scale, direction)).insideViewport, {
      message: label,
      timeout: 2000,
    })
    .toBe(true);
}

for (const doc of DOCUMENTS) {
  for (const edge of ['left', 'right']) {
    test(`${doc.name}, field near the ${edge} edge: the toolbar stays inside the visual viewport after a real pinch-zoom-and-pan`, async ({ page, context }) => {
      test.setTimeout(90_000);
      await openWithFixture(page, doc.file);
      await placeField(page, edge);

      // Re-measured after placeField's own click, which scrolls the field
      // into view - the field's pre-scroll box is stale by the time a pinch
      // needs to target it on screen.
      const fieldBox = await page.locator('[data-editor-element][data-editor-active]').boundingBox();
      const point = pinchCenterFor(fieldBox, edge);
      await pinchZoomToward(page, context, point, PINCH_SCALE);

      await assertEventuallyInsideViewport(
        page, PINCH_SCALE, doc.direction,
        `compact bar: inside visualViewport after a ${PINCH_SCALE}x pinch+pan toward the ${edge} edge`,
      );

      // force: true - the whole point of this test is a page whose visual
      // rendering is zoomed/panned; Playwright's own actionability checks
      // (visible-in-viewport, receives-events) are about an ordinary,
      // unzoomed page and would otherwise refuse a click on exactly the
      // element this test needs to reach. The click still dispatches at the
      // element's real (layout-space, zoom-invariant) center.
      await activeActions(page).getByRole('button', { name: 'Formatting options' }).click({ force: true });
      await expect(activeActions(page).getByRole('button', { name: 'Delete element' })).toBeAttached();

      await assertEventuallyInsideViewport(
        page, PINCH_SCALE, doc.direction,
        `full toolbar: inside visualViewport after a ${PINCH_SCALE}x pinch+pan toward the ${edge} edge`,
      );
    });
  }
}
