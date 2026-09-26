import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/*
 * The ordinary Sign draft-restore spec proves that a small document can round
 * trip. This is intentionally a separate acceptance guard for the regression
 * that only became apparent with a long saved document: the pre-paint shell
 * must already have the restored geometry, and a restore must not masquerade
 * as an edit by scheduling a new autosave.
 */
test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 120_000 });

const RESTORE_CASES = [
  { name: 'wide condensed desktop', viewport: { width: 1512, height: 900 } },
  { name: '900px compact desktop', viewport: { width: 900, height: 900 } },
  // At phone widths the density control is intentionally absent, but the
  // first-paint restore hint still owns the compact hero state.
  { name: 'mobile', viewport: { width: 390, height: 844 } },
];

async function makeLongPdfBuffer() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let pageIndex = 0; pageIndex < 77; pageIndex += 1) {
    const page = document.addPage([612, 792]);
    page.drawText(`Saved work acceptance page ${pageIndex + 1}`, {
      x: 72,
      y: 720,
      size: 16,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  return Buffer.from(await document.save());
}

async function openSignTool(page, buffer) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/sign/?next=0');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: '77-page-saved-work.pdf',
    mimeType: 'application/pdf',
    buffer,
  });
  await expect(page.locator('[class*="page-overlay"]').first()).toBeVisible();
}

async function addText(page, text, xRatio = 0.3, yRatio = 0.3) {
  const textTool = page.getByRole('toolbar', { name: 'PDF annotations' })
    .getByRole('button', { name: 'Text', exact: true });
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

// The saved work's revision is authoritative: cacheRecentFile is allowed to
// refresh recency metadata while a PDF opens, but only saveDraft increments
// this revision or changes updatedAt. Reading it from IndexedDB therefore
// gives this browser test an exact no-autosave observation without mocking
// the app's storage APIs.
async function readSignWork(page) {
  return page.evaluate(async () => {
    const id = localStorage.getItem('pdf-toolkit:workspace:current:sign');
    if (!id) return null;
    const entry = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pdf-toolkit-workspace', 1);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('workspace', 'readonly');
        const get = transaction.objectStore('workspace').get(`recent:${id}`);
        get.onsuccess = () => resolve(get.result || null);
        get.onerror = () => reject(get.error);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
    const work = entry?.work?.sign;
    return work ? {
      revision: work.revision,
      updatedAt: work.updatedAt,
      elementCount: Array.isArray(work.elements) ? work.elements.length : 0,
    } : null;
  });
}

async function installRestoreTrace(page) {
  await page.addInitScript(() => {
    let cls = 0;
    const hero = [];
    const followups = [];
    const capture = () => {
      const heading = document.querySelector('.tool-hero h1');
      const subtitle = document.querySelector('[data-hero-sub]');
      const shell = Boolean(document.querySelector('[data-tool-shell]'));
      if (heading && subtitle) {
        const subtitleStyle = getComputedStyle(subtitle);
        hero.push({
          shell,
          titleFontSize: getComputedStyle(heading).fontSize,
          subtitleVisible: subtitleStyle.display !== 'none' && subtitleStyle.visibility !== 'hidden',
        });
      }
      const followup = document.querySelector('[data-tool-followups]');
      if (followup) {
        const style = getComputedStyle(followup);
        followups.push({
          shell,
          visible: style.display !== 'none' && style.visibility !== 'hidden',
          top: Math.round(followup.getBoundingClientRect().top),
        });
      }
    };
    const observer = new MutationObserver(capture);
    observer.observe(document, { childList: true, subtree: true, attributes: true });
    let frames = 0;
    const sample = () => {
      capture();
      if (frames++ < 240) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    try {
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          if (!entry.hadRecentInput) cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Chromium is the target for this spec; leave a useful trace if another
      // engine does not expose layout-shift entries.
    }
    window.__signSavedWorkRestoreTrace = () => ({ cls, hero, followups });
  });
}

for (const restoreCase of RESTORE_CASES) {
  test(`Sign restores a 77-page draft without visual or save churn on ${restoreCase.name}`, async ({ page, context }) => {
    await page.setViewportSize(restoreCase.viewport);
    const pdf = await makeLongPdfBuffer();
    await openSignTool(page, pdf);
    await addText(page, 'Saved before restoring');
    const savedStatus = page.locator('[data-tool-shell]').getByText('Draft saved', { exact: true });
    await expect(savedStatus).toBeVisible();
    const beforeRestore = await readSignWork(page);
    expect(beforeRestore).toMatchObject({ revision: expect.any(Number), updatedAt: expect.any(Number), elementCount: 1 });

    await page.close();
    const restored = await context.newPage();
    await restored.setViewportSize(restoreCase.viewport);
    await installRestoreTrace(restored);
    await restored.goto('/sign/?next=0');
    await restored.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    await expect(restored.locator('[data-editor-text-input]')).toHaveValue('Saved before restoring');
    // The restored page count is in the identity at every width; below 560px
    // SIGN-27 keeps that meta text out of the one-row phone card, so only
    // its presence is asserted there.
    const pageCount = restored.getByText('77 pages', { exact: false });
    if (restoreCase.viewport.width < 560) await expect(pageCount).toHaveCount(1);
    else await expect(pageCount).toBeVisible();

    // More than the 700ms debounce: a restore is not an edit, so neither the
    // pending nor saved chip may appear after the editor has settled.
    await restored.waitForTimeout(1_200);
    await expect(restored.getByText('Saving draft…', { exact: true })).toHaveCount(0);
    await expect(restored.getByText('Draft saved', { exact: true })).toHaveCount(0);
    expect(await readSignWork(restored)).toEqual(beforeRestore);

    const trace = await restored.evaluate(() => window.__signSavedWorkRestoreTrace());
    expect(trace.hero.length).toBeGreaterThan(0);
    expect(trace.hero.some((sample) => !sample.shell)).toBe(true);
    expect(trace.hero.some((sample) => sample.shell)).toBe(true);
    const firstHeroState = trace.hero[0];
    expect(trace.hero.every((sample) => (
      sample.titleFontSize === firstHeroState.titleFontSize
      && sample.subtitleVisible === firstHeroState.subtitleVisible
    ))).toBe(true);
    expect(trace.followups.some((sample) => sample.visible && !sample.shell)).toBe(false);
    const visibleFollowups = trace.followups.filter((sample) => sample.visible);
    expect(visibleFollowups.length).toBeGreaterThan(0);
    expect(new Set(visibleFollowups.map((sample) => sample.top)).size).toBe(1);
    expect(trace.cls).toBeLessThanOrEqual(0.01);

    // A real gesture still schedules and completes a save. This proves the
    // quiet restored state is intentional, rather than persistence being off.
    await addText(restored, 'One real edit after restore', 0.55, 0.55);
    await expect(restored.getByText('Saving draft…', { exact: true })).toBeVisible();
    await expect(restored.getByText('Draft saved', { exact: true })).toBeVisible();
    const afterEdit = await readSignWork(restored);
    expect(afterEdit.revision).toBeGreaterThan(beforeRestore.revision);
    expect(afterEdit.updatedAt).toBeGreaterThan(beforeRestore.updatedAt);
    expect(afterEdit.elementCount).toBe(2);
  });
}
