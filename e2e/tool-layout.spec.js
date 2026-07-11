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
