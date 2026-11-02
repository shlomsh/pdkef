import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

/* A fixed floating panel inside a glass bar. WebKit makes an element with backdrop-filter or filter the containing
   block of its fixed descendants while floating-ui assumes it does not, so the glass pushed the phone's mark panel
   16 px right of its gutters on iOS. Only WebKit lays it out that way, so this runs in the webkit project. */

test.use({ serviceWorkers: 'block', isMobile: false, hasTouch: true, viewport: { width: 402, height: 874 } });

async function panelGutters(page, { lamp }) {
  const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'A line of text a student would highlight', y: 700 }] });
  await openTool(page, '/highlight-pdf/', { file: { name: 'gutters.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
  if (lamp) {
    await page.getByRole('button', { name: 'Full screen' }).first().tap();
    await expect(page.locator('[role="toolbar"][data-mode]')).toBeVisible();
  }
  const box = await page.locator('[data-page-overlay]').first().boundingBox();
  const y = box.y + box.height * ((792 - 694) / 792);
  await page.mouse.move(box.x + box.width * (72 / 612), y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (330 / 612), y, { steps: 8 });
  await page.mouse.up();
  const mark = page.locator('[data-page-overlay] [data-element-id]');
  await expect(mark).toHaveCount(1);
  const band = await mark.boundingBox();
  const row = page.locator('[data-marker-row]:visible');
  // As in mark-toolbar.spec.js: a tap the browser counts as a second click opens nothing, so it is tried again.
  await expect.poll(async () => {
    if (await row.count() === 0) await page.touchscreen.tap(band.x + band.width / 2, band.y + band.height / 2);
    return row.count();
  }, { intervals: [600] }).toBe(1);
  const gutters = () => page.evaluate(() => {
    const r = document.querySelector('[data-marker-row]').closest('[id]').getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(window.innerWidth - r.right) };
  });
  await expect.poll(gutters).toEqual({ left: 16, right: 16 });
  return gutters();
}

test('on a phone the mark panel keeps its 16 px gutters inside the glass editor card', async ({ page }) => {
  const { left, right } = await panelGutters(page, { lamp: false });
  expect(left).toBeCloseTo(16, 0);
  expect(right).toBeCloseTo(16, 0);
});

/* The capsule fades its buttons with a filter while it dozes, and a filter is a containing block in WebKit too. */
test('in the Reading lamp the mark panel keeps the same gutters under the capsule', async ({ page }) => {
  const { left, right } = await panelGutters(page, { lamp: true });
  expect(left).toBeCloseTo(16, 0);
  expect(right).toBeCloseTo(16, 0);
});
