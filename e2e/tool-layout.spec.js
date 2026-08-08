import { test, expect } from '@playwright/test';

const toolRoutes = [
  '/merge',
  '/split',
  '/compress',
  '/pdf-to-image',
  '/image-to-pdf',
  '/unlock',
  '/sign',
  '/redact',
  '/edit-pdf',
];

test('aligns every tool title row with its breadcrumb grid at desktop width', async ({ page }) => {
  for (const route of toolRoutes) {
    await page.goto(route);

    const breadcrumbBrand = page.locator('body > div > div > a');
    const titleRow = page.locator('header > div').first();
    const hero = page.locator('header');
    const breadcrumbGrid = page.locator('body > div > div');
    await expect(breadcrumbBrand, route).toBeVisible();
    await expect(titleRow, route).toBeVisible();

    const [brandBox, rowBox, heroBox, gridBox] = await Promise.all([
      breadcrumbBrand.boundingBox(),
      titleRow.boundingBox(),
      hero.boundingBox(),
      breadcrumbGrid.boundingBox(),
    ]);
    if (!brandBox || !rowBox || !heroBox || !gridBox) {
      throw new Error(`${route}: breadcrumb or hero layout box is unavailable`);
    }

    // Shared desktop grid: the hero and app bar occupy the same 1080px frame,
    // while the title row and breadcrumb brand start at the same 24px inset.
    expect(Math.abs(heroBox.x - gridBox.x), route).toBeLessThanOrEqual(1);
    expect(Math.abs(heroBox.width - gridBox.width), route).toBeLessThanOrEqual(1);
    expect(Math.abs(rowBox.x - brandBox.x), route).toBeLessThanOrEqual(1);
  }
});

// The hero icon tile is taller than the <h1>'s first line box, and several tool
// titles wrap to two or more lines, so the tile is centred on the FIRST line
// rather than on the whole title block. Only a real browser has line boxes:
// jsdom reports every rect as zero, and the regression this guards (the UA's
// `h1 { margin-block-start: 0.67em }` surviving because Tailwind's preflight is
// deliberately not imported) shifted the title down by 20.8px with no CSS of
// ours to point at. Range rects, not the <h1> box, isolate that first line.
test('centres each tool hero icon on the first line of its title', async ({ page }) => {
  for (const width of [1440, 1100, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of toolRoutes) {
      await page.goto(route);

      const measured = await page.evaluate(() => {
        const row = document.querySelector('header.tool-hero > div');
        const tile = row.firstElementChild.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(row.querySelector('h1'));
        const [firstLine] = range.getClientRects();
        return {
          lines: range.getClientRects().length,
          tileCentre: tile.top + tile.height / 2,
          lineCentre: firstLine.top + firstLine.height / 2,
        };
      });

      const where = `${route} @ ${width}px (${measured.lines} title line(s))`;
      expect(Math.abs(measured.tileCentre - measured.lineCentre), where).toBeLessThanOrEqual(1.5);
    }
  }
});
