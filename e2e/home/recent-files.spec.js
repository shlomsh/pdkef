import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

const fileName = 'תעודת זהות דיגיטלית - רקפת (2).pdf';

async function seedRecentFiles(page, entries) {
  await page.addInitScript((recentFiles) => {
    localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify(recentFiles));
  }, entries);
}

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

// Writes a full recents entry straight into IndexedDB, the shape MEM-01's
// draftStore.js itself writes (one record per content hash, `work` holding
// what each tool has done to it) - not the legacy per-tool draft shape
// e2e/home/handoff.spec.js's seedSignDraft still covers. Needs a live page
// (indexedDB has no addInitScript equivalent), so callers seed after the
// first goto and reload to pick it up, the same order handoff.spec.js uses.
// The tool that last touched an entry lives on the recency-index row, not on
// the entry itself (see draftStore.js's loadRecentFile), so this only writes
// the entry; callers seed the index row (and any pointer) separately.
async function seedEntry(page, { id, fileName: name, bytes, work = {} }) {
  await page.evaluate(
    ([entryId, fileNameField, byteArray, workField]) =>
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
            tool: `recent:${entryId}`,
            id: entryId,
            fileName: fileNameField,
            fileType: 'application/pdf',
            fileBytes: new Uint8Array(byteArray).buffer,
            savedAt: Date.now(),
            work: workField,
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [id, name, [...bytes], work],
  );
}

test.describe('home launcher shell', () => {
  // The dropzone and the recent-documents card used to be a client:only
  // island, so nothing inside #home-files existed until the Preact bundle had
  // loaded and they popped in after the page had painted. The shell is server
  // rendered now; running with JavaScript disabled is the only way to prove
  // the markup is in the document rather than merely quick to hydrate.
  test.use({ javaScriptEnabled: false });

  test('server-renders the picker and the starter document', async ({ page }) => {
    await page.goto('/');

    const launcher = page.locator('#home-files');
    await expect(launcher.getByText('Choose files', { exact: true })).toBeVisible();
    await expect(launcher.getByText('or drop PDFs here', { exact: true })).toBeVisible();
    await expect(launcher.getByRole('button', { name: /Open bundled sample PDF/ })).toBeVisible();
    await expect(launcher.locator('img')).toHaveAttribute('src', '/images/redaction-guide/sample-preview.jpg');
  });
});

test.describe('home recent files', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('renders one tile for one stored file through responsive layout changes', async ({ page }) => {
    await seedRecentFiles(page, [
      { id: 'sha256:identity-card', tool: 'sign', fileName, savedAt: Date.now() },
    ]);
    await page.goto('/');

    await expect(page.locator('#home-files li')).toHaveCount(1);
    await expect(page.locator('#home-files li')).toContainText(fileName);

    for (const width of [1024, 390, 1024, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator('#home-files li')).toHaveCount(1);
    }

    expect(await page.evaluate(() => ({
      roots: document.querySelectorAll('#home-files').length,
      islands: document.querySelectorAll('#home-files astro-island').length,
      lists: document.querySelectorAll('#home-files [data-home-recents] ul').length,
    }))).toEqual({ roots: 1, islands: 1, lists: 1 });
  });

  test('replaces the server-rendered starter card rather than appending to it', async ({ page }) => {
    // The server cannot know about localStorage, so it always renders the
    // starter document. If the client's first render read storage instead,
    // Preact would repair the mismatch by keeping the server's node and
    // appending its own - the duplicate-tile bug this suite exists for.
    await seedRecentFiles(page, [
      { id: 'sha256:identity-card', tool: 'sign', fileName, savedAt: Date.now() },
    ]);
    await page.goto('/');

    await expect(page.locator('#home-files li')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Open bundled sample PDF/ })).toHaveCount(0);
  });

  test('renders two cross-tool records once each', async ({ page }) => {
    const now = Date.now();
    await seedRecentFiles(page, [
      { id: 'sha256:signed', tool: 'sign', fileName, savedAt: now - 1 },
      { id: 'sha256:redacted', tool: 'redact', fileName, savedAt: now },
    ]);
    await page.goto('/');

    const recentFiles = page.locator('#home-files');
    await expect(recentFiles.locator('li')).toHaveCount(2);
    await expect(recentFiles.getByText('Sign & Fill PDF', { exact: true })).toHaveCount(1);
    await expect(recentFiles.getByText('Blur & Redact', { exact: true })).toHaveCount(1);
  });
});

// MEM-03: opening a recent tile never asks anything - once a tool's work
// lives on its own entry (MEM-01) rather than a fixed per-tool draft slot,
// a second file overwrites nothing. This is the one place that promise is
// proven end to end, IndexedDB and navigation included; jsdom cannot follow
// the navigation and the unit tests mock the store away entirely.
test.describe('opening a recent tile', () => {
  test('sets the tool pointer with no confirmation, and does not disturb the other tile', async ({ page }) => {
    const bytesA = await makePdfBuffer('A');
    const bytesB = await makePdfBuffer('B');
    await page.goto('/');

    // Entry A already carries Sign's work and is what Sign would resume from
    // if opened directly; entry B is an ordinary second file with no work on
    // it yet - opening either must still cost nothing to the other.
    await seedEntry(page, {
      id: 'sha256:entry-a',
      fileName: 'entry-a.pdf',
      bytes: bytesA,
      work: { sign: { elements: [], extra: {}, revision: 1, updatedAt: Date.now(), writerId: 'seed' } },
    });
    await seedEntry(page, { id: 'sha256:entry-b', fileName: 'entry-b.pdf', bytes: bytesB });
    await page.evaluate(([indexEntries, pointer]) => {
      localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify(indexEntries));
      localStorage.setItem('pdf-toolkit:workspace:current:sign', pointer);
    }, [
      [
        { id: 'sha256:entry-a', tool: 'sign', fileName: 'entry-a.pdf', savedAt: Date.now() - 60_000, hasWork: ['sign'] },
        { id: 'sha256:entry-b', tool: 'sign', fileName: 'entry-b.pdf', savedAt: Date.now() },
      ],
      'sha256:entry-a',
    ]);
    await page.reload();

    await page.getByRole('button', { name: /Open recent PDF, entry-b\.pdf/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.waitForURL('**/sign/');
    expect(await page.evaluate(() => localStorage.getItem('pdf-toolkit:workspace:current:sign')))
      .toBe('sha256:entry-b');

    // Back on the home page, A's own tile still opens A: the click above
    // moved the pointer to B, it never touched A's entry or its tile.
    await page.goto('/');
    await page.getByRole('button', { name: /Open recent PDF, entry-a\.pdf/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.waitForURL('**/sign/');
    expect(await page.evaluate(() => localStorage.getItem('pdf-toolkit:workspace:current:sign')))
      .toBe('sha256:entry-a');
  });
});
