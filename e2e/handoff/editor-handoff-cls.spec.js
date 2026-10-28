import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { waitForIsland } from '../support/tool.js';

/* HERO-02 for the editors: a file handed to Sign or Redact (Merge's "Sign", the home launcher)
   sets html[data-handoff-pending] before first paint (src/lib/handoff/handoffPending.ts), so the page-grid
   first screen is never painted empty and then collapsed. The editor restore releases the marker
   once the document shows (useEditorDraftPersistence). */

const PDF_1 = readFileSync(new URL('../../src/lib/__fixtures__/num-1.pdf', import.meta.url));
const PDF_2 = readFileSync(new URL('../../src/lib/__fixtures__/num-2.pdf', import.meta.url));
const EDITOR_SHOWS = '[data-tool-loaded], [data-tool-shell], [data-editor-workspace]';

const WATCH = () => {
  window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
  if (location.pathname === '/' || location.pathname === '/merge/') return;
  window.__pendingSeen = false;
  new MutationObserver(() => {
    if (document.documentElement.hasAttribute('data-handoff-pending')) window.__pendingSeen = true;
  }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-handoff-pending'] });
};

async function expectLanded(page, tool) {
  await page.waitForURL(new RegExp(`/${tool}/?$`));
  await expect(page.locator(EDITOR_SHOWS).first()).toBeVisible({ timeout: 20_000 });
  // Time on purpose: a layout-shift observation window after the editor shows.
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__pendingSeen), 'marker set before the document showed').toBe(true);
  const { cls, pending, key } = await page.evaluate((t) => ({
    cls: window.__cls,
    pending: document.documentElement.hasAttribute('data-handoff-pending'),
    key: sessionStorage.getItem('pdkef:handoff-pending:' + t),
  }), tool);
  expect(cls, 'layout shift over the hand-off').toBeLessThan(0.01);
  expect(pending, 'released once the editor shows the document').toBe(false);
  expect(key, 'the one-shot storage key is consumed').toBeNull();
}

test.describe('editor hand-off arrival', () => {
  test.use({ serviceWorkers: 'block' });

  test('Merge to Sign lands loaded with the marker seen first and no layout shift', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 820 });
    await page.addInitScript(WATCH);
    await page.goto('/merge/');
    await waitForIsland(page);
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'one.pdf', mimeType: 'application/pdf', buffer: PDF_1 },
      { name: 'two.pdf', mimeType: 'application/pdf', buffer: PDF_2 },
    ]);
    await expect(page.getByRole('link', { name: /Download merged PDF/ })).toHaveAttribute('href', /^blob:/, { timeout: 10_000 });
    await page.getByRole('button', { name: 'Sign', exact: true }).click();
    await expectLanded(page, 'sign');
  });

  test('the home launcher to Redact lands loaded with the marker seen first and no layout shift', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 820 });
    await page.addInitScript(WATCH);
    await page.goto('/');
    await page.locator('[data-home-picker]').first().waitFor();
    const fits = page.locator('.home-dock a[data-tool="redact"][data-fits]');
    await expect(async () => {
      const dt = await page.evaluateHandle((bytes) => {
        const d = new DataTransfer();
        d.items.add(new File([new Uint8Array(bytes)], 'num-1.pdf', { type: 'application/pdf' }));
        return d;
      }, [...PDF_1]);
      await page.locator('[data-working-area]').first().dispatchEvent('drop', { dataTransfer: dt });
      await expect(fits).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await fits.click();
    await expectLanded(page, 'redact');
  });
});
