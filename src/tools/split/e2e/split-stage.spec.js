import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/* Split, the stage (docs/split-stage-spec.md, 2026-09-14). The one thing
   jsdom cannot prove: the control that changes the output stays inside the
   viewport at every scroll position, at desktop, tablet and phone widths.
   A real user missed the mode once because it scrolled away; this guard is
   the acceptance line from the spec, measured with getBoundingClientRect. */

async function makePdfBuffer(pageCount) {
  const document = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) document.addPage([612, 792]);
  return Buffer.from(await document.save());
}

const WIDTHS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 820, height: 1000 },
  { name: 'phone', width: 375, height: 667 },
];

test.describe('Split: the stage keeps the mode in view', () => {
  for (const size of WIDTHS) {
    test(`${size.name} ${size.width}: the segmented control is inside the viewport at the last grid row`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/split/');
      await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();

      await page.locator('input[type="file"]').setInputFiles({
        name: 'long.pdf',
        mimeType: 'application/pdf',
        buffer: await makePdfBuffer(40),
      });

      const cells = page.getByRole('checkbox', { name: /^Page \d+$/ });
      await expect(cells).toHaveCount(40);

      // Scroll the last cell into view, then check the control's rect.
      await cells.last().scrollIntoViewIfNeeded();
      const group = page.getByRole('radiogroup', { name: 'What to save' });
      await expect(group).toBeVisible();
      const box = await group.boundingBox();
      if (!box) throw new Error('segmented control has no bounding box');
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      expect(box.height).toBeGreaterThanOrEqual(44);

      // Nothing scrolls sideways.
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth !== document.documentElement.clientWidth,
      );
      expect(overflows).toBe(false);
    });
  }

  test('phone 375x667: at least two rows of cells are visible above the sheet', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/split/');
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'long.pdf',
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(12),
    });
    const cells = page.getByRole('checkbox', { name: /^Page \d+$/ });
    await expect(cells).toHaveCount(12);
    // scrollIntoViewIfNeeded is satisfied by a cell hidden behind the sticky
    // sheet, so scroll the way a person would: first cell just under the header.
    const first = await cells.first().boundingBox();
    if (!first) throw new Error('first cell has no bounding box');
    await page.evaluate((y) => window.scrollBy(0, y), first.y - 80);

    const sheetTop = await page.getByRole('radiogroup', { name: 'What to save' }).evaluate(
      (el) => el.closest('[class*="sheet"]').getBoundingClientRect().top,
    );
    const rows = new Set();
    const seen = [];
    for (let i = 0; i < 12; i += 1) {
      const box = await cells.nth(i).boundingBox();
      seen.push(box && [Math.round(box.y), Math.round(box.height)]);
      if (box && box.y >= 0 && box.y + box.height <= sheetTop) rows.add(Math.round(box.y));
    }
    expect(rows.size, `sheet top ${sheetTop}, cells ${JSON.stringify(seen)}`).toBeGreaterThanOrEqual(2);
  });

  test('switching mode regroups the canvas in place and flips the primary element', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/split/');
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'three.pdf',
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(3),
    });

    const heading = page.getByRole('region', { name: 'Your split PDF' }).getByRole('heading', { level: 3 });
    await expect(heading).toHaveText('extracted_three.pdf');
    await expect(page.getByRole('link', { name: /^Download 1 PDF/ })).toBeVisible({ timeout: 10_000 });

    // Switching mode changes the frame chrome (one wrapping frame vs a small
    // frame per page), so cell coordinates are allowed to shift - the spec's
    // acceptance line is that the page never jumps under the change.
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.getByRole('radio', { name: 'One PDF per page' }).click();
    await expect(heading).toHaveText('3 PDFs, one page each');
    await expect(page.getByRole('button', { name: /^Download 3 PDFs/ })).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

    // Leaving a page out dims it in place - toggling selection never moves a
    // cell (review 2026-09-14, P1), only switching mode may.
    const before = await page.getByRole('checkbox', { name: 'Page 2', exact: true }).boundingBox();
    await page.getByRole('checkbox', { name: 'Page 2', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Page 2', exact: true })).toHaveAttribute('aria-checked', 'false');
    await expect(heading).toHaveText('2 PDFs, one page each');
    const after = await page.getByRole('checkbox', { name: 'Page 2', exact: true }).boundingBox();
    if (!before || !after) throw new Error('cell has no bounding box');
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  });
});
