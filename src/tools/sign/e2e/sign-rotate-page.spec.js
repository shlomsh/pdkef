import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { waitForIsland } from '../../../../e2e/support/tool.js';
import { makePdfBuffer } from '../../../../e2e/support/pdf.js';

/**
 * SIGN-43 (backlog/tasks/SIGN-43.md): Rotate in the page header turns that page a
 * quarter turn clockwise, on screen and in the export, and every mark stays on the
 * same printed content. jsdom has no canvas pixels, no layout and no real download
 * or IndexedDB reload, so the whole claim is proved here once, in the browser.
 */
test.use({ serviceWorkers: 'block' });

const toolbar = (page) => page.getByRole('toolbar', { name: 'PDF annotations' });
const wrapper = (page) => page.locator('[class*="page-wrapper"]').first();
const mark = (page) => page.locator('[data-editor-element]').first();

async function openSign(page, buffer) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('rotate-cleared')) return;
    localStorage.clear();
    sessionStorage.setItem('rotate-cleared', '1');
  });
  await page.goto('/sign/?next=0');
  await waitForIsland(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  await (await chooser).setFiles({ name: 'rotate.pdf', mimeType: 'application/pdf', buffer });
  await expect(wrapper(page)).toBeVisible();
}

/** The printed word's ink box on the page canvas, and the mark's box, both as
 * fractions of the page wrapper, so a turn is comparable at any rendered size. */
async function measure(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector('[class*="page-wrapper"]');
    const canvas = wrap.querySelector('canvas');
    const w = wrap.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let x0 = canvas.width, y0 = canvas.height, x1 = -1, y1 = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const i = (y * canvas.width + x) * 4;
        if (data[i + 3] > 0 && data[i] < 110 && data[i + 1] < 110 && data[i + 2] < 110) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    const ink = { cx: (x0 + x1) / 2 / canvas.width, cy: (y0 + y1) / 2 / canvas.height };
    const m = document.querySelector('[data-editor-element]')?.getBoundingClientRect();
    return {
      width: w.width, height: w.height, ink,
      mark: m && { cx: (m.x + m.width / 2 - w.x) / w.width, cy: (m.y + m.height / 2 - w.y) / w.height },
    };
  });
}

test('Rotate turns the page on screen and in the export; marks stay on their content', async ({ page }) => {
  const source = await makePdfBuffer(null, { title: false, lines: [{ text: 'ROTATEME', x: 72, y: 700, size: 30, gray: 0 }] });
  const sourceRotate = (await PDFDocument.load(source)).getPage(0).getRotation().angle;
  await openSign(page, source);
  await expect.poll(async () => (await measure(page)).ink.cx).toBeGreaterThan(0);

  // A covering mark dragged over the printed word.
  const before0 = await measure(page);
  expect(before0.height).toBeGreaterThan(before0.width);
  const whiteout = toolbar(page).getByRole('button', { name: 'Whiteout', exact: true });
  await whiteout.click();
  // The drag must not start before the tool reads as armed (a nightly repeat lost that race).
  await expect(whiteout).toHaveAttribute('aria-pressed', 'true');
  const box = await wrapper(page).boundingBox();
  const { cx, cy } = before0.ink;
  await page.mouse.move(box.x + box.width * (cx - 0.1), box.y + box.height * (cy - 0.02));
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (cx + 0.1), box.y + box.height * (cy + 0.02), { steps: 6 });
  await page.mouse.up();
  await expect(mark(page)).toBeVisible();
  const before = await measure(page);
  expect(Math.abs(before.mark.cx - before.ink.cx)).toBeLessThan(0.03);
  expect(Math.abs(before.mark.cy - before.ink.cy)).toBeLessThan(0.03);

  // Rotate: landscape, and the mark still sits on the word (clockwise: (x,y) -> (1-y, x)).
  await page.getByRole('button', { name: 'Rotate', exact: true }).first().click();
  await expect.poll(async () => { const m = await measure(page); return m.width > m.height; }).toBe(true);
  const turned = await measure(page);
  expect(Math.abs(turned.ink.cx - (1 - before.ink.cy))).toBeLessThan(0.03);
  expect(Math.abs(turned.ink.cy - before.ink.cx)).toBeLessThan(0.03);
  expect(Math.abs(turned.mark.cx - turned.ink.cx)).toBeLessThan(0.03);
  expect(Math.abs(turned.mark.cy - turned.ink.cy)).toBeLessThan(0.03);

  // Undo is one step back to portrait with the mark where it was.
  await toolbar(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => { const m = await measure(page); return m.height > m.width; }).toBe(true);
  const undone = await measure(page);
  expect(Math.abs(undone.mark.cx - before.mark.cx)).toBeLessThan(0.03);
  expect(Math.abs(undone.mark.cy - before.mark.cy)).toBeLessThan(0.03);

  // Turn again; a reload (draft restore) brings the page back turned, mark on the word.
  await page.getByRole('button', { name: 'Rotate', exact: true }).first().click();
  await expect.poll(async () => { const m = await measure(page); return m.width > m.height; }).toBe(true);
  await expect(page.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await waitForIsland(page);
  await expect(mark(page)).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => { const m = await measure(page); return m.width > m.height; }).toBe(true);
  const restored = await measure(page);
  expect(Math.abs(restored.mark.cx - restored.ink.cx)).toBeLessThan(0.03);
  expect(Math.abs(restored.mark.cy - restored.ink.cy)).toBeLessThan(0.03);

  // The export opens turned by exactly one more quarter turn.
  const download = page.locator('[class*="export-actions"]').last().getByRole('button', { name: 'Download' });
  await download.scrollIntoViewIfNeeded();
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  const out = await PDFDocument.load(fs.readFileSync(await file.path()));
  expect(out.getPage(0).getRotation().angle).toBe((sourceRotate + 90) % 360);
});
