import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/* Reopening your own document from the home page's recent-documents thumbnail
   must bring your work back with it.
 *
 * This is here because it once did not, and nothing noticed (2026-09-20: a
 * redacted document reopened from the thumbnail showed no boxes at all, while
 * the stored entry still held every one of them). Two suites each covered half
 * of it and the gap sat between them: `recent-files.spec.js` opens a tile but
 * only asserts the pointer and the URL, never the work, and the tools' own
 * `*-draft-restore.spec.js` restore real work but reach the editor directly,
 * with a comment saying they stand in for a pick "without going through the
 * home page". Neither one crossed the seam where the defect lived.
 *
 * So this asserts the whole path a person actually takes, end to end, against
 * what comes back on screen. It lives in `e2e/` rather than a tool's own
 * folder because it drives two routes (module-boundaries rule 7) and because
 * the contract belongs to the shell's recent tile, not to Redact - Redact is
 * only the tool whose work is easiest to count.
 *
 * The failure it guards against is silent and total: the entry keeps the work,
 * the pointer names it correctly, and the editor still opens empty. Assert on
 * rendered boxes, never on what the store holds, because the store was right
 * the whole time. */

test.use({ serviceWorkers: 'block' });

async function makePdfBuffer(label) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 72, y: 720, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Hide this: 1234-5678', { x: 72, y: 690, size: 12, font, color: rgb(0.25, 0.25, 0.25) });
  return Buffer.from(await doc.save());
}

async function drawRedaction(page, styleName, startRatio, endRatio) {
  const tool = page.getByRole('toolbar', { name: 'PDF redaction' }).getByRole('button', { name: styleName, exact: true });
  if ((await tool.getAttribute('aria-pressed')) !== 'true') await tool.click();
  await expect(tool).toHaveAttribute('aria-pressed', 'true');

  const overlay = page.locator('.redact-draw-area').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF redaction overlay has no bounding box');
  // Keep every point inside the visible half: a lower Y falls below the fold
  // at this viewport and the drag silently never lands, for any style.
  await page.mouse.move(box.x + box.width * startRatio.x, box.y + box.height * startRatio.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * endRatio.x, box.y + box.height * endRatio.y, { steps: 6 });
  await page.waitForTimeout(50);
  await page.mouse.up();
}

test('reopening a document from the home page thumbnail brings its work back', async ({ page }) => {
  const fileName = 'recent-tile-restore.pdf';

  await page.goto('/redact/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  (await fileChooserPromise).setFiles({
    name: fileName, mimeType: 'application/pdf', buffer: await makePdfBuffer('recent tile'),
  });
  await expect(page.locator('.redact-draw-area')).toBeVisible();

  // Two styles, because a restore that brought every box back as the same
  // type would pass a count of two.
  await drawRedaction(page, 'Blackout', { x: 0.12, y: 0.18 }, { x: 0.34, y: 0.24 });
  await drawRedaction(page, 'Blur', { x: 0.12, y: 0.30 }, { x: 0.34, y: 0.36 });
  await expect(page.locator('[class*="redact-box"]')).toHaveCount(2);
  await expect(page.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });

  await page.goto('/');
  const tile = page.getByRole('button', { name: new RegExp(`Open recent PDF, ${fileName.replace('.', '\\.')}`) });
  await expect(tile).toHaveCount(1);
  await tile.click();

  await page.waitForURL('**/redact/**', { timeout: 15_000 });
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(page.locator('[class*="redact-box"]')).toHaveCount(2, { timeout: 15_000 });

  const types = await page.evaluate(async () => {
    const rows = await new Promise((resolve) => {
      const request = indexedDB.open('pdf-toolkit-workspace', 1);
      request.onsuccess = () => {
        const db = request.result;
        const all = db.transaction('workspace', 'readonly').objectStore('workspace').getAll();
        all.onsuccess = () => { db.close(); resolve(all.result); };
      };
      request.onerror = () => resolve([]);
    });
    const entry = rows.find((row) => row.work?.redact?.elements?.length);
    return (entry?.work.redact.elements || []).map((element) => element.type).sort();
  });
  expect(types).toEqual(['blackout', 'blur']);
});
