// MERGE-01: the reproduction PDF (3 pages, coloured header rectangle and
// Helvetica-Bold body text per page, `@cantoo/pdf-lib` with object streams on)
// was reported to render a 150x194 list thumbnail with zero non-white pixels.
// The report turned out to be an artifact of how the file reached the page
// (a hand-typed base64 string corrupted two bytes of page 1's content stream;
// see the ticket's Root cause). This guard therefore sets the REAL bytes
// through the file input, the way a person does, and looks at pixels: jsdom
// has no canvas (thumbnails.test.js can only prove pdf.js was called
// correctly, not what it painted). `blank-thumbnail-repro.pdf` is the original
// repro file kept byte-identical in src/lib/__fixtures__; `three-page-header.pdf`
// is a second, independently generated file of the same shape; `num-1.pdf` is
// the known-good control.
//
// Direction A (2026-09-13): the rail's file rows (MergeRail.module.css's
// `.file-row`) no longer carry a per-file thumbnail - a colour tag dot
// stands in for it (see PdfMergeTool.tsx's `.tag-square`), and the rendered
// page-1 thumbnail lives only in the document grid's first page cell
// (PageStrip.tsx's `<img class="thumb">`, inside `li[data-key]`). The guard
// moves there; the fixture set and the pixel assertion are unchanged.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../../src/lib/__fixtures__');

// Counts non-white pixels of the loaded thumbnail <img> by drawing it into an
// off-screen canvas inside the page - this is real Chromium/WebKit canvas
// decoding of the actual data: URL the app produced, not a mock.
async function countNonWhitePixels(img) {
  return img.evaluate(async (imgEl) => {
    const bitmap = await createImageBitmap(imgEl);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) nonWhite++;
    }
    return nonWhite;
  });
}

async function uploadAndCountNonWhitePixels(page, fixtureName) {
  await page.goto('/merge/');
  await page.locator('astro-island[client="load"]:not([ssr])').waitFor();
  await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES_DIR, fixtureName));

  // The grid only renders an <img> once the page's own thumbnail resolves
  // (PageStrip.tsx); before that the cell's `.thumb-box` is empty, so waiting
  // for this locator to attach already proves the render finished, not just
  // that the file loaded. Page 1 of the uploaded file is always the grid's
  // first cell.
  const thumb = page.locator('ul[class*="grid"] > li[data-key] img[class*="thumb"]').first();
  await expect(thumb).toHaveAttribute('src', /^data:/, { timeout: 10_000 });

  return countNonWhitePixels(thumb);
}

for (const fixture of ['blank-thumbnail-repro.pdf', 'three-page-header.pdf', 'num-1.pdf']) {
  test(`${fixture} renders a non-blank page-1 list thumbnail`, async ({ page }) => {
    const nonWhitePixels = await uploadAndCountNonWhitePixels(page, fixture);
    expect(nonWhitePixels).toBeGreaterThan(0);
  });
}
