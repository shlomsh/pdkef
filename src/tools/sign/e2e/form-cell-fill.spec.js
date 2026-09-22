import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * MOBI-11: a tap on a detected free-text cell places a box that fills the
 * cell edge to edge, and the text typed into it sits inside the cell whether
 * it reads left to right or right to left.
 *
 * Rendered rects are what this proves and jsdom cannot: the box's `left` and
 * `minWidth` are page percentages the unit tests already check, but whether
 * the wrapper's min-width, the node's single grid column and the textarea's
 * text-align actually land the glyphs on the cell is layout. The health
 * declaration fixture is the one whose page 1 has closed cells (a name, a
 * date, an address line) rather than comb runs.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  here, '..', '..', '..', '..', 'src', 'editor', 'adapters', 'pdf', '__fixtures__',
  'health-declaration-page1-geometry.pdf',
);

// Form 101 in full, text layer included: its employer-row phone cell is
// captioned, so its hint and its typed box are the band under the caption.
const FORM_101 = path.resolve(
  here, '..', '..', '..', '..', 'src', 'editor', 'adapters', 'pdf', 'corpus', 'scoring', 'forms',
  'income-tax-101-2024.pdf',
);

// The active box wears a 1px border each side over its content width, plus
// the hint's own outline and subpixel rounding.
const EDGE_SLACK_PX = 3;

async function openWithFixture(page, { file = FIXTURE, name = 'health-declaration.pdf' } = {}) {
  await page.goto('/sign');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({
    name,
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

/** The widest cell hint on the page: the one a name goes in, with room to type. */
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

async function activeBox(page) {
  return page.locator('[data-editor-element][data-editor-active]').boundingBox();
}

/** The rendered rect of the typed glyphs: the textarea's caret-free text range. */
async function typedTextRect(page) {
  return page.evaluate(() => {
    const input = document.querySelector('[data-editor-element][data-editor-active] [data-editor-text-input]');
    // A textarea's text has no DOM range to measure; mirror it into a span
    // with the same font and alignment inside the same box.
    const probe = document.createElement('span');
    const style = getComputedStyle(input);
    probe.textContent = input.value;
    probe.style.font = style.font;
    probe.style.whiteSpace = 'pre';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    const rect = input.getBoundingClientRect();
    const padLeft = parseFloat(style.paddingLeft);
    const padRight = parseFloat(style.paddingRight);
    return style.textAlign === 'right'
      ? { left: rect.right - padRight - width, right: rect.right - padRight }
      : { left: rect.left + padLeft, right: rect.left + padLeft + width };
  });
}

test.describe('typing into a detected form cell', () => {
  test('the box fills the cell edge to edge on the tap', async ({ page }) => {
    await openWithFixture(page);
    const { hint, box: cell } = await widestCellHint(page);
    await hint.click({ position: { x: cell.width * 0.3, y: cell.height / 2 }, force: true });
    const element = await activeBox(page);
    expect(element).not.toBeNull();
    expect(Math.abs(element.x - cell.x)).toBeLessThanOrEqual(EDGE_SLACK_PX);
    expect(Math.abs((element.x + element.width) - (cell.x + cell.width))).toBeLessThanOrEqual(EDGE_SLACK_PX);
  });

  test('Latin text starts at the cell\'s left edge; Hebrew ends at its right edge; the box never moves', async ({ page }) => {
    await openWithFixture(page);
    const { hint, box: cell } = await widestCellHint(page);
    await hint.click({ position: { x: cell.width * 0.7, y: cell.height / 2 }, force: true });
    const input = page.locator('[data-editor-element][data-editor-active] [data-editor-text-input]');

    await input.fill('Shlomi');
    const latin = await typedTextRect(page);
    // Inside the cell, starting at its left edge (plus the box's own padding).
    expect(latin.left).toBeGreaterThanOrEqual(cell.x - EDGE_SLACK_PX);
    expect(latin.left).toBeLessThan(cell.x + cell.width * 0.2);
    expect(latin.right).toBeLessThanOrEqual(cell.x + cell.width + EDGE_SLACK_PX);

    await input.fill('שלומי');
    const hebrew = await typedTextRect(page);
    // Inside the cell, ending at its right edge - a free RTL box would have
    // flipped its anchored edge here and slid a box-width to the left, out
    // of the cell.
    expect(hebrew.right).toBeLessThanOrEqual(cell.x + cell.width + EDGE_SLACK_PX);
    expect(hebrew.right).toBeGreaterThan(cell.x + cell.width * 0.8);
    expect(hebrew.left).toBeGreaterThanOrEqual(cell.x - EDGE_SLACK_PX);

    const element = await activeBox(page);
    expect(Math.abs(element.x - cell.x)).toBeLessThanOrEqual(EDGE_SLACK_PX);
    expect(Math.abs((element.x + element.width) - (cell.x + cell.width))).toBeLessThanOrEqual(EDGE_SLACK_PX);
  });

  test('is still plain text, not a comb: no per-character cells appear', async ({ page }) => {
    await openWithFixture(page);
    const { hint, box: cell } = await widestCellHint(page);
    await hint.click({ position: { x: cell.width / 2, y: cell.height / 2 }, force: true });
    const input = page.locator('[data-editor-element][data-editor-active] [data-editor-text-input]');
    await input.fill('Shlomi Shemesh');
    await expect(page.locator('[data-editor-element][data-editor-active] [data-text-part="comb-cell"]')).toHaveCount(0);
    await expect(page.locator('[data-editor-element][data-editor-active] [data-editor-text-display]')).toHaveAttribute('data-span', 'field');
  });
});

// A phone renders the page small, so the cell is a few dozen pixels wide and
// the box's fixed side padding is a real share of it.
test.describe('typing into a narrow detected cell on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('an empty box on a cell narrower than its placeholder stays inside the cell', async ({ page }) => {
    // Form 101's employer phone cell is narrower than "Type your text" at
    // the cell's font size; sizing the empty box by its placeholder pushed it
    // across the wall into the employer's name cell (live report, iPhone).
    await openWithFixture(page, { file: FORM_101, name: 'form-101.pdf' });
    const pageOne = page.locator('[class*="page-overlay"]').first();
    const overlay = await pageOne.boundingBox();
    const hints = pageOne.locator('[class*="field-hint-cell"]');
    let phone = null;
    for (let i = 0; i < await hints.count(); i += 1) {
      const box = await hints.nth(i).boundingBox();
      // The cell detected at page-percent left 21.89, width 13.22, top 19.56.
      const left = ((box.x - overlay.x) / overlay.width) * 100;
      const top = ((box.y - overlay.y) / overlay.height) * 100;
      if (Math.abs(left - 21.89) < 0.5 && Math.abs(top - 19.56) < 1.5) phone = { hint: hints.nth(i), box };
    }
    expect(phone, 'form 101 employer phone cell hint').not.toBeNull();
    const { hint, box: cell } = phone;
    await hint.click({ position: { x: cell.width / 2, y: cell.height / 2 }, force: true });
    const input = page.locator('[data-editor-element][data-editor-active] [data-editor-text-input]');
    await expect(input).toHaveAttribute('placeholder', 'Type your text');
    const element = await activeBox(page);
    expect(Math.abs(element.x - cell.x)).toBeLessThanOrEqual(EDGE_SLACK_PX);
    expect(element.x + element.width).toBeLessThanOrEqual(cell.x + cell.width + EDGE_SLACK_PX);

    // A phone number fits, so the box does not grow once typed either.
    await input.fill('03-1234567');
    const typed = await activeBox(page);
    expect(typed.x + typed.width).toBeLessThanOrEqual(cell.x + cell.width + EDGE_SLACK_PX);
  });
});
