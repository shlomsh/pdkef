import { test, expect } from '@playwright/test';
import { waitForIsland } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

/**
 * SIGN-43 (backlog/tasks/SIGN-43.md): Rotate is Sign's alone. Redact shares the editor's page header,
 * so this keeps the button from reaching it.
 */
test.use({ serviceWorkers: 'block' });

test('Redact\'s page header has no Rotate button', async ({ page }) => {
  await page.goto('/redact/?next=0');
  await waitForIsland(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'plain.pdf', mimeType: 'application/pdf', buffer: await makePdfBuffer('plain', { lines: [{ text: 'Plain' }] }) });
  await expect(page.locator('[data-editor-page-header]').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rotate', exact: true })).toHaveCount(0);
});
