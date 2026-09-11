import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

// SEO-25 - the before/after compare slider is lazy on every device (see
// PdfCompressTool.tsx's handleToggleCompare doc comment), but "opt-in" is
// only a real answer to CLAUDE.md's mobile-cost constraint if a visitor who
// *does* tap it isn't left waiting on a phone. This is that measurement:
// open the panel under an emulated low-end Android profile (4x CPU
// throttling via CDP, the same technique Lighthouse's mobile preset uses -
// there is no lighter way to approximate a slow device from Chromium) and
// time how long it takes to render both page-1 previews.
//
// CDP CPU throttling is Chromium-only, so this only runs in the "chromium"
// project (the default here; playwright.config.js's "webkit" project is
// scoped to specific specs and does not pick this one up).

async function makeMultiPagePdfBuffer(pageCount = 4) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`SEO-25 compare preview fixture - page ${i + 1}`, {
      x: 72,
      y: 700,
      size: 20,
      font,
      color: rgb(0.14, 0.22, 0.29),
    });
    page.drawRectangle({ x: 72, y: 420, width: 380, height: 220, color: rgb(0.24, 0.49, 0.55) });
    page.drawText('Lorem ipsum dolor sit amet, consectetur adipiscing elit.', {
      x: 72,
      y: 360,
      size: 12,
      font,
      color: rgb(0.29, 0.4, 0.44),
    });
  }
  return Buffer.from(await doc.save());
}

test.describe('compress tool - before/after preview', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('never renders the comparison until asked, and stays affordable on an emulated low-end phone once it is', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling needs a CDP session; only the chromium project has one.');

    const client = await page.context().newCDPSession(page);
    // 4x slowdown approximates a low/mid-range Android device, the same
    // multiplier Lighthouse's mobile throttling preset uses.
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await page.goto('/compress/');
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Choose file', { exact: true }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'compare-preview-fixture.pdf',
      mimeType: 'application/pdf',
      buffer: await makeMultiPagePdfBuffer(),
    });

    await page.getByRole('button', { name: 'Compress PDF' }).click();
    await expect(page.getByText('PDF Successfully Compressed!')).toBeVisible({ timeout: 20_000 });

    // The panel must not exist before it's asked for - this is the actual
    // "not by default on mobile" acceptance bar, and it holds on every
    // device since the toggle is the only thing that can open it.
    await expect(page.locator('[class*="compare-panel"]')).toHaveCount(0);

    const toggle = page.getByRole('button', { name: 'Compare with original' });
    await expect(toggle).toBeVisible();

    const start = Date.now();
    await toggle.click();
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
});
