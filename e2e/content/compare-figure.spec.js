import { test, expect } from '@playwright/test';

// SEO-31's before/after figure (CompareFigure.astro) is static markup, not a
// Preact island - the whole point being that the SEO surface ships zero JS
// for it. Mirrors "redaction guide images load without page overflow on
// desktop and mobile" in ../tool-layout.spec.js: both images actually decode
// at their declared ratio and the page never overflows, plus two checks
// specific to a fixed-split figure rather than a plain <img> - the clipped
// "after" image occupies exactly the same box as the "before" image underneath
// it, and the page still carries no more <script> tags than any other content
// page (it must not have picked up CompareSlider's island by accident).
const PAGE = '/photo-and-signature-size-for-forms/';
const REFERENCE_PAGE = '/pdf-wont-compress-to-100kb/';

test('before/after figure loads at the right ratio without page overflow, on desktop and mobile', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    await page.goto(PAGE);

    const before = page.locator('.compare-figure-image:not(.compare-figure-after)').first();
    const after = page.locator('.compare-figure-after').first();
    await before.scrollIntoViewIfNeeded();

    await expect.poll(() => before.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect.poll(() => after.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

    for (const image of [before, after]) {
      const ratios = await image.evaluate((img) => ({
        expectedRatio: Number(img.getAttribute('width')) / Number(img.getAttribute('height')),
        actualRatio: img.naturalWidth / img.naturalHeight,
      }));
      expect(ratios.actualRatio).toBeCloseTo(ratios.expectedRatio, 2);
    }

    const [beforeBox, afterBox] = await Promise.all([before.boundingBox(), after.boundingBox()]);
    if (!beforeBox || !afterBox) {
      throw new Error(`${PAGE}: before/after image layout box is unavailable at ${width}px`);
    }
    expect(Math.abs(afterBox.x - beforeBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterBox.y - beforeBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterBox.width - beforeBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterBox.height - beforeBox.height)).toBeLessThanOrEqual(1);

    const pageOverflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(pageOverflows, `Page overflows the ${width}px viewport`).toBe(false);
  }
});

test('the figure ships no extra <script>, same count as any other content page', async ({ page }) => {
  await page.goto(PAGE);
  const figureScriptCount = await page.locator('script').count();

  await page.goto(REFERENCE_PAGE);
  const referenceScriptCount = await page.locator('script').count();

  expect(figureScriptCount).toBe(referenceScriptCount);
});
