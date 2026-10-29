import { test, expect } from '@playwright/test';
import { makePdfBuffer as buildPdf } from '../../../../e2e/support/pdf.js';
import { waitForIsland } from '../../../../e2e/support/tool.js';

// RED-66: the toolbar Download finishes where the person is looking. The strip
// hangs under the sticky toolbar card, so whether the result, both hand-offs and
// the rating ask are on screen after a click is real layout (the card's sticky
// offset, the strip's absolute placement, the phone toolbar's height), which
// jsdom cannot measure.

const makePdfBuffer = () => buildPdf(null, { title: false, pages: 2, lines: (i) => [{ text: `Done strip fixture, page ${i + 1}` }] });

async function openWithOneBox(page) {
  // A fresh device: the rating ask's 14-day cadence allows it.
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/redact');
  await waitForIsland(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'done-strip.pdf', mimeType: 'application/pdf', buffer: await makePdfBuffer() });
  await expect(page.locator('.redact-draw-area').first()).toBeVisible();

  await page.getByRole('toolbar', { name: 'PDF redaction' }).getByRole('button', { name: 'Blackout', exact: true }).click();
  const overlay = page.locator('.redact-draw-area').first();
  await overlay.scrollIntoViewIfNeeded();
  const area = await overlay.boundingBox();
  if (!area) throw new Error('PDF redaction overlay has no bounding box');
  await page.mouse.move(area.x + area.width * 0.3, area.y + area.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.6, area.y + area.height * 0.14, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[class*="redact-box"]')).toHaveCount(1);
}

async function expectInViewport(page, locator, what) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, `${what} has no box`).not.toBeNull();
  expect(box.y, `${what} starts above the viewport`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${what} ends below the viewport`).toBeLessThanOrEqual(viewport.height);
}

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`toolbar Download opens the done strip on screen at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openWithOneBox(page);

    // Mid-document, where a person finishing from the toolbar usually is.
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.redact-draw-area').getBoundingClientRect().top + window.scrollY + 300));
    const toolbar = page.getByRole('toolbar', { name: 'PDF redaction' });
    const download = page.waitForEvent('download');
    await toolbar.getByRole('button', { name: 'Download', exact: true }).click();
    await download;

    const strip = page.locator('[data-redact-done-strip]');
    await expect(strip).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Download', exact: true })).toContainText('Saved');
    await expect(strip.locator('[data-redact-done-result]')).toContainText('Saved');
    const rating = strip.getByText('a rating helps more people find it', { exact: false });
    await expect(rating).toBeVisible({ timeout: 5000 });

    await expectInViewport(page, strip.locator('[data-redact-done-result]'), 'the result');
    await expectInViewport(page, strip.getByRole('button', { name: /Compress it/ }), 'Compress it');
    await expectInViewport(page, strip.getByRole('button', { name: /Sign it/ }), 'Sign it');
    await expectInViewport(page, rating, 'the rating ask');
    const stripBox = await strip.boundingBox();
    const starsBox = await strip.getByRole('button').last().boundingBox();
    expect(starsBox.y + starsBox.height, 'the rating row spills out of the strip').toBeLessThanOrEqual(stripBox.y + stripBox.height);
    // One ask on the page, not one in the strip and another at the bottom.
    await expect(page.getByText('a rating helps more people find it', { exact: false })).toHaveCount(1);
    // The bottom row has no before-download caption once saved.
    await expect(page.locator('[data-redact-count]')).toHaveCount(0);

    await page.screenshot({ path: test.info().outputPath(`done-strip-${size.width}.png`) });

    await strip.getByRole('button', { name: 'Close' }).click();
    await expect(strip).toHaveCount(0);
  });
}
