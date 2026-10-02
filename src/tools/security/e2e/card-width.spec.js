import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

/* The Unlock/Protect card used to shrink-wrap to its content on a phone: 219px after picking a plain
   PDF (protect), 249px after Protect PDF, while unlock mode with its next-steps row filled the width
   (342px at 375). `.tool-card` only had `width: 100%` from 768px up, so a card whose children are all
   narrow (a 360px-capped form, one line of text) sized to them. The card must be the same width in
   every state; unlock mode with a file picked is the reference. */

const NEEDS_PASSWORD = readFileSync(new URL('../../../lib/__fixtures__/encrypted/needs-password.pdf', import.meta.url));

async function plainPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

async function openAndPick(page, name, buffer) {
  await page.goto('/unlock/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name, mimeType: 'application/pdf', buffer });
}

const shellWidth = (page) => page.locator('[data-tool-shell]').evaluate((el) => el.getBoundingClientRect().width);

test('the card is full width at 375 in every Unlock and Protect state', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.clear());
  const widths = {};

  await openAndPick(page, 'locked.pdf', NEEDS_PASSWORD);
  await expect(page.getByLabel('PDF password')).toBeVisible({ timeout: 10_000 });
  widths['unlock picked'] = await shellWidth(page);

  await page.getByLabel('PDF password').fill('not-it');
  await page.getByRole('button', { name: 'Unlock PDF' }).click();
  await expect(page.getByText('The password may be incorrect.')).toBeVisible();
  widths['unlock error'] = await shellWidth(page);

  await page.getByLabel('PDF password').fill('u');
  await page.getByRole('button', { name: 'Unlock PDF' }).click();
  await expect(page.getByRole('link', { name: /Download Unlocked PDF/ })).toBeVisible({ timeout: 10_000 });
  widths['unlock done'] = await shellWidth(page);

  await openAndPick(page, 'plain.pdf', await plainPdf());
  await expect(page.getByLabel('Set Password')).toBeVisible({ timeout: 10_000 });
  widths['protect picked'] = await shellWidth(page);

  await page.getByLabel('Set Password').fill('secret');
  await page.getByRole('button', { name: 'Protect PDF' }).click();
  await expect(page.getByRole('link', { name: /Download Protected PDF/ })).toBeVisible({ timeout: 10_000 });
  widths['protect done'] = await shellWidth(page);

  // Full width means the shell fills what #app offers inside the card's own padding and border.
  // (The unlock done state's width is content-dependent on a short file name, so it is not the yardstick.)
  const available = await page.locator('#app').evaluate((app) => {
    const card = app.querySelector('[data-tool-shell]').parentElement;
    const style = getComputedStyle(card);
    const inset = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    return app.getBoundingClientRect().width - inset;
  });
  expect(available).toBeGreaterThan(250);
  for (const [state, width] of Object.entries(widths)) {
    expect(Math.abs(width - available), `${state}: ${width}px against ${available}px`).toBeLessThanOrEqual(1);
  }
});
