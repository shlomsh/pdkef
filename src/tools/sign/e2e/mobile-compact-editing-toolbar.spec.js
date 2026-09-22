import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * MOBI-16: on a phone, typing into a detected field used to raise the full
 * per-element toolbar - a dozen controls that wrap to two or three rows and
 * cover the fields just filled (measured on the practice form as ~84px of
 * document). While a text box is in an edit session on a touch device, it
 * now collapses to one row - Previous, Next, an "Aa" disclosure - with the
 * full controls one tap away. Rendered rects and real touch input are what
 * this proves and jsdom cannot: whether the bar is actually one row tall,
 * and whether `(pointer: coarse)` genuinely gates it off on desktop.
 *
 * `EditorToolStatus`'s own Previous/Next (the top status line, MOBI-06)
 * stays mounted throughout - this feature sits beside it, not instead of
 * it - so every query below is scoped to the active element's own
 * `[data-editor-actions]` bar to tell the two apart.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  here, '..', '..', '..', '..', 'src', 'editor', 'adapters', 'pdf', '__fixtures__',
  'health-declaration-page1-geometry.pdf',
);

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
  const textTool = page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Text', exact: true });
  if ((await textTool.getAttribute('aria-pressed')) !== 'true') await textTool.click();
  await expect(page.locator('[class*="field-hint-cell"]').first()).toBeVisible();
}

async function widestCellHint(page) {
  const hints = page.locator('[class*="field-hint-cell"]');
  const count = await hints.count();
  let best = null;
  for (let i = 0; i < count; i += 1) {
    const box = await hints.nth(i).boundingBox();
    if (box && (!best || box.width > best.box.width)) best = { hint: hints.nth(i), box };
  }
  return best;
}

/** The active element's own per-element toolbar, distinct from the
 * status-line copy of Previous/Next (EditorToolStatus's `.field-nav`). */
function activeActions(page) {
  return page.locator('[data-editor-element][data-editor-active] [data-editor-actions]');
}

test.describe('Sign per-element toolbar on a phone (MOBI-16)', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('typing a detected field shows Previous/Next/Aa, one row, not the full wrapped toolbar', async ({ page }) => {
    await openWithFixture(page);
    const { hint, box: cell } = await widestCellHint(page);
    await hint.click({ position: { x: cell.width / 2, y: cell.height / 2 }, force: true });

    const actions = activeActions(page);
    await expect(actions.getByRole('button', { name: 'Previous field' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Next field' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Formatting options' })).toBeVisible();
    // The full toolbar's own controls must not be present alongside it.
    await expect(actions.getByRole('button', { name: 'B', exact: true })).toHaveCount(0);
    await expect(actions.getByRole('button', { name: 'Delete element' })).toHaveCount(0);

    // One row: a button here is 28px tall, so a genuinely single-row bar
    // (padding included) stays well under a wrapped two-row bar's ~68px.
    const box = await actions.boundingBox();
    expect(box.height).toBeLessThan(44);

    // Tap Aa: today's controls appear, and Previous/Next step aside.
    await actions.getByRole('button', { name: 'Formatting options' }).click();
    await expect(actions.getByRole('button', { name: 'B', exact: true })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Delete element' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Previous field' })).toHaveCount(0);

    // The same toggle folds it back.
    await actions.getByRole('button', { name: 'Formatting options' }).click();
    await expect(actions.getByRole('button', { name: 'Previous field' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'B', exact: true })).toHaveCount(0);
  });

  test('Next steps to the next field and keeps the compact bar, without losing the caret session', async ({ page }) => {
    await openWithFixture(page);
    // First hint in DOM order, not the widest: 81 fields are detected on this
    // page, and the widest one (used by the sibling test above, which never
    // taps Next) can land at the end of the fill order with nowhere to go.
    const hint = page.locator('[class*="field-hint-cell"]').first();
    const cell = await hint.boundingBox();
    await hint.click({ position: { x: cell.width / 2, y: cell.height / 2 }, force: true });
    const firstId = await page.locator('[data-editor-element][data-editor-active]').getAttribute('data-editor-element-id');

    await expect(activeActions(page).getByRole('button', { name: 'Next field' })).toBeEnabled();
    await activeActions(page).getByRole('button', { name: 'Next field' }).click();

    await expect(activeActions(page).getByRole('button', { name: 'Previous field' })).toBeVisible();
    const secondId = await page.locator('[data-editor-element][data-editor-active]').getAttribute('data-editor-element-id');
    expect(secondId).not.toBe(firstId);
    // The newly active field is itself in an edit session (its textarea is
    // interactable), which is what a compact bar being visible implies.
    const input = page.locator('[data-editor-element][data-editor-active] [data-editor-text-input]');
    await input.fill('Shlomi');
    await expect(input).toHaveValue('Shlomi');
  });
});

test.describe('Sign per-element toolbar on desktop (MOBI-16)', () => {
  test('a fine pointer never collapses the toolbar while typing a detected field', async ({ page }) => {
    await openWithFixture(page);
    const { hint, box: cell } = await widestCellHint(page);
    await hint.click({ position: { x: cell.width / 2, y: cell.height / 2 }, force: true });

    const actions = activeActions(page);
    await expect(actions.getByRole('button', { name: 'B', exact: true })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Delete element' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Previous field' })).toHaveCount(0);
    await expect(actions.getByRole('button', { name: 'Formatting options' })).toHaveCount(0);
  });
});
