import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/* Split, the stage (docs/split-stage-spec.md, 2026-09-14; on the shared page
   grid since GRID-05). The one thing jsdom cannot prove: the control that
   changes the output stays inside the viewport at every scroll position, at
   desktop, tablet and phone widths. A real user missed the mode once because
   it scrolled away. From 1024px it sits in the sticky rail; below, in the
   sticky phone bar beside the quiet Download. */

async function makePdfBuffer(pageCount) {
  const document = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) document.addPage([612, 792]);
  return Buffer.from(await document.save());
}

async function openSplit(page, name, pageCount) {
  await page.goto('/split/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/pdf',
    buffer: await makePdfBuffer(pageCount),
  });
  await page.locator('ul[data-page-grid][data-fit-settled]').waitFor();
}

const cells = (page) => page.locator('ul[data-page-grid] > li[data-key]');
// Below 1024px the rail is hidden and the phone bar carries the control, so
// the visible radiogroup is the one in force at this width.
const modeGroup = (page) => page.getByRole('radiogroup', { name: 'What to save' }).locator('visible=true');

const WIDTHS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 820, height: 1000 },
  { name: 'phone', width: 375, height: 667 },
];

test.describe('Split: the stage keeps the mode in view', () => {
  for (const size of WIDTHS) {
    test(`${size.name} ${size.width}: the mode control is inside the viewport at the last page`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openSplit(page, 'long.pdf', 40);
      await expect(cells(page)).toHaveCount(40);

      await cells(page).last().scrollIntoViewIfNeeded();
      const group = modeGroup(page);
      await expect(group).toBeVisible();
      const box = await group.boundingBox();
      if (!box) throw new Error('mode control has no bounding box');
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      expect(box.height).toBeGreaterThanOrEqual(44);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth !== document.documentElement.clientWidth,
      );
      expect(overflows).toBe(false);
    });
  }

  test('phone 375x667: at least two rows of pages are visible under the sticky bar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openSplit(page, 'long.pdf', 12);
    // Scroll the way a person would: the first page just under the bar.
    const first = await cells(page).first().boundingBox();
    if (!first) throw new Error('first page has no bounding box');
    await page.evaluate((y) => window.scrollBy(0, y), first.y - 160);

    const barBottom = await modeGroup(page).evaluate((el) => el.closest('[class*="chip-bar"]').getBoundingClientRect().bottom);
    const rows = new Set();
    for (let i = 0; i < 12; i += 1) {
      const box = await cells(page).nth(i).boundingBox();
      if (box && box.y >= barBottom && box.y + box.height <= 667) rows.add(Math.round(box.y));
    }
    expect(rows.size, `bar bottom ${barBottom}`).toBeGreaterThanOrEqual(2);
  });

  test('switching mode renames the output in place, and skipping a page never moves it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSplit(page, 'three.pdf', 3);

    const heading = page.locator('#page-grid-heading');
    await expect(heading).toContainText('extracted_three.pdf');
    await expect(page.getByRole('link', { name: /^Download 1 PDF/ })).toBeVisible({ timeout: 10_000 });

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.getByRole('radio', { name: 'One PDF per page' }).click();
    await expect(heading).toContainText('three-page-N.pdf');
    await expect(heading).toContainText('3 PDFs');
    await expect(page.locator('[data-state]').filter({ hasText: /Download 3 PDFs/ })).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

    const second = cells(page).nth(1);
    const before = await second.boundingBox();
    await second.focus();
    await page.keyboard.press('Delete');
    await expect(second).toHaveAttribute('data-skipped', /.*/);
    await expect(heading).toContainText('2 PDFs');
    const after = await second.boundingBox();
    if (!before || !after) throw new Error('page has no bounding box');
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  });
});
