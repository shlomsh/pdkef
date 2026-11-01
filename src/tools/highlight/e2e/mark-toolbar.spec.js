import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

/* READ-04: the mark toolbar reuses Sign's .actions class, which is opacity 0 outside an active Sign element.
   Highlight's own rule must win whatever order the stylesheets load in. It shipped invisible once while every
   unit test passed, because jsdom applies no stylesheets. */

test.use({ serviceWorkers: 'block' });

test('clicking a highlight shows its toolbar, visible and on screen, and Escape puts it away', async ({ page }) => {
  const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text a student would highlight', y: 700 }] });
  await openTool(page, '/highlight-pdf/', { file: { name: 'toolbar.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });

  const box = await page.locator('[data-page-overlay]').first().boundingBox();
  const y = box.y + box.height * ((792 - 694) / 792);
  await page.mouse.move(box.x + box.width * (72 / 612), y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (330 / 612), y, { steps: 8 });
  await page.mouse.up();

  const mark = page.locator('[data-page-overlay] [data-element-id]');
  await expect(mark).toHaveCount(1);
  const band = await mark.boundingBox();
  await page.mouse.click(band.x + band.width / 2, band.y + band.height / 2);

  const bar = page.locator('[data-rest-toolbar]');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveCSS('opacity', '1');
  const rect = await bar.boundingBox();
  const view = page.viewportSize();
  expect(rect.x + rect.width).toBeGreaterThan(0);
  expect(rect.y + rect.height).toBeGreaterThan(0);
  expect(rect.x).toBeLessThan(view.width);
  expect(rect.y).toBeLessThan(view.height);

  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();
});

/* READ-04: on a phone the five controls sit on one row inside the screen, and the bar keeps its width when the
   style changes (the underline's thickness trigger is always there). */
for (const [w, h] of [[375, 812], [402, 874]]) {
  test(`phone ${w}x${h}: one row inside the viewport, same width for highlight and underline`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text a student would highlight', y: 700 }] });
    await openTool(page, '/highlight-pdf/', { file: { name: 'toolbar.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });

    const box = await page.locator('[data-page-overlay]').first().boundingBox();
    const y = box.y + box.height * ((792 - 694) / 792);
    await page.mouse.move(box.x + box.width * (72 / 612), y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * (330 / 612), y, { steps: 8 });
    await page.mouse.up();

    const mark = page.locator('[data-page-overlay] [data-element-id]');
    await expect(mark).toHaveCount(1);
    const band = await mark.boundingBox();
    await page.mouse.click(band.x + band.width / 2, band.y + band.height / 2);

    const bar = page.locator('[data-rest-toolbar]');
    await expect(bar).toBeVisible();
    const rects = await bar.locator('button').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }));
    expect(rects).toHaveLength(5);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(w);
      expect(Math.abs(r.y - rects[0].y)).toBeLessThan(2);
    }
    const before = (await bar.boundingBox()).width;
    await bar.getByRole('button', { name: 'Underline', exact: true }).click();
    await expect(bar.getByRole('button', { name: 'Underline', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const after = (await bar.boundingBox()).width;
    console.log(`bar width ${w}: highlight ${before}, underline ${after}`);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  });
}
