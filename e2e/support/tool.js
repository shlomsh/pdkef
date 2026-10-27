// One tool-page opener for the e2e specs (ARCH-77).
import { expect } from '@playwright/test';

/**
 * Opens a tool route and waits for its island to hydrate.
 * @param {import('@playwright/test').Page} page
 * @param {string} route
 * @param {object} [opts]
 * @param {boolean} [opts.clearStorage]  Clear localStorage before the page loads.
 * @param {{ name: string, buffer: Buffer }} [opts.file]  Choose this PDF through the file chooser.
 * @param {string} [opts.overlaySelector]  Wait for this selector once the file is open.
 * @param {string} [opts.toolbarName]  Return the toolbar with this accessible name.
 * @param {boolean} [opts.expectToolbar]  Wait for any `[role="toolbar"]` to be visible.
 */
export async function openTool(page, route, { clearStorage = false, file, overlaySelector, toolbarName, expectToolbar = false } = {}) {
  if (clearStorage) {
    await page.addInitScript(() => { try { localStorage.clear(); } catch { /* private mode */ } });
  }
  await page.goto(route);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  if (file) {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Choose file', { exact: true }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({ name: file.name, mimeType: 'application/pdf', buffer: file.buffer });
  }
  if (overlaySelector) await page.locator(overlaySelector).first().waitFor();
  if (expectToolbar) await expect(page.locator('[role="toolbar"]')).toBeVisible();
  if (toolbarName) return page.getByRole('toolbar', { name: toolbarName });
  return undefined;
}
