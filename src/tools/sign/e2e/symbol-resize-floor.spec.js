import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * Reported live on a real Hebrew tax form (income tax form 101): a checkbox
 * placed on a detected printed square is sized to match the print exactly
 * (`placeSymbolOnRegion`), routinely a few px - well under `MIN_SYMBOL_WIDTH_PX`
 * (14px), the floor `applySymbolResize` otherwise holds a resize to so a
 * freely-placed symbol from the toolbar never shrinks into illegibility.
 * That floor used to apply unconditionally: the very first pixel of any
 * resize gesture on an already-below-floor symbol - even one nudged, even
 * one meant to shrink it further - snapped its width straight up to 14px,
 * so a checkbox sized to a tiny printed square no longer fit it the moment
 * its handle was touched. `centeredResize.test.ts` proves the arithmetic in
 * isolation; this proves the real gesture path (pointer events through
 * `useElementResize.js`) behaves the same way end to end.
 *
 * Runs against the real form itself (`income-tax-101-2024.pdf`, already the
 * fixture `field-nav-arrow-direction.spec.js` uses), not a synthetic
 * geometry-only fixture: the report was on this exact document, and its
 * printed checkboxes are what the fix has to hold up against, not a
 * best-case stand-in.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..');
const FIXTURE = path.join(
  root, 'src', 'editor', 'adapters', 'pdf', 'corpus', 'scoring', 'forms', 'income-tax-101-2024.pdf',
);

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test('nudging a checkbox smaller than the resize floor does not snap it up to that floor', async ({ page }) => {
  await page.goto('/sign');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({
    name: 'income-tax-101.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(FIXTURE),
  });
  await expect(page.locator('[class*="page-overlay"]').first()).toBeVisible();

  const symbolTool = page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Symbols', exact: true });
  if ((await symbolTool.getAttribute('aria-pressed')) !== 'true') await symbolTool.click();

  // A real detected checkbox, sized to the print itself - the case that
  // used to jump. Measured on this form at this viewport: under 10px, well
  // under the 14px floor.
  const hint = page.locator('[class*="field-hint-checkbox"]').first();
  const hintBox = await hint.boundingBox();
  await hint.click({ position: { x: hintBox.width / 2, y: hintBox.height / 2 }, force: true });

  const element = page.locator('[data-editor-element][data-editor-active]');
  const placedBox = await element.boundingBox();
  expect(placedBox.width).toBeLessThan(10);

  // A one-pixel nudge on a corner handle - the smallest gesture a touch or
  // an accidental drag can produce, not a deliberate resize.
  const handle = element.locator('[data-editor-resizer="bottom-right"]');
  const handleBox = await handle.boundingBox();
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 1, startY + 1, { steps: 2 });
  await page.mouse.up();

  const nudgedBox = await element.boundingBox();
  // Stays close to where it started - proves no jump to the ~14px floor,
  // which would have roughly tripled it.
  expect(nudgedBox.width).toBeLessThan(placedBox.width * 2);
});
