import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/*
 * The ordinary Redact draft-restore spec proves a small document survives a
 * tab close. This separate acceptance guard exercises the long restored
 * document that exposed the first-paint and autosave regression: restoration
 * is display-only until a person makes a real redaction.
 */
test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 120_000 });

const RESTORE_CASES = [
  { name: 'wide condensed desktop', viewport: { width: 1512, height: 900 } },
  { name: '900px compact desktop', viewport: { width: 900, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
];

async function makeLongPdfBuffer() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let pageIndex = 0; pageIndex < 77; pageIndex += 1) {
    const page = document.addPage([612, 792]);
    page.drawText(`Saved redaction acceptance page ${pageIndex + 1}`, {
      x: 72,
      y: 720,
      size: 16,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  return Buffer.from(await document.save());
}

async function openRedactTool(page, buffer) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/redact/');
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Choose file', { exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: '77-page-saved-redactions.pdf',
    mimeType: 'application/pdf',
    buffer,
  });
  await expect(page.locator('.redact-draw-area').first()).toBeVisible();
}

async function drawBlackout(page, startRatio = { x: 0.3, y: 0.3 }, endRatio = { x: 0.5, y: 0.36 }, expectedBoxCount = 1) {
  const tool = page.getByRole('toolbar', { name: 'PDF redaction' })
    .getByRole('button', { name: 'Blackout', exact: true });
  if ((await tool.getAttribute('aria-pressed')) !== 'true') await tool.click();
  await expect(tool).toHaveAttribute('aria-pressed', 'true');
  const overlay = page.locator('.redact-draw-area').first();
  await overlay.scrollIntoViewIfNeeded();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('PDF redaction overlay has no bounding box');
  await page.mouse.move(box.x + box.width * startRatio.x, box.y + box.height * startRatio.y);
  await page.mouse.down();
  await expect(page.locator('.redact-drawing-preview')).toHaveCount(1);
  await page.mouse.move(box.x + box.width * endRatio.x, box.y + box.height * endRatio.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[class*="redact-box"]')).toHaveCount(expectedBoxCount);
}

// cacheRecentFile can update recency metadata while a PDF opens. Only
// saveDraft changes a work revision/updatedAt, so IndexedDB makes the no-save
// assertion exact without replacing any application storage APIs.
async function readRedactWork(page) {
  return page.evaluate(async () => {
    const id = localStorage.getItem('pdf-toolkit:workspace:current:redact');
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
    const work = entry?.work?.redact;
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
    const geometry = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left), top: Math.round(rect.top),
        width: Math.round(rect.width), height: Math.round(rect.height),
        fontSize: getComputedStyle(element).fontSize,
      };
    };
    const capture = () => {
      const heading = document.querySelector('.tool-hero h1');
      const subtitle = document.querySelector('[data-hero-sub]');
      const shell = Boolean(document.querySelector('[data-tool-shell]'));
      if (heading && subtitle) {
        const subtitleStyle = getComputedStyle(subtitle);
        hero.push({
          shell,
          title: geometry(heading),
          subtitle: {
            ...geometry(subtitle),
            visible: subtitleStyle.display !== 'none' && subtitleStyle.visibility !== 'hidden',
          },
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
      // Chromium exposes layout-shift entries; retain the geometry trace on
      // engines which do not.
    }
    window.__redactSavedWorkRestoreTrace = () => ({ cls, hero, followups });
  });
}

for (const restoreCase of RESTORE_CASES) {
  test(`Redact restores a 77-page draft without visual or save churn on ${restoreCase.name}`, async ({ page, context }) => {
    await page.setViewportSize(restoreCase.viewport);
    const pdf = await makeLongPdfBuffer();
    await openRedactTool(page, pdf);
    await drawBlackout(page);
    await expect(page.locator('[data-tool-shell]').getByText('Draft saved', { exact: true })).toBeVisible();
    const beforeRestore = await readRedactWork(page);
    expect(beforeRestore).toMatchObject({ revision: expect.any(Number), updatedAt: expect.any(Number), elementCount: 1 });

    await page.close();
    const restored = await context.newPage();
    await restored.setViewportSize(restoreCase.viewport);
    await installRestoreTrace(restored);
    await restored.goto('/redact/');
    await restored.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    await expect(restored.locator('[class*="redact-box"]')).toHaveCount(1);
    await expect(restored.getByText('77 pages', { exact: false })).toBeVisible();
    await expect(restored.getByText('Tip: pick a tool to start. Delete takes an image or text run out of the file itself.', { exact: true })).toHaveCount(0);

    // More than the 700ms debounce: a restoration is not an edit, so neither
    // persistence state may appear and the stored work must be byte-for-byte
    // equivalent at this revision.
    await restored.waitForTimeout(1_200);
    await expect(restored.getByText('Saving draft…', { exact: true })).toHaveCount(0);
    await expect(restored.getByText('Draft saved', { exact: true })).toHaveCount(0);
    expect(await readRedactWork(restored)).toEqual(beforeRestore);

    const trace = await restored.evaluate(() => window.__redactSavedWorkRestoreTrace());
    expect(trace.hero.length).toBeGreaterThan(0);
    expect(trace.hero.some((sample) => !sample.shell)).toBe(true);
    expect(trace.hero.some((sample) => sample.shell)).toBe(true);
    const firstHeroState = trace.hero[0];
    expect(trace.hero.every((sample) => (
      JSON.stringify(sample.title) === JSON.stringify(firstHeroState.title)
      && JSON.stringify(sample.subtitle) === JSON.stringify(firstHeroState.subtitle)
    ))).toBe(true);
    expect(trace.followups.some((sample) => sample.visible && !sample.shell)).toBe(false);
    const visibleFollowups = trace.followups.filter((sample) => sample.visible);
    expect(visibleFollowups.length).toBeGreaterThan(0);
    expect(new Set(visibleFollowups.map((sample) => sample.top)).size).toBe(1);
    expect(trace.cls).toBeLessThanOrEqual(0.01);

    // Restored work omits the newcomer tip, but selecting a tool immediately
    // restores its contextual instruction and repeat-placement control. This
    // belongs after the no-input trace: its intentional, input-associated row
    // change is not part of the restore's visual-stability measurement.
    const blackout = restored.getByRole('toolbar', { name: 'PDF redaction' })
      .getByRole('button', { name: 'Blackout', exact: true });
    await blackout.click();
    await expect(restored.locator('[data-tool-shell] [role="status"]')
      .getByText('Click and drag on a page to draw a blackout box.', { exact: true })).toBeVisible();
    await expect(restored.getByRole('switch', { name: 'Keep Blackout on' })).toHaveAttribute('aria-checked', 'false');

    // A person making one new blackout has exactly the inverse behavior: one
    // dirty transition, one completed save, and precisely one revision bump.
    await drawBlackout(restored, { x: 0.55, y: 0.55 }, { x: 0.72, y: 0.61 }, 2);
    await expect(restored.getByText('Saving draft…', { exact: true })).toBeVisible();
    await expect(restored.getByText('Draft saved', { exact: true })).toBeVisible();
    const afterEdit = await readRedactWork(restored);
    expect(afterEdit.revision).toBeGreaterThan(beforeRestore.revision);
    expect(afterEdit.updatedAt).toBeGreaterThan(beforeRestore.updatedAt);
    expect(afterEdit.elementCount).toBe(2);
  });
}
