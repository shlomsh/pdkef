import { test, expect } from '@playwright/test';
import { waitForIsland } from '../support/tool.js';
import { makePdfBuffer } from '../support/pdf.js';

/* QUAL-27, Shlomi 2026-10-20: export is never filled in the toolbar. The
   toolbar is where you work; the completion row under the document is the
   call to action. Teal on a toolbar button means one thing, an armed tool.
   The case that started it is a restored draft: export became runnable with
   nobody asking, and Share and Download lit up on their own. So each tool
   places one whiteout, reloads, lets the draft restore, and then the
   toolbar's Share and Download must be enabled and wear exactly the plain
   button's colours. Sign and Redact share EditorExportActions and its sheet,
   so both are held to it, on a phone and on desktop, and Sign in Hebrew too. */

const makeFixture = () => makePdfBuffer(null, { size: [400, 500], title: false, lines: [{ text: 'Quiet export fixture', x: 40, y: 440, gray: null }] });

const tools = [
  { name: 'Sign', path: '/sign/?next=0', whiteout: 'Whiteout', share: 'Share', download: 'Download' },
  { name: 'Sign (Hebrew)', path: '/he/sign/?next=0', whiteout: 'טיפקס', share: 'שיתוף', download: 'הורדה' },
  { name: 'Redact', path: '/redact', whiteout: 'Whiteout', share: 'Share', download: 'Download' },
];
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 1440, height: 1000 }];

const colours = (locator) => locator.evaluate((el) => {
  const s = getComputedStyle(el);
  return { background: s.backgroundColor, border: s.borderColor, color: s.color };
});

for (const tool of tools) {
  for (const viewport of VIEWPORTS) {
    test(`${tool.name} at ${viewport.width}px: a restored draft leaves Share and Download plain`, async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
        Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
      });
      await page.setViewportSize(viewport);
      await page.goto(tool.path);
      await waitForIsland(page);
      const chooser = page.waitForEvent('filechooser');
      await page.locator('[data-tool-shell], main').getByText(/Choose file|בחירת קובץ/).first().click();
      await (await chooser).setFiles({ name: 'quiet-export.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });

      const toolbar = page.locator('[role="toolbar"]').first();
      const pageArea = page.locator('[class*="page-wrapper"]').first();
      await expect(pageArea).toBeVisible();
      await toolbar.getByRole('button', { name: tool.whiteout, exact: true }).click();
      const area = await pageArea.boundingBox();
      await page.mouse.move(area.x + area.width * 0.3, area.y + area.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(area.x + area.width * 0.6, area.y + area.height * 0.4, { steps: 6 });
      await page.mouse.up();
      const download = toolbar.getByRole('button', { name: tool.download, exact: true });
      await expect(download).toBeEnabled();

      // Let the debounced save land, then come back with nothing asked for.
      // Time on purpose: the save indicator text is per language, so the debounce is waited out.
      await page.waitForTimeout(1500);
      await page.reload();
      await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();
      const restored = page.locator('[role="toolbar"]').first();
      const share = restored.getByRole('button', { name: tool.share, exact: true });
      const restoredDownload = restored.getByRole('button', { name: tool.download, exact: true });
      await expect(restoredDownload).toBeEnabled();
      await expect(share).toBeEnabled();
      await page.mouse.move(0, 0);

      const plain = await colours(restored.getByRole('button', { name: tool.whiteout, exact: true }));
      expect({ share: await colours(share), download: await colours(restoredDownload) }, 'toolbar export controls wear the plain button')
        .toEqual({ share: plain, download: plain });
    });
  }
}
