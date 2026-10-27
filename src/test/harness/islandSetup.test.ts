// @vitest-environment jsdom
/**
 * The island setup files (`./setup/`) fake the pdf.js edge for the island projects of vitest.config.js
 * only (ARCH-78). This test is not an island test, so it must see the real modules.
 */
import { describe, expect, it, vi } from 'vitest';
import * as thumbnails from '../../lib/thumbnails.js';
import * as pdfEncryption from '../../lib/pdfEncryption.ts';
import * as pdfjsDist from 'pdfjs-dist';

describe('the island pdf.js fakes stay inside the island projects', () => {
  it('a non-island test imports the real thumbnails module', () => {
    for (const name of ['openThumbnailSource', 'renderThumbnail', 'renderComparePreview', 'renderPdfThumbnails']) {
      expect(vi.isMockFunction((thumbnails as Record<string, unknown>)[name])).toBe(false);
    }
  });

  it('a non-island test imports the real encryption probe', () => {
    expect(vi.isMockFunction(pdfEncryption.probeEncryption)).toBe(false);
  });

  it('a non-island test imports the real pdfjs-dist', () => {
    expect(vi.isMockFunction(pdfjsDist.getDocument)).toBe(false);
  });
});
