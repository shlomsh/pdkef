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
 * restore path skipped it and the dropped file was lost too.
 *
 * MEM-03 (2026-09-15): the "Open this instead?" confirmation this file used to
 * cover on the second and third tests is gone. Once a tool's work lives on its
 * own recents entry rather than a fixed per-tool draft slot (MEM-01), opening a
 * different file overwrites nothing, so there is nothing left to ask about -
 * the replaced file becomes its own tile instead. The second test below now
 * proves that directly: a drop hands off with no dialog, and the file it
 * replaced is still there afterward, not lost the way the original bug lost it.
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

/* Two structural locators, because the home page's dropzone was rebuilt and
 * they are no longer the same element.
 *
 * The drop is handled on [data-working-area] - the whole first-screen scene -
 * rather than on the picker control, so a file can be dropped anywhere on it.
 * And the hydration marker has to be something the island *renders*, not
 * something the page ships: [data-working-area] is server-rendered markup, so
 * waiting for it would prove nothing. [data-home-picker] is inside the
 * client:only island, so it exists only once that island has rendered.
 *
 * Both were previously one locator on a CSS-module class substring
 * (`_dropzone_`), which the rebuild removed - that class now belongs only to
 * the tool pages' own dropzone. The spec then timed out in its own beforeEach
 * with nothing naming the cause. */
const picker = (page) => page.locator('[data-home-picker]').first();
const dropArea = (page) => page.locator('[data-working-area]').first();

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
  await dropArea(page).dispatchEvent('drop', { dataTransfer });
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
        const open = indexedDB.open('pdf-toolkit-workspace', 1);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('workspace')) {
            db.createObjectStore('workspace', { keyPath: 'tool' });
          }
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put({
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
          const request = indexedDB.deleteDatabase('pdf-toolkit-workspace');
          request.onsuccess = resolve;
          request.onerror = resolve;
          request.onblocked = resolve;
        }),
    );
    // Hydration wait, written against what the island *renders* rather than how
    // it is directed to hydrate. The home page's launcher is `client:only`
    // (it reads the local draft hint synchronously, so there is nothing worth
    // server-rendering), which means the `astro-island[client="load"]:not([ssr])`
    // selector every tool-page spec uses never matches here - it matched once,
    // then the directive changed and this whole file started timing out in the
    // hook. The picker only exists once the island has rendered client-side, so
    // waiting for it proves the same thing and survives the next directive
    // change.
    await picker(page).waitFor();
    // The picker proves the island rendered; the drop listener is registered in
    // an effect on the same component, which Preact runs a paint later. With
    // parallel workers loading the CPU, that gap outlasted the seed and the
    // drop below, and the drop landed on nothing. So probe for the listener
    // itself: it marks the area with data-drag-over on a Files dragover.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const area = document.querySelector('[data-working-area]');
          const transfer = new DataTransfer();
          transfer.items.add(new File([''], 'probe.pdf', { type: 'application/pdf' }));
          area.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }));
          const attached = 'dragOver' in area.dataset;
          delete area.dataset.dragOver;
          return attached;
        }),
      )
      .toBe(true);
  });

  test('a dropped file survives the navigation and opens in the editor', async ({ page }) => {
    await dropOnHomeDropzone(page, {
      name: 'dropped-on-home.pdf',
      bytes: await makePdfBuffer('Dropped on the home page'),
    });

    // '/sign/' with the slash: that is the canonical URL this site serves (see
    // CLAUDE.md, URL canonicalization), and the handoff now navigates straight
    // to it instead of to '/sign' and taking a 308 hop on the way. The glob
    // '**/sign' does not match '/sign/', so these waits timed out on a
    // navigation that had already happened - the log even said so.
    await page.waitForURL('**/sign/');
    await expect(page.locator('[role="toolbar"]')).toBeVisible();
    await expect(identity(page)).toContainText('dropped-on-home.pdf');
  });

  test('a drop that would replace a saved draft hands off with no confirmation, and the replaced file stays in recents', async ({ page }) => {
    await seedSignDraft(page, {
      fileName: 'half-signed-lease.pdf',
      bytes: await makePdfBuffer('Lease'),
    });

    await dropOnHomeDropzone(page, {
      name: 'dropped-on-home.pdf',
      bytes: await makePdfBuffer('Dropped on the home page'),
    });

    // MEM-03: no warning, ever - the dropped file hands off straight away.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // '/sign/' with the slash: that is the canonical URL this site serves (see
    // CLAUDE.md, URL canonicalization), and the handoff now navigates straight
    // to it instead of to '/sign' and taking a 308 hop on the way. The glob
    // '**/sign' does not match '/sign/', so these waits timed out on a
    // navigation that had already happened - the log even said so.
    await page.waitForURL('**/sign/');
    await expect(identity(page)).toContainText('dropped-on-home.pdf');

    // The whole point: the file this replaced is not gone. MEM-01 folds a
    // legacy per-tool draft into the shared recents entry on first access, so
    // it shows up back on the home page as its own tile, still there to
    // resume - not silently destroyed the way the original bug destroyed it.
    // That first access is the tool's own fire-and-forget cacheRecentFile
    // (after a dynamic import and a page render), so wait for the migrated
    // row to reach the recents index before leaving the page.
    await page.waitForFunction(() => {
      try {
        return (localStorage.getItem('pdf-toolkit:workspace:recent-files') || '').includes('half-signed-lease.pdf');
      } catch {
        return false;
      }
    });
    await page.goto('/');
    await expect(page.locator('#home-files li').filter({ hasText: 'half-signed-lease.pdf' })).toHaveCount(1);
  });
});
