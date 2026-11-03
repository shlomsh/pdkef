import { test, expect } from '@playwright/test';
import fs from 'fs';
import { waitForIsland } from '../../../../e2e/support/tool.js';
import { makeCopiedPagesPdf } from '../../../../e2e/support/pdf.js';

// Compress now only shrinks embedded images, so the fixture's pages carry
// photos: they are copies of the committed mixed.pdf fixture's page.
const MIXED = fs.readFileSync(new URL('../__fixtures__/mixed.pdf', import.meta.url));

// SEO-25 - the before/after compare panel opens by default as soon as a
// result exists (Shlomi, 2026-09-12: "it turned out amazing, it is however
// very hidden, keep it open by default so it is visible before the user
// downloads" - see backlog/tasks/SEO-25.md's "Open by default" section and
// PdfCompressTool.tsx's `openCompare` doc comment), rather than waiting for
// a tap. Since it now runs for every PDF result rather than only a tapped
// one, the mobile-cost constraint in CLAUDE.md applies to every visitor who
// compresses a PDF. The comparison is shown inline with no toggle (Full
// screen opens the larger one). This is that measurement: render it under
// an emulated low-end Android profile (4x CPU throttling via CDP, the same technique
// Lighthouse's mobile preset uses - there is no lighter way to approximate
// a slow device from Chromium) and time how long it takes, from the
// done status to both page-1 previews rendering.
//
// CDP CPU throttling is Chromium-only, so this only runs in the "chromium"
// project (the default here; playwright.config.js's "webkit" project is
// scoped to specific specs and does not pick this one up).

const makeMultiPagePdfBuffer = (pageCount = 4) => makeCopiedPagesPdf(MIXED, pageCount);

test.describe('compress tool - before/after preview', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('opens the comparison automatically once compressed, and stays affordable on an emulated low-end phone', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling needs a CDP session; only the chromium project has one.');

    const client = await page.context().newCDPSession(page);
    // 4x slowdown approximates a low/mid-range Android device, the same
    // multiplier Lighthouse's mobile throttling preset uses.
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await page.goto('/compress/');
    await waitForIsland(page);

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Choose file', { exact: true }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'compare-preview-fixture.pdf',
      mimeType: 'application/pdf',
      buffer: await makeMultiPagePdfBuffer(),
    });

    await expect(page.locator('[data-compress-status="done"]')).toBeVisible({ timeout: 20_000 });

    // From here the panel opens on its own - no tap. Time from the result
    // landing to both page-1 previews being rendered, the real cost a
    // visitor now pays on every PDF result rather than only a tapped one.
    const start = Date.now();
    await expect(page.locator('[class*="compare-slider"]')).toBeVisible({ timeout: 15_000 });
    const elapsedMs = Date.now() - start;

    console.log(`[SEO-25] compare panel opened in ${elapsedMs}ms under 4x CPU throttling at a 390x844 viewport`);

    // Generous on purpose: this is a CI-runner/CDP-throttled measurement,
    // not a real device, so it only needs to rule out "unusably slow," not
    // hit a tight budget. Two page-1 previews rendering in single-digit
    // seconds under 4x throttling is the affordability bar CLAUDE.md's
    // mobile-cost constraint asked for.
    expect(elapsedMs).toBeLessThan(8_000);

    // Drag the handle and confirm it actually moved - proves the gesture
    // (and not just the initial render) works under the same throttling.
    const handle = page.locator('[class*="compare-handle"]').first();
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 60, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(handle).toHaveAttribute('aria-valuenow', /^(?!50$)\d+$/);
  });

  test.describe('on a desktop viewport', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('the inline slider shows the whole page in the first screen, and Full screen opens a wider one that Escape closes', async ({ page }) => {
      await page.goto('/compress/');
      await waitForIsland(page);

      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.getByText('Choose file', { exact: true }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: 'compare-wide-fixture.pdf',
        mimeType: 'application/pdf',
        buffer: await makeMultiPagePdfBuffer(),
      });

      await expect(page.locator('[data-compress-status="done"]')).toBeVisible({ timeout: 20_000 });

      const inline = page.locator('[class*="compare-slider"]').first();
      await expect(inline).toBeVisible({ timeout: 15_000 });
      // The result column (UX guideline 18) sizes the slider so a whole
      // portrait page fits in the first screen beside the 360px rail; it used
      // to be a wide strip below the old quality cards (> 700px) that ran off
      // the screen.
      // The loaded card is one first screen, as on every tool (PdfTool.module.css's floor), and the preview
      // fits inside it with the row under it: with the page at the top, Full screen and the card's foot are
      // both on screen. Checking only the slider's foot let that row run 40px off the screen (2026-10-28).
      await page.evaluate(() => window.scrollTo(0, 0));
      const inlineBox = await inline.boundingBox();
      const fullScreenBox = await page.getByRole('button', { name: 'Full screen' }).boundingBox();
      const cardBox = await page.locator('[data-tool-loaded]').boundingBox();
      expect(inlineBox.width).toBeGreaterThanOrEqual(400);
      expect(fullScreenBox.y + fullScreenBox.height).toBeLessThanOrEqual(900);
      expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(900);

      await page.getByRole('button', { name: 'Full screen' }).click();
      const dialog = page.locator('dialog[open]', { has: page.locator('[role="slider"]') });
      await expect(dialog).toBeVisible();
      const slider = dialog.locator('[class*="compare-slider"]');
      await expect(slider).toBeVisible({ timeout: 15_000 });
      const fullBox = await slider.boundingBox();
      expect(fullBox.width).toBeGreaterThan(1300);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    });

    // COMP-04: a photo's Full screen fits the screen whole, as large as its own shape allows, nothing to scroll.
    for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      test(`Full screen fits a portrait photo inside a ${size.width}x${size.height} screen with nothing to scroll`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.goto('/compress-image/');
        await waitForIsland(page);

        const dataUrl = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 1200;
          canvas.height = 1600;
          const ctx = canvas.getContext('2d');
          const gradient = ctx.createLinearGradient(0, 0, 1200, 1600);
          gradient.addColorStop(0, '#1b2a4a');
          gradient.addColorStop(1, '#e8c468');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, 1200, 1600);
          const noise = ctx.getImageData(0, 600, 1200, 1000);
          for (let i = 0; i < noise.data.length; i += 4) {
            noise.data[i] = Math.random() * 255;
            noise.data[i + 1] = Math.random() * 255;
            noise.data[i + 2] = Math.random() * 255;
          }
          ctx.putImageData(noise, 0, 600);
          return canvas.toDataURL('image/jpeg', 0.9);
        });
        await page.locator('input[type="file"]').first().setInputFiles({
          name: 'portrait-photo.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.from(dataUrl.split(',')[1], 'base64'),
        });
        await expect(page.locator('[data-compress-status="done"]')).toBeVisible({ timeout: 30_000 });

        await page.getByRole('button', { name: 'Full screen' }).click();
        const dialog = page.locator('dialog[open]', { has: page.locator('[role="slider"]') });
        await expect(dialog).toBeVisible();
        const slider = dialog.locator('[class*="compare-slider"]');
        await expect(slider).toBeVisible({ timeout: 15_000 });
        // The slider sizes itself to the loaded photo, so measure once both images have decoded.
        await expect(dialog.locator('img').first()).toBeVisible();
        await expect.poll(() => dialog.locator('img').evaluateAll((imgs) => imgs.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);

        const box = await slider.boundingBox();
        const bodyBox = await dialog.locator('[class*="compare-fullscreen-body"]').boundingBox();
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
        expect(box.height >= bodyBox.height * 0.85 || box.width >= bodyBox.width * 0.85).toBe(true);
        const scrolls = await dialog.locator('[class*="compare-fullscreen-body"]').evaluate((el) => el.scrollHeight > el.clientHeight + 1);
        expect(scrolls).toBe(false);
      });
    }
  });
});
