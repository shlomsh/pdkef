import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// HERO-05: Sign and Redact take a file dropped anywhere on the window. With a
// document already open, a drop must go through the replace confirmation and
// never swap the file silently; a file the tool cannot open asks nothing.

const FIRST = readFileSync(new URL('../src/lib/__fixtures__/num-1.pdf', import.meta.url));
const SECOND = readFileSync(new URL('../src/lib/__fixtures__/num-2.pdf', import.meta.url));

async function openEditor(page, route) {
  await page.setViewportSize({ width: 1440, height: 820 });
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch { /* private mode */ }
  });
  await page.goto(route);
  await page.locator('astro-island:not([ssr]) [data-empty-state]').waitFor();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'first-doc.pdf',
    mimeType: 'application/pdf',
    buffer: FIRST,
  });
  const shell = page.locator('[data-tool-shell]');
  await expect(shell.getByText('first-doc.pdf')).toBeVisible();
  return shell;
}

// Dropped on the h1: outside the card, so only the window-level handler can take it.
async function dropOnHeading(page, { name, mimeType, bytes }) {
  const dataTransfer = await page.evaluateHandle(
    ([fileName, type, byteArray]) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(byteArray)], fileName, { type }));
      return transfer;
    },
    [name, mimeType, [...bytes]],
  );
  const heading = page.locator('h1').first();
  await heading.dispatchEvent('dragenter', { dataTransfer });
  await heading.dispatchEvent('drop', { dataTransfer });
}

for (const route of ['/sign/', '/redact/']) {
  test.describe(route, () => {
    test('a PDF dropped outside the card asks before replacing the open file', async ({ page }) => {
      const shell = await openEditor(page, route);
      await dropOnHeading(page, { name: 'second-doc.pdf', mimeType: 'application/pdf', bytes: SECOND });

      const dialog = page.getByRole('dialog', { name: 'Open a different file?' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('second-doc.pdf');
      // Nothing has changed yet.
      await expect(shell.getByText('first-doc.pdf')).toBeVisible();

      // The toolbar has a "Replace file" button too: confirm inside the dialog.
      await dialog.getByRole('button', { name: 'Replace file' }).click();
      await expect(dialog).toBeHidden();
      await expect(shell.getByText('second-doc.pdf')).toBeVisible();
    });

    test('Cancel keeps the open file', async ({ page }) => {
      const shell = await openEditor(page, route);
      await dropOnHeading(page, { name: 'second-doc.pdf', mimeType: 'application/pdf', bytes: SECOND });

      const dialog = page.getByRole('dialog', { name: 'Open a different file?' });
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
      await expect(shell.getByText('first-doc.pdf')).toBeVisible();
    });

    test('a dropped .txt opens no dialog and leaves the file alone', async ({ page }) => {
      const shell = await openEditor(page, route);
      await dropOnHeading(page, { name: 'notes.txt', mimeType: 'text/plain', bytes: Buffer.from('hello') });

      await expect(page.getByRole('dialog', { name: 'Open a different file?' })).toBeHidden();
      await expect(shell.getByText('first-doc.pdf')).toBeVisible();
    });
  });
}
