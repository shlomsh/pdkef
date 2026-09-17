import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/* A Merge restore is unlike Sign/Redact: it rebuilds several files, then
 * asynchronously derives each file's page count and preview before mounting
 * the grid. This acceptance guard observes the entire cascade, rather than
 * only the first `onRestore` render. */
test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 120_000 });

const RESTORE_CASES = [
  { name: 'wide condensed desktop', viewport: { width: 1512, height: 900 }, hasRailStatus: true },
  // Merge switches to its compact workspace before 1024px, so the desktop
  // rail status is intentionally absent at this viewport.
  { name: '900px compact desktop', viewport: { width: 900, height: 900 }, hasRailStatus: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, hasRailStatus: false },
];

async function makePdfBuffer(label, pageCount = 9) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = document.addPage([612, 792]);
    page.drawText(`${label} — saved work page ${pageIndex + 1}`, {
      x: 72, y: 720, size: 16, font, color: rgb(0.1, 0.1, 0.1),
    });
  }
  return Buffer.from(await document.save());
}

async function readMergeWork(page) {
  return page.evaluate(async () => {
    const id = localStorage.getItem('pdf-toolkit:workspace:current:merge');
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
    const work = entry?.work?.merge;
    return work ? {
      revision: work.revision,
      updatedAt: work.updatedAt,
      fileCount: work.fileCount,
      pageCount: work.pageCount,
      plan: work.plan.map((item) => ({ key: item.key, rotation: item.rotation })),
    } : null;
  });
}

async function installRestoreTrace(page) {
  await page.addInitScript(() => {
    let cls = 0;
    const emptyStates = [];
    const followups = [];
    const saveStates = [];
    const restoreMarkers = [];
    const isVisible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const capture = () => {
      const ready = Boolean(document.querySelector('[data-merge-workspace-ready]'));
      restoreMarkers.push(document.documentElement.hasAttribute('data-merge-restore'));
      const empty = document.querySelector('[data-empty-state]');
      emptyStates.push({ ready, marker: document.documentElement.hasAttribute('data-merge-restore'), visible: isVisible(empty) });
      const followup = document.querySelector('[data-tool-followups]');
      if (followup) followups.push({ marker: document.documentElement.hasAttribute('data-merge-restore'), ready, visible: isVisible(followup), top: Math.round(followup.getBoundingClientRect().top) });
      for (const text of ['Saving draft…', 'Draft saved']) {
        if (Array.from(document.querySelectorAll('*')).some((node) => node.children.length === 0 && node.textContent?.trim() === text)) saveStates.push(text);
      }
    };
    const observer = new MutationObserver(capture);
    observer.observe(document, { childList: true, subtree: true, attributes: true });
    let frames = 0;
    const sample = () => {
      capture();
      if (frames++ < 720) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    try {
      new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) if (!entry.hadRecentInput) cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Chromium exposes layout-shift; retain the state trace for other engines.
    }
    window.__mergeSavedWorkRestoreTrace = () => ({ cls, emptyStates, followups, saveStates, restoreMarkers });
  });
}

async function openMergeTool(page, files) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await page.locator('input[type="file"]').setInputFiles(files);
  await expect(page.locator('ul[class*="grid"] > li[data-key]').first()).toBeVisible({ timeout: 15_000 });
}

for (const restoreCase of RESTORE_CASES) {
  test(`Merge restores a multi-file saved workspace without visual or save churn on ${restoreCase.name}`, async ({ page, context }) => {
    await page.setViewportSize(restoreCase.viewport);
    const files = await Promise.all(['January.pdf', 'February.pdf', 'March.pdf'].map(async (name) => ({
      name,
      mimeType: 'application/pdf',
      buffer: await makePdfBuffer(name),
    })));
    await openMergeTool(page, files);

    const firstCard = page.locator('ul[class*="grid"] > li[data-key]').first();
    // Below 768px the page's action cluster is not a hover affordance: it is
    // `display: none` until the card itself is tapped (`data-selected`), so a
    // phone seeds the same rotation through the tap the real UI asks for.
    if (restoreCase.viewport.width < 768) {
      await firstCard.click();
      await firstCard.getByRole('button', { name: /^Rotate page/ }).click();
    } else {
      await firstCard.hover();
      await firstCard.getByRole('button', { name: /^Rotate page/ }).click({ force: true });
    }
    await expect(firstCard).toHaveAttribute('data-rotation', '90');
    if (restoreCase.hasRailStatus) {
      await expect(page.locator('[class*="draft-status-row"]', { hasText: 'Draft saved' })).toBeVisible({ timeout: 15_000 });
    } else {
      await page.waitForTimeout(1_200);
    }
    const beforeRestore = await readMergeWork(page);
    expect(beforeRestore).toMatchObject({ fileCount: 3, pageCount: 27, revision: expect.any(Number), updatedAt: expect.any(Number) });
    expect(beforeRestore.plan[0]).toMatchObject({ rotation: 90 });
    // The page's pre-paint reader must still arm a valid pointer when the
    // optional recent-files index is corrupt; IndexedDB remains authoritative
    // for restoring the actual workspace.
    await page.evaluate(() => localStorage.setItem('pdf-toolkit:workspace:recent-files', '{not valid json'));

    await page.close();
    const restored = await context.newPage();
    await restored.setViewportSize(restoreCase.viewport);
    await installRestoreTrace(restored);
    await restored.goto('/merge/');
    await restored.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    await expect(restored.locator('ul[class*="file-list"] > li[class*="file-row"]')).toHaveCount(3, { timeout: 15_000 });
    const restoredFirstCard = restored.locator('ul[class*="grid"] > li[data-key]').first();
    await expect(restoredFirstCard).toHaveAttribute('data-rotation', '90', { timeout: 15_000 });
    await expect(restored.locator('#merge-pages-heading')).toContainText('27 pages');
    // The saved revision is authoritative. Neither closing an already-saved
    // tab nor the reopened restore/derived page-count/thumbnail work may
    // create another revision.
    const reopenedBaseline = await readMergeWork(restored);
    expect(reopenedBaseline).toEqual(beforeRestore);

    // Covers the delayed inspectPdf/renderThumbnail work as well as the first
    // restored model. Neither the normal debounce nor pagehide/visibility
    // flush may turn a restore into a new revision.
    await restored.waitForTimeout(1_500);
    await restored.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
    });
    await restored.waitForTimeout(300);
    await expect(restored.getByText('Saving draft…', { exact: true })).toHaveCount(0);
    await expect(restored.getByText('Draft saved', { exact: true })).toHaveCount(0);
    expect(await readMergeWork(restored)).toEqual(reopenedBaseline);

    // The restore sentence is shown for five seconds and then goes. Its slot
    // (the desktop rail's status row, the phone's header row) must stay put
    // when it does, so the observation window closes only after that.
    // Both placements are in the DOM (CSS picks one); between 768 and 1023px
    // neither is shown, so only the timer's departure is asserted there.
    const pickedUp = restored.getByText('Picked up where you left off');
    const { width } = restoreCase.viewport;
    if (width < 768 || width >= 1024) await expect(pickedUp.filter({ visible: true })).toHaveCount(1);
    await expect(pickedUp).toHaveCount(0, { timeout: 10_000 });
    await restored.waitForTimeout(300);

    const trace = await restored.evaluate(() => window.__mergeSavedWorkRestoreTrace());
    expect(trace.emptyStates.length).toBeGreaterThan(0);
    expect(trace.restoreMarkers.some(Boolean)).toBe(true);
    // The init script begins observing before the parser reaches the blocking
    // head script, so only samples with the actual restore marker represent a
    // paintable restore state. The marker must never expose the empty prompt.
    expect(trace.emptyStates.some((sample) => sample.marker && sample.visible)).toBe(false);
    expect(trace.followups.some((sample) => sample.marker && sample.visible && !sample.ready)).toBe(false);
    const visibleFollowups = trace.followups.filter((sample) => sample.visible && sample.ready);
    expect(visibleFollowups.length).toBeGreaterThan(0);
    expect(new Set(visibleFollowups.map((sample) => sample.top)).size).toBe(1);
    expect(trace.saveStates).toEqual([]);
    expect(trace.cls).toBeLessThanOrEqual(0.01);

    // A real edit still drives exactly one normal save cycle on the desktop
    // rail; all viewports still prove the persisted revision changed.
    if (restoreCase.hasRailStatus) {
      await restoredFirstCard.hover();
      await restoredFirstCard.getByRole('button', { name: /^Rotate page/ }).click({ force: true });
      await expect(restoredFirstCard).toHaveAttribute('data-rotation', '180');
      await expect(restored.getByText('Saving draft…', { exact: true })).toBeVisible();
      await expect(restored.getByText('Draft saved', { exact: true })).toBeVisible();
      const afterEdit = await readMergeWork(restored);
      expect(afterEdit.revision).toBe(beforeRestore.revision + 1);
      expect(afterEdit.updatedAt).toBeGreaterThan(beforeRestore.updatedAt);
      expect(afterEdit.plan[0]).toMatchObject({ rotation: 180 });
      await restored.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      await restored.waitForTimeout(300);
      expect(await readMergeWork(restored)).toEqual(afterEdit);
    }
  });
}
