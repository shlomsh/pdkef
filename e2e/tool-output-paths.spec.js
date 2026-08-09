import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from '@cantoo/pdf-lib';

/*
 * Split, Compress, PDF to Image, Image to PDF and Edit Pages are only ever
 * page-loaded in e2e (see tool-layout.spec.js) - their actual output paths
 * (URL.createObjectURL, the download anchor's href/download attributes) are
 * jsdom-only, and jsdom fakes just enough of the DOM that a broken object URL
 * or a canvas/pdf-lib call that only works in a real browser (Compress
 * rasterizes pages; Image to PDF's imagesToPdf embeds real PNG/JPEG bytes via
 * @cantoo/pdf-lib - both of which the component tests mock outright) would
 * not show up there. One parameterised spec per tool's minimal path to a
 * finished single-file download, asserting the real artefact rather than the
 * component's internal state.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function makePdfBuffer() {
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]);
  return Buffer.from(await doc.save());
}

// A real PNG (not just a file with an image/png MIME type) so Image to PDF's
// pdf.embedPng() - which parses the bytes - has something valid to embed.
const pngBuffer = fs.readFileSync(path.join(__dirname, '../public/icons/icon-192.png'));

const tools = [
  {
    name: 'Split',
    path: '/split',
    file: { name: 'source.pdf', mimeType: 'application/pdf', bufferFn: makePdfBuffer },
    actionName: 'Extract 1 page to single PDF',
    downloadName: 'Download PDF',
    downloadAttr: 'source-extracted.pdf',
  },
  {
    name: 'Compress',
    path: '/compress',
    file: { name: 'source.pdf', mimeType: 'application/pdf', bufferFn: makePdfBuffer },
    actionName: 'Compress PDF',
    downloadName: 'Download Compressed PDF',
    downloadAttr: 'source-compressed.pdf',
  },
  {
    name: 'PDF to Image',
    path: '/pdf-to-image',
    file: { name: 'source.pdf', mimeType: 'application/pdf', bufferFn: makePdfBuffer },
    actionName: 'Convert to PNG',
    downloadName: 'Download PNG',
  },
  {
    name: 'Image to PDF',
    path: '/image-to-pdf',
    file: { name: 'source.png', mimeType: 'image/png', bufferFn: async () => pngBuffer },
    actionName: 'Convert 1 image to PDF',
    downloadName: 'Download PDF',
    downloadAttr: 'images.pdf',
  },
  {
    name: 'Edit Pages',
    path: '/edit-pdf',
    file: { name: 'source.pdf', mimeType: 'application/pdf', bufferFn: makePdfBuffer },
    // Ticking "Add page numbers" is the cheapest way to make hasEdits true -
    // no drag/rotate/remove gesture required - which is exactly why it's the
    // right choice for a test whose subject is the output path, not the grid.
    setup: async (page) => {
      await page.getByLabel('Add page numbers').check();
    },
    actionName: 'Apply Changes',
    downloadName: 'Download PDF',
  },
];

test.describe('uncovered tools produce a real downloadable file', () => {
  for (const tool of tools) {
    test(`${tool.name} download link points at a real object URL`, async ({ page }) => {
      await page.goto(tool.path);
      await page.locator('astro-island[client="load"]:not([ssr])').first().waitFor();

      await page.locator('input[type="file"]').setInputFiles({
        name: tool.file.name,
        mimeType: tool.file.mimeType,
        buffer: await tool.file.bufferFn(),
      });

      await tool.setup?.(page);

      await page.getByRole('button', { name: tool.actionName, exact: true }).click();

      const download = page.getByRole('link', { name: tool.downloadName, exact: true });
      await expect(download).toBeVisible();

      const href = await download.getAttribute('href');
      expect(href).toMatch(/^blob:/);

      const downloadAttr = await download.getAttribute('download');
      expect(downloadAttr).toBeTruthy();
      if (tool.downloadAttr) {
        expect(downloadAttr).toBe(tool.downloadAttr);
      }
    });
  }
});
