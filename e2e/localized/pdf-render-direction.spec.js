import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// A canvas inherits `direction` from CSS, and pdf.js paints each glyph with
// `fillText` at the default `textAlign: start`, so on a dir="rtl" page every
// glyph used to land shifted left by its own advance and Hebrew words tore
// apart on /he/sign/ while /sign/ was fine. `getPdfRenderContext` forces ltr
// on the context; this is the only place that can prove it, since jsdom has
// no canvas. Same PDF, both editions, the page bitmaps must be identical.
test.use({ serviceWorkers: 'block' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEBREW_PAGE = '/he/sign/';

async function makeTextPdf() {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const heebo = await pdf.embedFont(fs.readFileSync(path.join(__dirname, '../../public/fonts/Heebo-Bold.ttf')), { subset: true });
  const page = pdf.addPage([400, 200]);
  // Visual order is what the content stream places; Latin and Hebrew both shift under rtl.
  page.drawText('0101/130', { x: 24, y: 150, size: 24, font: heebo });
  page.drawText('דבוע סיטרכ', { x: 160, y: 100, size: 32, font: heebo });
  return Buffer.from(await pdf.save());
}

async function renderedPageBitmap(page, route, buffer) {
  await page.goto(route);
  await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'text.pdf', mimeType: 'application/pdf', buffer });
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  // pdf.js paints asynchronously after the canvas mounts; wait for ink.
  await expect
    .poll(() =>
      canvas.evaluate((el) => {
        const ctx = el.getContext('2d');
        const { data } = ctx.getImageData(0, 0, el.width, el.height);
        for (let i = 3; i < data.length; i += 4) if (data[i] !== 0 && (data[i - 1] < 128)) return true;
        return false;
      }),
    )
    .toBe(true);
  const dataUrl = await canvas.evaluate((el) => el.toDataURL('image/png'));
  return crypto.createHash('sha1').update(dataUrl).digest('hex');
}

test('the Hebrew edition paints a PDF page pixel-identically to the English one', async ({ page }) => {
  const response = await page.goto(HEBREW_PAGE);
  test.skip(!response || response.status() === 404, `${HEBREW_PAGE} is not built`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  const buffer = await makeTextPdf();
  const english = await renderedPageBitmap(page, '/sign/', buffer);
  const hebrew = await renderedPageBitmap(page, HEBREW_PAGE, buffer);
  expect(hebrew, 'page bitmap digest differs between /he/sign/ and /sign/').toBe(english);
});
