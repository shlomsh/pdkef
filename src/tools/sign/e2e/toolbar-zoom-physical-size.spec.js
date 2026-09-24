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
 * A note on what "inside the viewport" can and cannot prove here, found
 * empirically while building this spec: `Emulation.setPageScaleFactor` zooms
 * around the layout viewport's top-left corner with **no pan component** -
 * unlike a real phone, which pans toward whatever was focused/pinched as
 * part of the same gesture. `window.scrollTo` does not touch
 * `visualViewport.offsetLeft` either (confirmed by trying it; it only moves
 * `window.scrollY`, a different axis, and this page has no horizontal
 * overflow to scroll at all). The result: under this specific CDP call,
 * *any* element positioned more than one shrunken-viewport-width from the
 * page's left edge reads as "outside the viewport" at 1.8x/2.5x - proven by
 * measuring the always-narrow, always-correctly-anchored compact bar on a
 * *right*-edge field, which fails the identical way a wide, wrongly-shifted
 * bar would. So a strict containment assertion at 1.8x/2.5x would not be
 * testing our fix; it would be testing whether CDP happened to pan (it
 * doesn't). Containment is therefore hard-asserted only at rest (1x, where
 * the whole 440px-wide layout viewport is visible and CDP's gap does not
 * apply) and reported, not asserted, above 1x - the lead's requested table
 * carries the raw yes/no for every case regardless.
 *
 * What *is* hard-asserted at every scale, and is the more direct proof of
 * the fix's actual mechanism: the corner of the bar that touches the element
 * (`transformOrigin` in DraggableWrapper.tsx/RedactBox.tsx) sits at the same
 * CSS position at 1x, 1.8x and 2.5x. That is what "shrinks in place around a
 * fixed anchor, rather than drifting" means physically, and it is exactly
 * the property a real device's pan-toward-the-anchor behaviour would rely on
 * to keep the bar reachable.
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

  for (const r of results) {
    expect(Number(r.vvScaleProperty), `${label}: --vv-scale reflects the CDP scale at ${r.scale}x`).toBeCloseTo(r.scale, 1);
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
