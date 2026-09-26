import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * Tapping a printed grid, in a real browser.
 *
 * jsdom cannot answer the only questions that matter here: where a comb cell
 * actually renders once CSS has run, and whether the box stays on its field
 * when the text switches direction. Both are rendered-rect questions.
 *
 * The fixture is income tax form 101 page 1, reduced to its path geometry -
 * see scripts/generate-form-grid-fixtures.mjs for why it is reduced.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  here, '..', '..', '..', '..', 'src', 'tools', 'sign', 'fields', '__fixtures__',
  'income-tax-101-page1-geometry.pdf',
);
const HEALTH_FIXTURE = path.resolve(
  here, '..', '..', '..', '..', 'src', 'tools', 'sign', 'fields', '__fixtures__',
  'health-declaration-page1-geometry.pdf',
);

// The identity comb ("מספר זהות (9 ספרות)"), as the detector reports it in
// page percentages. Nine cells at an 11.34pt pitch; the fixture test in
// formGrid.fixtures.test.js is what pins these numbers to the detector.
const IDENTITY_RUN = { left: 73.597, top: 27.277, width: 17.152, cells: 9 };
// The family-name cell on the same printed row, left of the identity comb:
// the comb's teeth hang off the bottom rule of a cell exactly this tall
// (25.32-28.09), which fieldRegions.js hands the comb as its writable strip.
const NAME_CELL = { left: 52.73, top: 25.32, width: 20.87, height: 2.77 };

async function openWithFixture(page) {
  await page.goto('/sign/?next=0');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({
    name: 'form-101-geometry.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(FIXTURE),
  });
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
  // Detection is a dynamic import plus a content-stream walk, so the hints are
  // not there on the first frame. Arming Text is what reveals them.
  await armText(page);
  await expect(page.locator('[class*="field-hint"]').first()).toBeVisible();
}

async function openWithHealthFixture(page) {
  await page.goto('/sign/?next=0');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({
    name: 'health-declaration-geometry.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(HEALTH_FIXTURE),
  });
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
  await armSymbols(page);
  await expect(page.locator('[class*="field-hint-checkbox"]').first()).toBeVisible();
}

async function armText(page) {
  const textTool = page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Text', exact: true });
  if ((await textTool.getAttribute('aria-pressed')) !== 'true') await textTool.click();
}

async function armSymbols(page) {
  const symbolTool = page
    .getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Symbols', exact: true });
  if ((await symbolTool.getAttribute('aria-pressed')) !== 'true') await symbolTool.click();
}

/** Taps the middle of a run, in the page's own percentage coordinates. */
async function tapRun(page, run) {
  const overlay = page.locator('[class*="page-overlay"]').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  await overlay.click({
    position: {
      x: (box.width * (run.left + run.width / 2)) / 100,
      y: (box.height * (run.top + 0.4)) / 100,
    },
  });
}

/** Taps the centre of a detected checkbox at its real rendered location. */
async function tapFirstCheckbox(page) {
  const hint = page.locator('[class*="field-hint-checkbox"]').first();
  const hintBox = await hint.boundingBox();
  const overlay = page.locator('[class*="page-overlay"]').first();
  const overlayBox = await overlay.boundingBox();
  await overlay.click({
    position: {
      x: hintBox.x + hintBox.width / 2 - overlayBox.x,
      y: hintBox.y + hintBox.height / 2 - overlayBox.y,
    },
  });
}

/** Rendered comb-cell centres and the element's own box, as page percentages. */
async function measure(page) {
  return page.evaluate(() => {
    const element = document.querySelector('[data-editor-element][data-editor-active]');
    const wrapper = element.closest('[class*="page-wrapper"]');
    const frame = wrapper.getBoundingClientRect();
    const cells = [...element.querySelectorAll('[class*="text-comb-cell"]')].map((cell) => {
      const rect = cell.getBoundingClientRect();
      return {
        char: cell.textContent,
        center: ((rect.left + rect.width / 2 - frame.left) / frame.width) * 100,
      };
    });
    const rect = element.getBoundingClientRect();
    return {
      cells,
      left: ((rect.left - frame.left) / frame.width) * 100,
      right: ((rect.right - frame.left) / frame.width) * 100,
      centreY: ((rect.top + rect.height / 2 - frame.top) / frame.height) * 100,
    };
  });
}

test.describe('tapping a printed comb run', () => {
  test('types nine digits into nine printed cells', async ({ page }) => {
    await openWithFixture(page);
    await tapRun(page, IDENTITY_RUN);

    const input = page.locator('[data-editor-element][data-editor-active] [data-editor-text-input]');
    await expect(input).toBeVisible();
    await input.fill('312456789');

    const { cells } = await measure(page);
    expect(cells).toHaveLength(IDENTITY_RUN.cells);
    expect(cells.map((cell) => cell.char).join('')).toBe('312456789');

    // Every digit centred on its own printed cell, which is the acceptance
    // criterion: verified against the detected cell centres, not by eye.
    cells.forEach((cell, index) => {
      const expected = IDENTITY_RUN.left
        + ((index + 0.5) / IDENTITY_RUN.cells) * IDENTITY_RUN.width;
      expect(Math.abs(cell.center - expected)).toBeLessThan(0.15);
    });
  });

  test('leaves no tool armed, so the next tap on empty paper deselects', async ({ page }) => {
    await openWithFixture(page);
    await tapRun(page, IDENTITY_RUN);
    await expect(page.locator('[data-editor-element][data-editor-active]')).toHaveCount(1);

    const textTool = page
      .getByRole('toolbar', { name: 'PDF annotations' })
      .getByRole('button', { name: 'Text', exact: true });
    await expect(textTool).toHaveAttribute('aria-pressed', 'false');

    // A second tap on empty paper must deselect rather than place another box.
    const overlay = page.locator('[class*="page-overlay"]').first();
    const box = await overlay.boundingBox();
    await overlay.click({ position: { x: box.width * 0.5, y: box.height * 0.72 } });
    await expect(page.locator('[data-editor-element]')).toHaveCount(1);
    await expect(page.locator('[data-editor-element][data-editor-active]')).toHaveCount(0);
  });

  test('keeps the span on the field when the text turns RTL', async ({ page }) => {
    // Both evidence forms are Hebrew. A comb's span is fixed by the paper, so
    // unlike a growing text box it has no anchored edge to flip - typing Hebrew
    // used to slide the whole box a field-width to the left, off the boxes it
    // had just been sized to.
    await openWithFixture(page);
    await tapRun(page, IDENTITY_RUN);
    const input = page.locator('[data-editor-element][data-editor-active] [data-editor-text-input]');
    await input.fill('123456789');
    const latin = await measure(page);

    await input.fill('אבגדהוזחט');
    const hebrew = await measure(page);

    expect(hebrew.left).toBeCloseTo(latin.left, 1);
    expect(hebrew.right).toBeCloseTo(latin.right, 1);
    expect(hebrew.left).toBeCloseTo(IDENTITY_RUN.left, 0);

    // Reading order still mirrors inside the fixed span: the first character
    // typed belongs in the rightmost cell (comb.js owns that).
    expect(hebrew.cells[0].char).toBe('א');
    expect(hebrew.cells[0].center).toBeGreaterThan(hebrew.cells[8].center);
  });

  test('sits at the same height as the name cell beside it, not down on its own rule', async ({ page }) => {
    // The teeth are dividers on the bottom rule of a cell as tall as the name
    // cell next to it; the digits belong where that cell's text goes. On the
    // rule they sat 5pt lower than the row's other answers (live report).
    await openWithFixture(page);
    await tapRun(page, IDENTITY_RUN);
    await page.locator('[data-editor-element][data-editor-active] [data-editor-text-input]').fill('038243085');
    const digits = await measure(page);

    await armText(page);
    await tapRun(page, { ...NAME_CELL, top: NAME_CELL.top + NAME_CELL.height / 2 - 0.4 });
    await page.locator('[data-editor-element][data-editor-active] [data-editor-text-input]').fill('שמש');
    const name = await measure(page);

    expect(Math.abs(digits.centreY - name.centreY)).toBeLessThan(0.15);
    // Centred in the cell means the box's middle is above the teeth; a box
    // standing on the rule has its middle inside them.
    expect(digits.centreY).toBeLessThan(IDENTITY_RUN.top);
  });

  test('undo removes the placed comb in one step', async ({ page }) => {
    // "One step" is one history entry as well as one tap: snapping to a printed
    // field must not log the placement as several actions just because it sets
    // more fields than a plain text box. Undo and Redo are the whole history
    // model, so the count of entries is read off them: one tap clears the
    // page, and Undo then has nothing left to do.
    await openWithFixture(page);
    await tapRun(page, IDENTITY_RUN);
    await expect(page.locator('[data-editor-element]')).toHaveCount(1);

    const toolbar = page.getByRole('toolbar', { name: 'PDF annotations' });
    const undo = toolbar.getByRole('button', { name: 'Undo', exact: true });
    await undo.click();
    await expect(page.locator('[data-editor-element]')).toHaveCount(0);
    await expect(undo).toBeDisabled();
  });
});

test.describe('tapping a detected checkbox', () => {
  // The checkbox is roughly 2.3mm on paper. This has to be proven with touch
  // input at a phone viewport, rather than only with a desktop-sized click.
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('places and clears a mark in the same detected box', async ({ page }) => {
    await openWithHealthFixture(page);
    await tapFirstCheckbox(page);

    await expect(page.locator('[data-editor-element]')).toHaveCount(1);
    await expect(page.locator('[data-editor-element][data-editor-active]')).toHaveCount(1);
    const symbolTool = page
      .getByRole('toolbar', { name: 'PDF annotations' })
      .getByRole('button', { name: 'Symbols', exact: true });
    await expect(symbolTool).toHaveAttribute('aria-pressed', 'false');

    // The one-shot arming model still applies. Re-arm, then the same real
    // target acts as a toggle instead of layering a second check over it.
    await armSymbols(page);
    await tapFirstCheckbox(page);
    await expect(page.locator('[data-editor-element]')).toHaveCount(0);
    await expect(symbolTool).toHaveAttribute('aria-pressed', 'false');

    // Clearing is a delete command, not an untracked visual toggle: two entries
    // in the history, and one tap of Undo brings the mark back rather than
    // taking the add away, which is what an untracked toggle would have left as
    // the newest entry. Undo is present at every width, phone included, so the
    // second entry is proven by tapping it again rather than by opening
    // anything.
    const toolbar = page.getByRole('toolbar', { name: 'PDF annotations' });
    const undo = toolbar.getByRole('button', { name: 'Undo', exact: true });
    await undo.click();
    await expect(page.locator('[data-editor-element]')).toHaveCount(1);

    await undo.click();
    await expect(page.locator('[data-editor-element]')).toHaveCount(0);
    await expect(undo).toBeDisabled();
  });
});
