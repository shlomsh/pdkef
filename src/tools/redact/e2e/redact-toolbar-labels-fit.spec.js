import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

// RED-61: after a Delete export the Redact toolbar has eleven controls, and
// at 390px six per row gave each one 44.9px, narrower than "Download" (52.2px
// of text). Labels are in the system font stack, so no pixel count holds on
// every machine; the property that does is that every label's text extent
// sits inside its own button's border box, on both sides. A Range measures
// both sides (scrollWidth only reports the inline-end half of a centred
// label's overflow). Every offender is collected and named, never the first.

async function makeFixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('KEEP ME', { x: 40, y: 320, size: 20, font });
  page.drawText('SECRET 123', { x: 40, y: 80, size: 20, font });
  return Buffer.from(await doc.save());
}

const WIDTHS = [360, 375, 390, 414, 430];

for (const width of WIDTHS) {
  test(`every Redact toolbar label sits inside its button at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/redact');
    await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
    const chooser = page.waitForEvent('filechooser');
    await page.getByText('Choose file', { exact: true }).click();
    await (await chooser).setFiles({ name: 'toolbar-fit.pdf', mimeType: 'application/pdf', buffer: await makeFixture() });
    await expect(page.locator('[class*="page-wrapper"]').first()).toBeVisible();

    const toolbar = page.getByRole('toolbar', { name: 'PDF redaction' });
    await toolbar.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.locator('[class*="delete-candidate"][title*="SECRET 123"]').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      toolbar.getByRole('button', { name: 'Download', exact: true }).click(),
    ]);
    await download.path();

    const rows = await toolbar.evaluate((bar) => {
      const out = [];
      for (const button of bar.querySelectorAll('button')) {
        const box = button.getBoundingClientRect();
        if (box.width === 0) continue;
        const range = document.createRange();
        range.selectNodeContents(button);
        const text = range.getBoundingClientRect();
        out.push({
          label: button.textContent.trim() || button.getAttribute('aria-label') || '(icon)',
          top: Math.round(box.top), width: box.width,
          left: text.left - box.left, right: box.right - text.right,
          hasText: button.textContent.trim().length > 0,
        });
      }
      return out;
    });
    expect(rows.length, 'the toolbar rendered its buttons').toBeGreaterThanOrEqual(10);

    const offenders = rows.filter((row) => row.hasText && (row.left < 0 || row.right < 0));
    const names = offenders.map((row) => `${row.label} (button ${row.width.toFixed(1)}px, overhang ${Math.max(-row.left, -row.right).toFixed(1)}px)`);
    expect(names, `labels that overflow their button at ${width}px`).toEqual([]);

    const perRow = {};
    for (const row of rows) perRow[row.top] = (perRow[row.top] || 0) + 1;
    console.log(`WIDTH ${width}: per row ${Object.values(perRow).join('+')}, narrowest button ${Math.min(...rows.map((r) => r.width)).toFixed(1)}px`);
  });
}
