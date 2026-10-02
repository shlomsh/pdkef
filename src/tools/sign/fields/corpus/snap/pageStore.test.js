import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { listPages, loadPageRaster, loadTruth } from './pageStore.js';

const PAGES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pages');

describe('snap corpus page store', () => {
  const pages = listPages();

  it('lists at least five pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(5);
  });

  describe.each(pages.map((p) => [p.id, p]))('%s', (id, entry) => {
    it('loads a raster whose header and data match the manifest', () => {
      const header = zlib.gunzipSync(fs.readFileSync(path.join(PAGES, `${id}.gray.gz`))).subarray(0, 8);
      expect(header.readUInt32LE(0)).toBe(entry.width);
      expect(header.readUInt32LE(4)).toBe(entry.height);
      const raster = loadPageRaster(id);
      expect(raster.width).toBe(entry.width);
      expect(raster.height).toBe(entry.height);
      expect(raster.pxPerPoint).toBe(entry.pxPerPoint);
      expect(raster.data).toBeInstanceOf(Uint8ClampedArray);
      expect(raster.data.length).toBe(entry.width * entry.height);
    });

    it('has a page size consistent with its pixel size', () => {
      expect(Math.abs(entry.width - entry.pageWidthPts * entry.pxPerPoint)).toBeLessThan(1.5);
      expect(Math.abs(entry.height - entry.pageHeightPts * entry.pxPerPoint)).toBeLessThan(1.5);
    });

    it('has finite, well-ordered printed rules', () => {
      const truth = loadTruth(id);
      expect(truth.id).toBe(id);
      expect(truth.pageWidthPts).toBe(entry.pageWidthPts);
      expect(truth.pageHeightPts).toBe(entry.pageHeightPts);
      expect(truth.rules.length).toBeGreaterThanOrEqual(15);
      const ids = new Set();
      for (const rule of truth.rules) {
        for (const key of ['x0', 'x1', 'y', 'thickness']) expect(Number.isFinite(rule[key])).toBe(true);
        expect(rule.x0).toBeLessThan(rule.x1);
        expect(rule.y).toBeGreaterThanOrEqual(0);
        expect(rule.y).toBeLessThanOrEqual(truth.pageHeightPts);
        expect(rule.kind).toBe('rule');
        ids.add(rule.id);
      }
      expect(ids.size).toBe(truth.rules.length);
    });

    it('has ink under every rule in the raster (the truth lines up with the pixels)', () => {
      const raster = loadPageRaster(id);
      const { rules } = loadTruth(id);
      const aligned = rules.filter((rule) => {
        const row = Math.floor(rule.y * raster.pxPerPoint);
        const xa = Math.floor(rule.x0 * raster.pxPerPoint);
        const xb = Math.ceil(rule.x1 * raster.pxPerPoint) - 1;
        let best = 255;
        for (const r of [row - 1, row, row + 1]) {
          let sum = 0;
          for (let x = xa; x <= xb; x += 1) sum += raster.data[r * raster.width + x];
          best = Math.min(best, sum / (xb - xa + 1));
        }
        return best < 128;
      });
      expect(aligned.length / rules.length).toBeGreaterThanOrEqual(0.99);
    });
  });
});
