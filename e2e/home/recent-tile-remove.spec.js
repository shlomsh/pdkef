import { test, expect } from '@playwright/test';
import { makePdfBuffer as buildPdf } from '../support/pdf.js';
import { waitForIsland } from '../support/tool.js';

/* MEM-30 (GitHub issue 44): a person can take a file back off their device from
 * its recent tile. Crosses two routes for the same reason as
 * recent-tile-restores-work.spec.js, and asserts on what a person sees after a
 * reload: the tile stays gone, and the tool opens empty rather than with the work. */

test.use({ serviceWorkers: 'block' });

const FILE_NAME = 'recent-tile-remove.pdf';

async function drawRedaction(page) {
  const tool = page.getByRole('toolbar', { name: 'PDF redaction' }).getByRole('button', { name: 'Blackout', exact: true });
  if ((await tool.getAttribute('aria-pressed')) !== 'true') await tool.click();
  const overlay = page.locator('.redact-draw-area').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF redaction overlay has no bounding box');
  await page.mouse.move(box.x + box.width * 0.12, box.y + box.height * 0.18);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.34, box.y + box.height * 0.24, { steps: 6 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.mouse.up();
}

async function openWithWork(page) {
  await page.goto('/redact/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForIsland(page);
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  (await fileChooserPromise).setFiles({
    name: FILE_NAME, mimeType: 'application/pdf',
    buffer: await buildPdf('remove me', { title: false, lines: [{ text: 'remove me' }] }),
  });
  await expect(page.locator('.redact-draw-area')).toBeVisible();
  await drawRedaction(page);
  await expect(page.locator('[class*="redact-box"]')).toHaveCount(1);
  await expect(page.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });
}

async function removeFromHome(page) {
  await page.getByRole('button', { name: `Remove ${FILE_NAME} from recent files` }).click();
  await page.getByRole('dialog', { name: 'Remove this file?' }).getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('button', { name: `Open recent PDF, ${FILE_NAME}` })).toHaveCount(0);
}

test('a tab with the file open empties when it is removed, and cannot write it back', async ({ page, context }) => {
  await openWithWork(page);

  const home = await context.newPage();
  await home.goto('/');
  await waitForIsland(home);
  await removeFromHome(home);

  await expect(page.getByText('Choose file', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[class*="redact-box"]')).toHaveCount(0);

  await home.reload();
  await waitForIsland(home);
  await expect(home.getByRole('button', { name: `Open recent PDF, ${FILE_NAME}` })).toHaveCount(0);
});

test('going Back to the tool after removing its file shows it empty', async ({ page }) => {
  await openWithWork(page);
  await page.goto('/');
  await waitForIsland(page);
  await removeFromHome(page);

  await page.goBack();
  await expect(page.getByText('Choose file', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[class*="redact-box"]')).toHaveCount(0);
});

test('removing a file from its tile takes it and its work off the device', async ({ page }) => {
  await openWithWork(page);
  // The content hash, so the sweep below can look for the file's id as well as its name.
  const entryId = await page.evaluate(() => localStorage.getItem('pdf-toolkit:workspace:current:redact'));
  expect(entryId).toBeTruthy();

  await page.goto('/');
  await waitForIsland(page);
  const open = page.getByRole('button', { name: `Open recent PDF, ${FILE_NAME}` });
  await expect(open).toHaveCount(1);

  // Keyboard, so a control only a mouse can reveal fails here.
  const remove = page.getByRole('button', { name: `Remove ${FILE_NAME} from recent files` });
  await remove.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Remove this file?' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(open).toHaveCount(0);
  await expect(page.locator('[data-home-picker]').first()).toBeFocused();

  await page.reload();
  await waitForIsland(page);
  await expect(open).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Open bundled sample PDF/ })).toBeVisible();

  await page.goto('/redact/');
  await waitForIsland(page);
  await expect(page.getByText('Choose file', { exact: true })).toBeVisible();
  await expect(page.locator('[class*="redact-box"]')).toHaveCount(0);

  const left = await page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('pdf-toolkit-workspace', 1);
    request.onsuccess = () => {
      const db = request.result;
      const keys = db.transaction('workspace', 'readonly').objectStore('workspace').getAllKeys();
      keys.onsuccess = () => { db.close(); resolve(keys.result); };
    };
    request.onerror = () => resolve(null);
  }));
  expect(left).toEqual([]);

  // Nothing else on the device may still name the file, whatever key it sits under.
  const stored = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
  expect(stored).not.toContain(FILE_NAME);
  expect(stored).not.toContain(entryId);
});
