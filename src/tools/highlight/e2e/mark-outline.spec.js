import { test, expect } from '@playwright/test';
import { openTool } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

/* READ-13: the open mark wears a pencil outline that follows its lines, no mark carries a CSS outline, and the other
   marks step back while one is open. jsdom applies no stylesheets and no layout, so the box, the computed style and the
   opacity are read here. */

test.use({ serviceWorkers: 'block' });

const LINES = [
  { text: 'A line of text a student would highlight', y: 700 },
  { text: 'A second line the mark runs down onto', y: 676 },
  { text: 'A separate line with a mark of its own', y: 600 },
];

async function layMarks(page) {
  const source = await makePdfBuffer(null, { title: false, lines: LINES });
  await openTool(page, '/highlight-pdf/', { file: { name: 'outline.pdf', buffer: source }, overlaySelector: '[data-page-overlay]' });
  const box = await page.locator('[data-page-overlay]').first().boundingBox();
  const at = (x, y) => ({ x: box.x + box.width * (x / 612), y: box.y + box.height * ((792 - y) / 792) });
  const swipe = async (from, to) => {
    const a = at(...from), b = at(...to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 });
    await page.mouse.up();
  };
  await swipe([72, 694], [330, 670]);
  await swipe([72, 594], [330, 594]);
  return page.locator('[data-page-overlay] [data-element-id]');
}

test('keyboard focus outlines the passage line by line, with no CSS outline, and the other marks step back', async ({ page }) => {
  const marks = await layMarks(page);
  await expect(marks).toHaveCount(2);
  const first = marks.first();
  await page.keyboard.press('Tab');
  await first.focus();

  const outline = first.locator('svg[data-mark-outline]');
  await expect(outline).toHaveCount(1);
  await expect(first).toHaveCSS('outline-style', 'none');

  // One outline whose box encloses every band of the passage (a little of the pencil's wobble allowed).
  await expect.poll(async () => (await outline.locator('path').boundingBox())?.width ?? 0).toBeGreaterThan(0);
  const drawn = await outline.locator('path').boundingBox();
  const bands = await first.locator('[data-highlight-band]').evaluateAll((nodes) => nodes.map((n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom }; }));
  expect(bands.length).toBeGreaterThan(1);
  const slack = 2;
  for (const band of bands) {
    expect(drawn.x).toBeLessThanOrEqual(band.x + slack);
    expect(drawn.y).toBeLessThanOrEqual(band.y + slack);
    expect(drawn.x + drawn.width).toBeGreaterThanOrEqual(band.r - slack);
    expect(drawn.y + drawn.height).toBeGreaterThanOrEqual(band.b - slack);
  }

  // The other mark's fill sits at about 55%; the open one stays at full.
  const root = (m) => m.locator('[data-highlight-root]');
  await expect(root(marks.nth(1))).toHaveCSS('opacity', '0.55');
  await expect(root(first)).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-mark-outline]')).toHaveCount(1);
});

test('reduced motion draws the outline whole, with no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const marks = await layMarks(page);
  await page.keyboard.press('Tab');
  await marks.first().focus();
  const path = marks.first().locator('svg[data-mark-outline] path');
  await expect(path).toHaveCount(1);
  await expect(path).toHaveCSS('animation-name', 'none');
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('the outline still encloses a multi-line passage', async ({ page }) => {
    const marks = await layMarks(page);
    await page.keyboard.press('Tab');
    await marks.first().focus();
    const path = marks.first().locator('svg[data-mark-outline] path');
    await expect(path).toHaveCount(1);
    const drawn = await path.boundingBox();
    const mark = await marks.first().boundingBox();
    expect(drawn.width).toBeGreaterThanOrEqual(mark.width);
    expect(drawn.height).toBeGreaterThanOrEqual(mark.height);
  });
});
