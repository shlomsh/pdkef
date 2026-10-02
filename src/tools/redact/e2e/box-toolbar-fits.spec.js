import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

// RED-53: with a mouse on a narrow window, a selected box shows the floating
// pill (not the phone bar). It must stay inside the window, wrap its groups,
// hide its text labels under 768px, and leave every control reachable.
// Rendered geometry and hit-testing: jsdom cannot see either.

const RECENT_KEY = 'pdf-toolkit:recent-whiteout-colors:v1:local-browser-profile';

async function makeTwoPagePdf() {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

test.describe('selected box pill fits the window (RED-53)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'layout guard, Chromium only');

  for (const width of [390, 600, 1024]) {
    test(`at ${width}px`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      await context.addInitScript((key) => {
        localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, colors: ['#ffffff', '#a83228', '#3366cc'] }));
      }, RECENT_KEY);
      const page = await context.newPage();
      try {
        await page.goto('/redact');
        await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
        const chooser = page.waitForEvent('filechooser');
        await page.getByText('Choose file', { exact: true }).click();
        await (await chooser).setFiles({ name: 'pill.pdf', mimeType: 'application/pdf', buffer: await makeTwoPagePdf() });
        await expect(page.locator('.redact-draw-area').first()).toBeVisible();

        const tool = page.getByRole('toolbar', { name: 'PDF redaction' }).getByRole('button', { name: 'Whiteout', exact: true });
        await tool.click();
        const overlay = page.locator('.redact-draw-area').first();
        await overlay.scrollIntoViewIfNeeded();
        await overlay.evaluate((el) => {
          const r = el.getBoundingClientRect();
          window.scrollBy(0, r.top + r.height * 0.25 - window.innerHeight / 2);
        });
        const o = await overlay.boundingBox();
        await page.mouse.move(o.x + o.width * 0.55, o.y + o.height * 0.2);
        await page.mouse.down();
        await page.mouse.move(o.x + o.width * 0.96, o.y + o.height * 0.3, { steps: 6 });
        await page.mouse.up();

        const box = page.locator('[data-redact-box-id]').first();
        await expect(box).toBeVisible();
        const b = await box.boundingBox();
        await box.click({ position: { x: b.width / 2, y: b.height / 2 } });

        const pill = box.locator('[data-editor-actions]');
        await expect(pill).toBeVisible();
        await expect(pill.locator('[data-redact-color-recent]'), 'the three seeded recent colours are in the pill').toHaveCount(3);
        const p = await pill.boundingBox();
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x + p.width).toBeLessThanOrEqual(width);

        const covered = await pill.evaluate((el) => [...el.querySelectorAll('button, label')].filter((c) => {
          const r = c.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return !hit || !c.contains(hit);
        }).map((c) => c.getAttribute('aria-label') || c.textContent.trim()));
        expect(covered, 'controls clipped or covered').toEqual([]);

        await expect(pill.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
        const duplicate = pill.getByText('Duplicate');
        if (width >= 768) await expect(duplicate).toBeVisible();
        else await expect(duplicate).not.toBeVisible();
      } finally {
        await context.close();
      }
    });
  }
});
