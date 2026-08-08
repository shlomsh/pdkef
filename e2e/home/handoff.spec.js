import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/*
 * The home page's dropzone hands a dropped PDF to the Sign tool across a
 * navigation, by parking it in a one-shot handoff record (draftStore.saveHandoff)
 * that the tool collects on mount.
 *
 * It has to be proven here rather than in jsdom, for two independent reasons:
 * jsdom implements no IndexedDB at all, so the unit tests mock the whole store
 * and never exercise a real round trip; and jsdom cannot follow the navigation
 * the handoff exists to survive. Between them, the unit tests can show the right
 * calls being made and nothing more.
 *
 * What this guards is the bug it replaced. The dropped file used to be written
 * straight to the tool's own draft key, and because that store is keyed by tool
 * and saveDraft does a put(), one drop replaced a saved draft outright - source
 * bytes, annotations and all. The record it left behind had no fileBytes, so the
 * restore path skipped it and the dropped file was lost too. Both halves were
 * silent, which is why the third test below matters most: it declines the
 * confirmation and then checks the original draft is still there to be restored.
 */

async function makePdfBuffer(label) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.drawText(label, {
    x: 72,
    y: 700,
    size: 18,
    font: await doc.embedFont(StandardFonts.Helvetica),
    color: rgb(0.1, 0.1, 0.1),
  });
  return Buffer.from(await doc.save());
}

// Builds the File inside the page from a plain byte array. Deliberately not via
// `fetch('data:...')`, which the site's strict connect-src would block: the point
// of this test is the app's behaviour, not a CSP violation of the test's making.
async function dropOnHomeDropzone(page, { name, bytes }) {
  const dataTransfer = await page.evaluateHandle(
    ([fileName, byteArray]) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(byteArray)], fileName, { type: 'application/pdf' }),
      );
      return transfer;
    },
    [name, [...bytes]],
  );
  await page.locator('[class*="_dropzone_"]').first().dispatchEvent('drop', { dataTransfer });
}

// Writes a draft the way the Sign tool's autosave would, so the "there is
// something to lose" branch can be set up without driving a whole signing
// session first. Mirrors useDraftPersistence's buildRecord shape exactly - if
// that shape drifts, this seeds a record the tool will refuse to restore and the
// test says so rather than passing quietly.
async function seedSignDraft(page, { fileName, bytes }) {
  await page.evaluate(
    ([name, byteArray]) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('pdf-toolkit-drafts', 1);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('drafts')) {
            db.createObjectStore('drafts', { keyPath: 'tool' });
          }
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('drafts', 'readwrite');
          tx.objectStore('drafts').put({
            tool: 'sign',
            fileName: name,
            fileSize: byteArray.length,
            fileLastModified: Date.now(),
            fileType: 'application/pdf',
            fileBytes: new Uint8Array(byteArray).buffer,
            elements: [],
            extra: { actionHistory: [] },
            savedAt: Date.now(),
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [fileName, [...bytes]],
  );
}

const identity = (page) => page.locator('[class*="_identity_"]');

test.describe('home page hands a dropped PDF to the Sign tool', () => {
  test.beforeEach(async ({ page }) => {
    // Each case owns its storage; a handoff or draft left by the previous one
    // would decide the next one's outcome. Cleared once here via evaluate, and
    // deliberately NOT via addInitScript: that runs on every navigation, so it
    // would wipe the handoff again on the way into /sign - which is the one
    // moment this whole spec exists to observe.
    await page.goto('/');
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const request = indexedDB.deleteDatabase('pdf-toolkit-drafts');
          request.onsuccess = resolve;
          request.onerror = resolve;
          request.onblocked = resolve;
        }),
    );
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  });

  test('a dropped file survives the navigation and opens in the editor', async ({ page }) => {
    await dropOnHomeDropzone(page, {
      name: 'dropped-on-home.pdf',
      bytes: await makePdfBuffer('Dropped on the home page'),
    });

    await page.waitForURL('**/sign');
    await expect(page.locator('[role="toolbar"]')).toBeVisible();
    await expect(identity(page)).toContainText('dropped-on-home.pdf');
  });

  test('a drop that would discard a saved draft asks first, naming both files', async ({ page }) => {
    await seedSignDraft(page, {
      fileName: 'half-signed-lease.pdf',
      bytes: await makePdfBuffer('Lease'),
    });

    await dropOnHomeDropzone(page, {
      name: 'dropped-on-home.pdf',
      bytes: await makePdfBuffer('Dropped on the home page'),
    });

    const dialog = page.getByRole('dialog', { name: 'Open this instead?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('dropped-on-home.pdf');
    await expect(dialog).toContainText('half-signed-lease.pdf');
    // The question is asked before anything is written, so we are still here.
    expect(new URL(page.url()).pathname).toBe('/');

    await dialog.getByRole('button', { name: 'Open it', exact: true }).click();
    await page.waitForURL('**/sign');
    await expect(identity(page)).toContainText('dropped-on-home.pdf');
  });

  test('declining leaves the saved draft intact and restorable', async ({ page }) => {
    await seedSignDraft(page, {
      fileName: 'half-signed-lease.pdf',
      bytes: await makePdfBuffer('Lease'),
    });

    await dropOnHomeDropzone(page, {
      name: 'dropped-on-home.pdf',
      bytes: await makePdfBuffer('Dropped on the home page'),
    });

    const dialog = page.getByRole('dialog', { name: 'Open this instead?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(new URL(page.url()).pathname).toBe('/');

    // The whole point: the draft the user did not agree to lose is still the one
    // the Sign tool opens. Under the old code it had already been overwritten
    // before this dialog could even be rendered.
    await page.goto('/sign');
    await expect(identity(page)).toContainText('half-signed-lease.pdf');
  });
});
