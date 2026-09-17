import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/* MEM-02: the tool-side half of the one-memory-space rewrite (MEM-01). Two
   things this guard proves that no unit test can (jsdom has no real
   IndexedDB/localStorage-across-navigations story, and the mocked-store unit
   tests in useDraftPersistence.test.jsx and useEditorDraftPersistence.test.tsx
   only prove the hook calls the right functions, not that a real browser
   round-trips them across a closed tab):

   1. Closing the tab and opening /sign/ fresh resumes the same file with the
      same edits - the actual crash-recovery promise, not a mock of it.
   2. Sign's "current file" is a per-tool pointer onto a shared memory space,
      not a fixed slot: moving the pointer to a second file and back brings
      the first file's work back untouched, because nothing was ever deleted
      from it - only the pointer moved.

   Fetches more than one dynamically-served asset across the reload
   (pdf.js's worker, in particular), so service workers are blocked, the same
   reasoning merge-restore.spec.js documents for its own reload. */
test.use({ serviceWorkers: 'block' });

async function makePdfBuffer(label) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 72, y: 720, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
  return Buffer.from(await doc.save());
}

async function openSignTool(page, buffer, fileName) {
  await page.addInitScript(() => { localStorage.clear(); });
  await page.goto('/sign/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: fileName, mimeType: 'application/pdf', buffer });
  await expect(page.locator('[class*="page-overlay"]')).toBeVisible();
}

async function addText(page, text, xRatio, yRatio) {
  const textTool = page.getByRole('toolbar', { name: 'PDF annotations' }).getByRole('button', { name: 'Text', exact: true });
  if ((await textTool.getAttribute('aria-pressed')) !== 'true') await textTool.click();
  const overlay = page.locator('[class*="page-overlay"]').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF overlay has no bounding box');
  await overlay.click({ position: { x: box.width * xRatio, y: box.height * yRatio } });
  const input = page.locator('[data-editor-element][data-editor-active] [data-editor-text-input]');
  await expect(input).toBeVisible();
  await input.fill(text);
  await expect(input).toHaveValue(text);
}

async function measureRestoreCls(page) {
  await page.addInitScript(() => {
    let cls = 0;
    const followupTrace = [];
    let framesRemaining = 180;
    const sample = () => {
      const followups = document.querySelector('[data-tool-followups]');
      if (followups) {
        followupTrace.push({
          visible: getComputedStyle(followups).visibility === 'visible',
          editorReady: Boolean(document.querySelector('[data-tool-shell]')),
        });
      }
      if (framesRemaining-- > 0) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    window.__savedWorkRestoreCls = () => cls;
    window.__savedWorkFollowupTrace = () => followupTrace;
  });
}

// Writes a second, unrelated entry straight into the workspace store and
// points Sign at it - the equivalent of a manual pick of a different PDF,
// done through the store directly (page.evaluate) rather than through the
// home page, which MEM-03 is changing in this same wave. The id is an
// arbitrary placeholder, the same way draftStore.test.js's own putRawRecord
// helper uses one: nothing on the read path re-hashes a stored record's
// bytes to check its id, so this is a faithful stand-in for "a second file
// is already on the pointer" without needing the real content hash.
async function putSecondEntryOnPointer(page, buffer, fileName) {
  const base64 = buffer.toString('base64');
  return page.evaluate(async ({ base64, fileName }) => {
    const fileBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
    const id = `sha256:${'b'.repeat(64)}`;
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
    localStorage.setItem('pdf-toolkit:workspace:current:sign', id);
    return id;
  }, { base64, fileName });
}

test('Sign resumes a closed tab\'s work, and moving the pointer to a second file and back leaves the first untouched', async ({ page, context }) => {
  const fileA = await makePdfBuffer('file A');
  await openSignTool(page, fileA, 'sign-restore-a.pdf');
  await addText(page, 'signed by A', 0.3, 0.3);
  await expect(page.locator('[data-tool-shell]').getByText('Draft saved')).toBeVisible({ timeout: 10_000 });

  // The real content-addressed pointer, captured before anything else moves it.
  const entryAId = await page.evaluate(() => localStorage.getItem('pdf-toolkit:workspace:current:sign'));
  expect(entryAId).toBeTruthy();
  // Returning users can choose Relaxed. The pre-paint reservation must cover
  // that preference too, even though the hero itself stays expanded.
  await page.evaluate(() => localStorage.setItem('pdf-toolkit:view-density', 'relaxed'));

  await page.close();
  const reopened = await context.newPage();
  await reopened.setViewportSize({ width: 900, height: 900 });
  await measureRestoreCls(reopened);
  await reopened.goto('/sign/');
  await reopened.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(reopened.locator('[data-editor-text-input]')).toHaveValue('signed by A', { timeout: 10_000 });
  await expect(reopened.locator('html')).toHaveAttribute('data-view-density', 'relaxed');
  await expect(reopened.locator('html')).toHaveAttribute('data-draft-hint', '1');
  expect(await reopened.evaluate(() => window.__savedWorkFollowupTrace()
    .some(({ visible, editorReady }) => visible && !editorReady))).toBe(false);
  expect(await reopened.evaluate(() => window.__savedWorkRestoreCls())).toBeLessThanOrEqual(0.1);

  // Put a second, distinct file on the pointer directly through the store.
  const fileB = await makePdfBuffer('file B');
  // Leave the editor first, as a person would (home page), so its pagehide
  // flush has already saved and re-pointed at the file it was showing before
  // the pointer moves: a save always points the tool at what it just saved.
  await reopened.goto('/');
  await putSecondEntryOnPointer(reopened, fileB, 'sign-restore-b.pdf');

  await reopened.goto('/sign/');
  await reopened.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(reopened.locator('[class*="page-overlay"]')).toBeVisible({ timeout: 10_000 });
  // B has no work of its own on this entry - nothing restores onto it.
  await expect(reopened.locator('[data-editor-element]')).toHaveCount(0);

  // Move the pointer back to A - exactly what clicking A's tile on the home
  // page does under the hood (setCurrentEntry) - and confirm A's text is
  // back: opening B never touched it.
  await reopened.goto('/');
  await reopened.evaluate((id) => localStorage.setItem('pdf-toolkit:workspace:current:sign', id), entryAId);
  await reopened.goto('/sign/');
  await reopened.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(reopened.locator('[data-editor-text-input]')).toHaveValue('signed by A', { timeout: 10_000 });
});

test('Sign ignores a stale saved-work pointer before its first paint', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await measureRestoreCls(page);
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('pdf-toolkit:workspace:current:sign', 'sha256:stale');
  });

  await page.goto('/sign/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await expect(page.getByText('Choose file', { exact: true })).toBeVisible();
  // A pointer without a matching recent-file index row cannot restore. Do not
  // reserve a viewport first and collapse it after hydration.
  await expect(page.locator('html')).not.toHaveAttribute('data-draft-hint');
  expect(await page.evaluate(() => window.__savedWorkRestoreCls())).toBeLessThanOrEqual(0.1);
});
