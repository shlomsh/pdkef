import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

/* READ-14: a Pencil mark is hatching, not a band. The hatch is one svg path over the mark's box, kept inside it up to the
   pencil's wobble. jsdom has no layout, so the drawn box is read here. Pencil is the third segment of the look toggle in the opacity popover
   (Clean | Sketch | Pencil), not a kind beside Underline; the phone widths are in mark-toolbar.spec.js. */

test.use({ serviceWorkers: 'block' });

const LINES = [
  { text: 'A line of text a student would highlight', y: 700 },
  { text: 'A second line the mark runs down onto', y: 676 },
];

async function layMark(page) {
  const source = await makePdfBuffer(null, { title: false, lines: LINES });
  await openTool(page, '/highlight-pdf/', { file: { name: 'pencil.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
  const box = await page.locator('[data-page-overlay]').first().boundingBox();
  const at = (x, y) => ({ x: box.x + box.width * (x / 612), y: box.y + box.height * ((792 - y) / 792) });
  const a = at(72, 694), b = at(330, 670);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  const mark = page.locator('[data-page-overlay] [data-element-id]');
  await expect(mark).toHaveCount(1);
  const band = await mark.boundingBox();
  await page.mouse.click(band.x + band.width / 2, band.y + band.height / 2);
  await expect(page.locator('[data-rest-toolbar]')).toBeVisible();
  return mark;
}

test('Pencil turns the mark into hatching inside its box, with no band under it', async ({ page }) => {
  const mark = await layMark(page);
  await expect(page.locator('[data-style-toggle] [role="radio"]:visible')).toHaveCount(2);
  await page.getByRole('button', { name: 'Opacity' }).click();
  const look = page.locator('[role="radiogroup"][aria-label="Stroke"]:visible');
  await expect(look.getByRole('radio')).toHaveCount(3);
  expect(await look.evaluate((group) => group.scrollWidth - group.clientWidth), 'the toggle does not overflow').toBeLessThanOrEqual(0);
  const pencil = look.getByRole('radio').nth(2);
  await expect(pencil).toHaveAccessibleName('Pencil');
  await pencil.click();
  await expect(pencil).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  const hatch = mark.locator('svg[data-highlight-hatch] path');
  await expect(hatch).toHaveCount(1);
  await expect(mark.locator('[data-highlight-band]')).toHaveCount(0);
  await expect(hatch).toHaveAttribute('stroke', /^#/);
  await expect.poll(async () => (await hatch.boundingBox())?.width ?? 0).toBeGreaterThan(0);
  const drawn = await hatch.boundingBox();
  const inner = await mark.boundingBox();
  // The pencil may wobble about 2-4pt past a band; the page is shown at about 2.3 px per pt.
  const slack = 10;
  expect(drawn.x).toBeGreaterThanOrEqual(inner.x - slack);
  expect(drawn.y).toBeGreaterThanOrEqual(inner.y - slack);
  expect(drawn.x + drawn.width).toBeLessThanOrEqual(inner.x + inner.width + slack);
  expect(drawn.y + drawn.height).toBeLessThanOrEqual(inner.y + inner.height + slack);
  // The mark is not open for a note, so it wears no outline.
  await expect(page.locator('[data-mark-outline]')).toHaveCount(0);
});
