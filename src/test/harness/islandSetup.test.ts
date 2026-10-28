// @vitest-environment jsdom
/**
 * The island setup files (`./setup/`) fake the pdf.js edge for the island projects of vitest.config.js
 * only (ARCH-78). This test is not an island test, so it must see the real modules.
 */
import { describe, expect, it, vi } from 'vitest';
import { openThumbnailSource, renderThumbnail, renderComparePreview, renderPdfThumbnails } from '#lib/pdf/thumbnails.js';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import * as pdfjsDist from 'pdfjs-dist';

describe('the island pdf.js fakes stay inside the island projects', () => {
  it('a non-island test imports the real thumbnails module', () => {
    for (const fn of [openThumbnailSource, renderThumbnail, renderComparePreview, renderPdfThumbnails]) {
      expect(vi.isMockFunction(fn)).toBe(false);
    }
  });

  it('a non-island test imports the real encryption probe', () => {
    expect(vi.isMockFunction(probeEncryption)).toBe(false);
  });

  it('a non-island test imports the real pdfjs-dist', () => {
    expect(vi.isMockFunction(pdfjsDist.getDocument)).toBe(false);
  });
});
