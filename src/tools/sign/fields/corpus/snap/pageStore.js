// Node-only loader for the committed snap-corpus rasters and truth (README.md has the contract).
// Uses node:fs and node:zlib: tests, scoring scripts and dev tools only, never product code.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGES = path.join(HERE, 'pages');
const TRUTH = path.join(HERE, 'truth');

let manifestCache = null;

/** The manifest: [{ id, form, page, width, height, pxPerPoint, pageWidthPts, pageHeightPts }]. */
export function listPages() {
  manifestCache ??= JSON.parse(fs.readFileSync(path.join(PAGES, 'manifest.json'), 'utf8'));
  return manifestCache;
}

/** One page raster: gzip of u32 LE width, u32 LE height, then width*height gray bytes (0 black, 255 white). */
export function loadPageRaster(id) {
  const entry = listPages().find((page) => page.id === id);
  if (!entry) throw new Error(`snap corpus: no page "${id}"`);
  const bytes = zlib.gunzipSync(fs.readFileSync(path.join(PAGES, `${id}.gray.gz`)));
  const width = bytes.readUInt32LE(0);
  const height = bytes.readUInt32LE(4);
  const data = new Uint8ClampedArray(width * height);
  data.set(bytes.subarray(8, 8 + width * height));
  return { id, width, height, pxPerPoint: entry.pxPerPoint, data };
}

/** The printed rules of one page: { id, pageWidthPts, pageHeightPts, rules }. Points, origin top-left, y down. */
export function loadTruth(id) {
  return JSON.parse(fs.readFileSync(path.join(TRUTH, `${id}.json`), 'utf8'));
}
