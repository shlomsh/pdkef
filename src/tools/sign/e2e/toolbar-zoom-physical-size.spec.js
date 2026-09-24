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
 * against a shared `--vv-scale` custom property
 * (`useVisualViewportScale.ts`) and measure the wrap cap against the page
 * wrapper's static rect (`rootBoundary: 'document'`) instead.
 *
 * This proves it in a real engine, which jsdom cannot: rendered rects, and
 * `getComputedStyle().transform` after Floating UI and our own CSS both ran.
 * Real Emulation.setPageScaleFactor is a true visual-viewport zoom (the
 * layout viewport, and therefore the page wrapper's own CSS width, is
 * unchanged) - the same mechanism MOBI-17's own research prototype used
 * (scratchpad `toolbar-zoom.spec.js`, whose `measure()` this borrows).
 *
 * Reaching the *full* per-element toolbar (a dozen controls, the one that
 * actually wraps) rather than MOBI-16's collapsed Previous/Next/Aa bar means
 * *selecting* the element without opening an edit session - a plain
 * `.click()`, not a touch tap. `useDraggableElement`'s one-tap-to-edit path
 * (MOBI-21) only fires from a real touch gesture; a mouse-style `.click()`
 * on a `hasTouch` context selects without editing, which is also exactly
 * what the prototype measured its baseline numbers against.
 *
 * Two fixtures: the income-tax-101 form (real-world RTL/Hebrew, the "form
 * 101" the ticket measures against) and the health-declaration fixture
 * (LTR/English, MOBI-16's own fixture) - each with a field near the left
 * edge and one near the right edge of the page, so a horizontally-asymmetric
 * regression in the boundary math would show up on at least one of the four.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');

const DOCUMENTS = [
  {
    name: 'income tax form 101 (RTL/Hebrew)',
    file: path.join(root, 'src', 'editor', 'adapters', 'pdf', 'corpus', 'scoring', 'forms', 'income-tax-101-2024.pdf'),
  },
  {
    name: 'health declaration (LTR/English)',
    file: path.join(root, 'src', 'editor', 'adapters', 'pdf', '__fixtures__', 'health-declaration-page1-geometry.pdf'),
  },
];

const SCALES = [1, 1.8, 2.5];
// A hair of slack for subpixel rounding across the three scales, not for a
// real regression: the acceptance is "holds the same physical size and row
// count", not "identical to the femtopixel".
const PHYSICAL_SIZE_TOLERANCE_PX = 2;
// Slack for the visible-viewport containment check, covering the bar's own
// `box-shadow`/border subpixel rounding rather than a real overflow.
const VIEWPORT_CONTAINMENT_SLACK_PX = 1;

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
    if (!best || (edge === 'left' ? x < best.x : x > best.x)) best = { hint: hints.nth(i), box, x };
  }
  return best;
}

function activeElement(page) {
  return page.locator('[data-editor-element][data-editor-active]');
}

function activeActions(page) {
  return page.locator('[data-editor-element][data-editor-active] [data-editor-actions]');
}

/**
 * Places (selects, does not edit - see the file header) a text box on the
 * given edge's field, so its full per-element toolbar is showing.
 */
async function selectEdgeField(page, edge) {
  const { hint, box } = await edgeCellHint(page, edge);
  await hint.click({ position: { x: box.width / 2, y: box.height / 2 }, force: true });
  await expect(activeActions(page)).toBeVisible();
  // The compact editing bar (MOBI-16) is a `.click()`-path dead end - a real
  // touch tap opens it, a mouse click only selects - but assert the escape
  // hatch is not silently open, so a change to that gating does not make
  // this spec measure the wrong bar without saying so.
  await expect(activeActions(page).getByRole('button', { name: 'Delete element' })).toBeVisible();
}

/** Row count: group the bar's buttons/dividers by their rounded `offsetTop`. */
async function measure(page, scale) {
  const active = await activeElement(page).elementHandle();
  await page.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'center' });
  }, active);
  await page.waitForTimeout(150);
  const barHandle = await activeActions(page).elementHandle();
  return page.evaluate(([bar, s]) => {
    const rect = bar.getBoundingClientRect();
    const tops = new Set();
    bar.querySelectorAll('button, [class*="divider"]').forEach((child) => {
      tops.add(Math.round(child.getBoundingClientRect().top));
    });
    const vv = window.visualViewport;
    const vvScaleProperty = getComputedStyle(document.documentElement).getPropertyValue('--vv-scale').trim();
    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      physicalWidth: rect.width * s,
      physicalHeight: rect.height * s,
      rows: tops.size,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      viewport: vv
        ? { left: vv.offsetLeft, top: vv.offsetTop, right: vv.offsetLeft + vv.width, bottom: vv.offsetTop + vv.height }
        : null,
      vvScaleProperty,
    };
  }, [barHandle, scale]);
}

for (const doc of DOCUMENTS) {
  for (const edge of ['left', 'right']) {
    test(`${doc.name}, field near the ${edge} edge: the toolbar holds its physical size and row count under zoom`, async ({ page, context }) => {
      test.setTimeout(90_000);
      await openWithFixture(page, doc.file);
      await selectEdgeField(page, edge);

      const cdp = await context.newCDPSession(page);
      const results = [];
      for (const scale of SCALES) {
        await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale });
        // Our own useVisualViewportScale listener is what has to catch this -
        // give the native visualViewport 'resize' event a moment to fire and
        // the CSSOM write to land before reading it back.
        await page.waitForTimeout(150);
        results.push({ scale, ...(await measure(page, scale)) });
      }
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });

      const baseline = results[0];
      expect(baseline.rows, 'non-vacuity: the full toolbar really did wrap to more than one row at rest').toBeGreaterThan(1);
      expect(baseline.vvScaleProperty, 'the shared hook published a scale at all').not.toBe('');

      for (const r of results) {
        expect(Number(r.vvScaleProperty), `--vv-scale reflects the CDP scale at ${r.scale}x`).toBeCloseTo(r.scale, 1);

        expect(r.physicalWidth, `physical width holds at ${r.scale}x`)
          .toBeGreaterThan(baseline.physicalWidth - PHYSICAL_SIZE_TOLERANCE_PX);
        expect(r.physicalWidth, `physical width holds at ${r.scale}x`)
          .toBeLessThan(baseline.physicalWidth + PHYSICAL_SIZE_TOLERANCE_PX);
        expect(r.physicalHeight, `physical height holds at ${r.scale}x`)
          .toBeGreaterThan(baseline.physicalHeight - PHYSICAL_SIZE_TOLERANCE_PX);
        expect(r.physicalHeight, `physical height holds at ${r.scale}x`)
          .toBeLessThan(baseline.physicalHeight + PHYSICAL_SIZE_TOLERANCE_PX);
        expect(r.rows, `row count holds at ${r.scale}x`).toBe(baseline.rows);

        if (r.viewport) {
          expect(r.rect.left, `bar's left edge is on screen at ${r.scale}x`)
            .toBeGreaterThanOrEqual(r.viewport.left - VIEWPORT_CONTAINMENT_SLACK_PX);
          expect(r.rect.top, `bar's top edge is on screen at ${r.scale}x`)
            .toBeGreaterThanOrEqual(r.viewport.top - VIEWPORT_CONTAINMENT_SLACK_PX);
          expect(r.rect.right, `bar's right edge is on screen at ${r.scale}x`)
            .toBeLessThanOrEqual(r.viewport.right + VIEWPORT_CONTAINMENT_SLACK_PX);
          expect(r.rect.bottom, `bar's bottom edge is on screen at ${r.scale}x`)
            .toBeLessThanOrEqual(r.viewport.bottom + VIEWPORT_CONTAINMENT_SLACK_PX);
        }
      }
    });
  }
}
