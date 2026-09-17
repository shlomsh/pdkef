import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/* MEM-02: mirrors sign-draft-restore.spec.js - see its header comment for why
   this needs a real browser rather than jsdom, and for the shape of what it
   proves: (1) a closed tab resumes the same file with the same redaction
   boxes, and (2) Redact's "current file" is a per-tool pointer onto a shared
   memory space, so moving it to a second file and back leaves the first
   file's boxes exactly where they were - nothing was ever deleted, only the
   pointer moved. */
test.use({ serviceWorkers: 'block' });

async function makePdfBuffer(label) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 72, y: 720, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Hide this: 1234-5678', { x: 72, y: 690, size: 12, font, color: rgb(0.25, 0.25, 0.25) });
  return Buffer.from(await doc.save());
}

async function openRedactTool(page, buffer, fileName) {
  await page.addInitScript(() => { localStorage.clear(); });
  await page.goto('/redact/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: fileName, mimeType: 'application/pdf', buffer });
  await expect(page.locator('.redact-draw-area')).toBeVisible();
}

async function selectRedactStyle(page, name) {
  const tool = page.getByRole('toolbar', { name: 'PDF redaction' }).getByRole('button', { name, exact: true });
  if ((await tool.getAttribute('aria-pressed')) !== 'true') await tool.click();
  await expect(tool).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(50);
}

async function drawRedaction(page, styleName, startRatio, endRatio) {
  await selectRedactStyle(page, styleName);
  const overlay = page.locator('.redact-draw-area').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF redaction overlay has no bounding box');
  const startPoint = { x: box.x + box.width * startRatio.x, y: box.y + box.height * startRatio.y };
  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await expect(page.locator('.redact-drawing-preview')).toHaveCount(1);
  await page.mouse.move(box.x + box.width * endRatio.x, box.y + box.height * endRatio.y, { steps: 6 });
  await page.waitForTimeout(50);
  await page.mouse.up();
  await expect(page.locator('[class*="redact-box"]')).toHaveCount(1);
}

async function measureRestoreCls(page) {
  await page.addInitScript(() => {
    let cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    window.__savedWorkRestoreCls = () => cls;
  });
}

// Same idea as sign-draft-restore.spec.js's putSecondEntryOnPointer: writes a
// second, unrelated entry straight into the workspace store and points
// Redact at it, standing in for a manual pick of a different PDF without
// going through the home page (FileDropzone is MEM-03's territory this wave).
async function putSecondEntryOnPointer(page, buffer, fileName) {
  const base64 = buffer.toString('base64');
  return page.evaluate(async ({ base64, fileName }) => {
    const fileBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
    const id = `sha256:${'c'.repeat(64)}`;
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('pdf-toolkit-workspace', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('workspace')) db.createObjectStore('workspace', { keyPath: 'tool' });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put({
          tool: `recent:${id}`, id, fileName, fileType: 'application/pdf', fileBytes, savedAt: Date.now(), work: {},
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });
    localStorage.setItem('pdf-toolkit:workspace:current:redact', id);
    return id;
  }, { base64, fileName });
}

test('Redact resumes a closed tab\'s work, and moving the pointer to a second file and back leaves the first untouched', async ({ page, context }) => {
  const fileA = await makePdfBuffer('file A');
  await openRedactTool(page, fileA, 'redact-restore-a.pdf');
  await drawRedaction(page, 'Blackout', { x: 0.2, y: 0.3 }, { x: 0.5, y: 0.35 });
  await expect(page.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });

  const entryAId = await page.evaluate(() => localStorage.getItem('pdf-toolkit:workspace:current:redact'));
  expect(entryAId).toBeTruthy();

  await page.close();
  const reopened = await context.newPage();
  await reopened.setViewportSize({ width: 1440, height: 900 });
  await measureRestoreCls(reopened);
  await reopened.goto('/redact/');
  await reopened.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(reopened.locator('[class*="redact-box"]')).toHaveCount(1, { timeout: 10_000 });
  expect(await reopened.evaluate(() => window.__savedWorkRestoreCls())).toBeLessThanOrEqual(0.1);

  const fileB = await makePdfBuffer('file B');
  // Leave the editor first, as a person would (home page), so its pagehide
  // flush has already saved and re-pointed at the file it was showing before
  // the pointer moves: a save always points the tool at what it just saved.
  await reopened.goto('/');
  await putSecondEntryOnPointer(reopened, fileB, 'redact-restore-b.pdf');

  await reopened.goto('/redact/');
  await reopened.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(reopened.locator('.redact-draw-area')).toBeVisible({ timeout: 10_000 });
  await expect(reopened.locator('[class*="redact-box"]')).toHaveCount(0);

  await reopened.goto('/');
  await reopened.evaluate((id) => localStorage.setItem('pdf-toolkit:workspace:current:redact', id), entryAId);
  await reopened.goto('/redact/');
  await reopened.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(reopened.locator('[class*="redact-box"]')).toHaveCount(1, { timeout: 10_000 });
});
