import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* A hand-off must outlive its read (reported 2026-11-12: home practice form -> /sign/ -> empty Sign).
   The record used to be deleted before the PDF reached recents, so a reload in that window (a
   service-worker update, refresh, a discarded tab) ended on an empty page with the file gone.
   Red before the fix at 150-300 ms on a production build; jsdom cannot prove it because only a real
   reload interrupts a real IndexedDB write. */

const PDF = readFileSync(new URL('../../src/lib/__fixtures__/num-1.pdf', import.meta.url));
// The document itself, not the empty editor shell: a rendered page canvas.
const DOCUMENT_SHOWS = '[data-tool-loaded] canvas, [data-editor-workspace] canvas';

async function seedHandoff(page, tool) {
  await page.goto('/');
  await page.evaluate(async ({ tool, bytes }) => {
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('pdf-toolkit-workspace', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('workspace', { keyPath: 'tool' });
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put({
          tool: `handoff:${tool}`,
          fileName: 'practice.pdf',
          fileType: 'application/pdf',
          fileBytes: new Uint8Array(bytes).buffer,
          savedAt: Date.now(),
        });
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    sessionStorage.setItem(`pdkef:handoff-pending:${tool}`, '1');
  }, { tool, bytes: [...PDF] });
}

test.describe('hand-off survives a reload mid-arrival', () => {
  test.use({ serviceWorkers: 'block' });

  for (const delay of [0, 120, 200, 300, 500]) {
    test(`/sign/ reloaded ${delay} ms after arriving still shows the file`, async ({ page }) => {
      test.setTimeout(60_000);
      await seedHandoff(page, 'sign');
      await page.goto('/sign/', { waitUntil: 'commit' });
      // Land the reload inside the read-to-store window: wait on the page's own clock, not a sleep.
      await page.waitForFunction((ms) => performance.now() >= ms, delay);
      await page.reload();
      await expect(page.locator(DOCUMENT_SHOWS).first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('[data-handoff-pending]')).toHaveCount(0);
    });
  }
});
