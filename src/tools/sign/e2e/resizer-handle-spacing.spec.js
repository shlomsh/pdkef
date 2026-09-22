import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * MOBI-19: a text box's six resize handles (four corners for font size,
 * MOBI-12; two sides for comb span) used to be a fixed 10px/-4px regardless
 * of the box's own height. A short single-line field - routine in this app;
 * MOBI-12's own text cites a real 31x7px date box - packed three of them
 * into a few px on each edge and they rendered as one overlapping blob
 * (reported live, twice, on the practice form). `--half-height` and the
 * `clamp()`/`max()` arithmetic it feeds in EditorElement.module.css are
 * meant to guarantee they never touch, however short the box gets; jsdom
 * has no CSS engine to evaluate that arithmetic (TextNode.test.tsx proves
 * only that the one raw measurement reaches the DOM correctly), so whether
 * the handles actually stay apart on screen is exactly what this needs a
 * real browser to prove.
 *
 * MOBI-19 follow-up: the same blob happens on a symbol (a checkbox mark)
 * tapped onto a detected printed checkbox - sized to match the print, a
 * few px on a phone, with the same fixed 10px corner handles. `--half-width`/
 * `--half-height` and `.symbol .resizer`'s own `clamp()`/`max()` arithmetic
 * fix it the same way, generalised to both axes since a symbol resizes in
 * width and height together rather than growing one line at a time.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  here, '..', '..', '..', '..', 'src', 'editor', 'adapters', 'pdf', '__fixtures__',
  'health-declaration-page1-geometry.pdf',
);

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

async function openWithFixture(page) {
  await page.goto('/sign');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({
    name: 'health-declaration.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(FIXTURE),
  });
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
}

/** Every resize handle's real rendered position and radius. */
async function readHandles(element) {
  return element.locator('[data-editor-resizer]').evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { handle: n.getAttribute('data-editor-resizer'), cx: r.x + r.width / 2, cy: r.y + r.height / 2, radius: r.width / 2 };
    })
  );
}

// A bare non-overlap is not the bar: a gap of a fraction of a px still reads
// as touching once anti-aliasing softens each circle's edge, especially at
// the zoom a person pinches to in order to see a field this small at all -
// and pinch-zoom is a pure visual-viewport magnifier, so a thin CSS-px gap
// stays exactly that thin at any zoom level. Require at least 2px of true
// clearance between every pair's edges (edge-to-edge distance = centre
// distance minus both radii), not just a positive one.
const MIN_CLEARANCE_PX = 2;

/** Fails with every handle pair that has under MIN_CLEARANCE_PX of true
 * edge-to-edge clearance, named so a failure says exactly which pair and by
 * how much. */
function expectNoOverlap(handles) {
  const tooClose = [];
  for (let i = 0; i < handles.length; i += 1) {
    for (let j = i + 1; j < handles.length; j += 1) {
      const a = handles[i];
      const b = handles[j];
      const distance = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      const clearance = distance - a.radius - b.radius;
      if (clearance < MIN_CLEARANCE_PX) tooClose.push(`${a.handle} x ${b.handle}: ${clearance.toFixed(2)}px clearance`);
    }
  }
  expect(tooClose, `Handle pairs with under ${MIN_CLEARANCE_PX}px clearance:\n${tooClose.join('\n')}`).toEqual([]);
}

test('a text box\'s resize handles never overlap, however short the field is', async ({ page }) => {
  await openWithFixture(page);
  const textTool = page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Text', exact: true });
  if ((await textTool.getAttribute('aria-pressed')) !== 'true') await textTool.click();
  await expect(page.locator('[class*="field-hint-cell"]').first()).toBeVisible();

  // The widest cell hint on this fixture's shortest row - the same one the
  // original bug screenshot showed, and short enough (measured ~8px tall at
  // this viewport) that the fixed-geometry handles fully overlapped.
  const hints = page.locator('[class*="field-hint-cell"]');
  const count = await hints.count();
  let best = null;
  for (let i = 0; i < count; i += 1) {
    const box = await hints.nth(i).boundingBox();
    if (box && (!best || box.width > best.box.width)) best = { hint: hints.nth(i), box };
  }
  await best.hint.click({ position: { x: best.box.width / 2, y: best.box.height / 2 }, force: true });

  const element = page.locator('[data-editor-element][data-editor-active]');
  const elementBox = await element.boundingBox();
  // Confirms this run is actually exercising the short-field case the fix
  // targets, not a coincidentally tall one that would pass for free.
  expect(elementBox.height).toBeLessThan(20);

  const handles = await readHandles(element);
  expect(handles.length).toBe(6);
  expectNoOverlap(handles);
});

test('a symbol\'s resize handles never overlap, however small the checkbox is', async ({ page }) => {
  await openWithFixture(page);
  const symbolTool = page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Symbols', exact: true });
  if ((await symbolTool.getAttribute('aria-pressed')) !== 'true') await symbolTool.click();
  await expect(page.locator('[class*="field-hint-checkbox"]').first()).toBeVisible();

  // A real detected checkbox, not a freshly placed symbol from the toolbar
  // (which defaults to a comfortably usable size) - tapping the hint sizes
  // the placed symbol to the print itself, the case that overlapped.
  const hint = page.locator('[class*="field-hint-checkbox"]').first();
  const hintBox = await hint.boundingBox();
  await hint.click({ position: { x: hintBox.width / 2, y: hintBox.height / 2 }, force: true });

  const element = page.locator('[data-editor-element][data-editor-active]');
  const elementBox = await element.boundingBox();
  // Confirms this run is actually exercising the tiny-checkbox case the fix
  // targets: the real fixture measured 4.28x4.28px at this viewport.
  expect(elementBox.width).toBeLessThan(10);
  expect(elementBox.height).toBeLessThan(10);

  const handles = await readHandles(element);
  expect(handles.length).toBe(4);
  expectNoOverlap(handles);
});
