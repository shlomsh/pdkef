import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makePdfBuffer as buildPdf } from './support/pdf.js';

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

const makePdfBuffer = () => buildPdf(null, { title: false, size: [300, 300] });

// A real PNG (not just a file with an image/png MIME type) so Image to PDF's
// pdf.embedPng() - which parses the bytes - has something valid to embed.
const pngBuffer = fs.readFileSync(path.join(__dirname, '../public/icons/icon-192.png'));

const tools = [
  {
    name: 'Split',
    path: '/split',
    file: { name: 'source.pdf', mimeType: 'application/pdf', bufferFn: makePdfBuffer },
    // The stage (2026-09-14): the output is prepared on idle, so there is no
    // action button; Download is a ready link whose accessible name carries
    // the count line ("Download 1 PDF 1 page · 1.2 KB"), hence the prefix match.
    actionName: null,
    downloadNameMatch: /^Download 1 PDF/,
    downloadAttr: 'extracted_source.pdf',
  },
  {
    name: 'Compress',
    path: '/compress',
    // A blank page has no images, so Compress rightly hands it back with no
    // download (COMP-01); mixed.pdf has photos to shrink.
    file: {
      name: 'source.pdf',
      mimeType: 'application/pdf',
      bufferFn: async () => fs.readFileSync(path.join(__dirname, '../src/tools/compress/__fixtures__/mixed.pdf')),
    },
    actionName: null,
    downloadName: 'Download Compressed PDF',
    // Not exact (SEO-25 "button anchor", 2026-09-12): DownloadButton's
    // `detail` prop adds a second, smaller line inside the link ("<size>,
    // <n>% smaller"), which is part of its accessible name for free - so an
    // exact match on just the label stops finding it. Every other tool in
    // this list still passes no `detail` and keeps its exact match.
    downloadNameMatch: /^Download Compressed PDF/,
    downloadAttr: 'source-compressed.pdf',
  },
  {
    name: 'PDF to Image',
    path: '/pdf-to-image',
    file: { name: 'source.pdf', mimeType: 'application/pdf', bufferFn: makePdfBuffer },
    // Converted on idle, like Split: Download is a ready link once the build
    // lands, its name carrying the size ("Download PNG · 412 KB").
    actionName: null,
    downloadNameMatch: /^Download PNG/,
  },
  {
    name: 'Image to PDF',
    path: '/image-to-pdf',
    file: { name: 'source.png', mimeType: 'image/png', bufferFn: async () => pngBuffer },
    // Built on pick, like PDF to Image; the name follows the first image.
    actionName: null,
    downloadNameMatch: /^Download PDF/,
    downloadAttr: 'source.pdf',
  },
  {
    name: 'Edit Pages',
    path: '/organize-pdf',
    file: { name: 'source.pdf', mimeType: 'application/pdf', bufferFn: makePdfBuffer },
    // Ticking "Add page numbers" is the cheapest way to make hasEdits true -
    // no drag/rotate/remove gesture required - which is exactly why it's the
    // right choice for a test whose subject is the output path, not the grid.
    setup: async (page) => {
      await page.getByLabel('Add page numbers').check();
    },
    // No Apply step: the output is prepared in the background.
    actionName: null,
    downloadNameMatch: /^Download/,
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

      if (tool.actionName) {
        await page.getByRole('button', { name: tool.actionName, exact: true }).click();
      }

      if (tool.name === 'Compress') {
        await expect(page.locator('[data-compress-status="done"]')).toBeVisible({ timeout: 60_000 });
      }

      const download = tool.downloadNameMatch
        ? page.getByRole('link', { name: tool.downloadNameMatch })
        : page.getByRole('link', { name: tool.downloadName, exact: true });
      await expect(download).toBeVisible();

      // A tool that builds on pick shows its link before the build lands; wait for the real object URL.
      await expect(download).toHaveAttribute('href', /^blob:/, { timeout: 30_000 });

      const downloadAttr = await download.getAttribute('download');
      expect(downloadAttr).toBeTruthy();
      if (tool.downloadAttr) {
        expect(downloadAttr).toBe(tool.downloadAttr);
      }
    });
  }
});
