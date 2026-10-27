import { test, expect } from '@playwright/test';
import { waitForIsland } from '../support/tool.js';
import { makePdfBuffer } from '../support/pdf.js';

/* Shlomi 2026-10-21: under Sign's Download/Share pair, "Compress it" and
   "Redact it" show whenever export is ready (the same moment Download is
   enabled and something is placed), a restored draft included, and carry the
   signed file on without a download first. */

const makeFixture = () => makePdfBuffer(null, { size: [400, 500], title: false, lines: [{ text: 'Hand-off fixture', x: 40, y: 440, gray: null }] });

async function openAndWhiteout(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sign/?next=0');
  await waitForIsland(page);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-tool-shell], main').getByText(/Choose file/).first().click();
  await (await chooser).setFiles({ name: 'handoff.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });
  const pageArea = page.locator('[class*="page-wrapper"]').first();
  await expect(pageArea).toBeVisible();
  await page.locator('[role="toolbar"]').first().getByRole('button', { name: 'Whiteout', exact: true }).click();
  return pageArea;
}

async function dragBox(page, pageArea, from, to) {
  await pageArea.scrollIntoViewIfNeeded();
  const area = await pageArea.boundingBox();
  await page.mouse.move(area.x + area.width * from[0], area.y + area.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * to[0], area.y + area.height * to[1], { steps: 6 });
  await page.mouse.up();
}

test('Compress it and Redact it show once export is ready, and carry the file on without a download', async ({ page }) => {
  const pageArea = await openAndWhiteout(page);
  await expect(page.getByRole('button', { name: 'Compress it' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Redact it' })).toHaveCount(0);

  await dragBox(page, pageArea, [0.3, 0.3], [0.6, 0.4]);
  const compress = page.getByRole('button', { name: 'Compress it' });
  const redact = page.getByRole('button', { name: 'Redact it' });
  await expect(compress).toBeVisible();
  await expect(redact).toBeVisible();
  const [a, b] = [await compress.boundingBox(), await redact.boundingBox()];
  expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);

  await redact.click();
  await page.waitForURL(/\/redact\/$/);
  await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();
  await expect(page.getByText(/^signed_/).first()).toBeVisible();
});

test('a restored draft shows the hand-offs with no action', async ({ page }) => {
  const pageArea = await openAndWhiteout(page);
  await dragBox(page, pageArea, [0.3, 0.3], [0.6, 0.4]);
  await expect(page.getByRole('button', { name: 'Redact it' })).toBeVisible();

  // The draft save is debounced; reloading before it lands restores the file with no work on it,
  // where no chips is the right answer.
  await expect(page.getByText('Draft saved').first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Compress it' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Redact it' })).toBeVisible();
});
