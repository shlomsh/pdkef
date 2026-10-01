/**
 * RED-15 corpus: Find's boxes, built from the page's glyphs, on the three real
 * forms of spikes/red-01/ (a US tax form, a US employment form, a Hebrew
 * health declaration) and its two Hebrew lines. Same pdf.js-in-Node setup as
 * `check/realForms.test.js`; no mocks.
 *
 * Every word of every page is boxed the way Find boxes a match. The box then
 * has to satisfy the two things the saved file depends on, judged on the
 * glyph read the export itself uses (the read the RED-12 spike scored against
 * PDFium's glyph boxes: its Hebrew line and its three forms agree to within a
 * point), not on the text the box was built from:
 *   - the glyph cores it reaches are exactly the match's own letters, so no
 *     neighbouring word is painted over or dropped from the text layer, and
 *   - each of those cores lies wholly inside it, so no sliver of a letter of
 *     the secret is left visible.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readGlyphs } from '../../../editor/adapters/pdf/readGlyphs.js';
import { wordsUnderBoxes } from '../../../editor/adapters/pdf/textLayer.ts';
import { applyAffineTransform, composeAffineTransforms, pageGeometryFromPdfJsPage } from '../../../editor/geometry/coords.ts';
import { PDFJS_WASM_URL } from '../../../lib/pdfjsWasm.js';
import { readTextItems } from '../../../lib/pdfTextItems.ts';
import { pageGlyphMap } from './itemGlyphs.ts';
import { matchBoxes } from './matchBoxes.ts';
import { buildPageText } from './pageText.ts';

beforeAll(() => {
  const workerUrl = pathToFileURL(path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', { get: () => workerUrl, set() {}, configurable: true });
});

const CORPUS_DIR = path.resolve(__dirname, '../../../../spikes/red-01/corpus');

async function readPage(filename) {
  const bytes = fs.readFileSync(path.join(CORPUS_DIR, filename));
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), wasmUrl: PDFJS_WASM_URL }).promise;
  const page = await doc.getPage(1);
  const items = (await readTextItems(page)).filter((item) => typeof item.str === 'string');
  return {
    text: buildPageText(0, items),
    geometry: pageGeometryFromPdfJsPage(page),
    glyphs: await readGlyphs(pdfjs, page),
  };
}

/** A glyph's core in viewport pixels: just under the baseline to 0.7 em,
 * inset from its sides (the band `textLayer.ts` decides what a box hides by). */
function coreOf(geometry, glyph) {
  const m = composeAffineTransforms(geometry.pdfToViewport, glyph.matrix);
  const w = Math.max(glyph.width, 0);
  const inset = Math.min(0.15, 0.3 * w);
  const pts = [[inset, -0.15], [w - inset, -0.15], [inset, 0.7], [w - inset, 0.7]].map(([x, y]) => applyAffineTransform({ x, y }, m));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), glyph };
}

const lettersOf = (text) => [...text.replace(/\s/g, '')].sort().join('');

/** Boxes every non-space run of the page's text, with glyphs or (null) with
 * the estimate, and returns the words that fail the two conditions above. */
function failures({ text, geometry, glyphs }, withGlyphs) {
  const cores = glyphs.filter((g) => !g.isSpace && g.unicode.trim() !== '').map((g) => coreOf(geometry, g));
  const bad = [];
  let total = 0;
  for (const token of text.text.matchAll(/\S+/gu)) {
    total += 1;
    const range = { start: token.index, end: token.index + token[0].length };
    const boxes = matchBoxes(text, range, geometry, undefined, 'cover', withGlyphs ? glyphs : null);
    const reached = [];
    const cut = [];
    for (const b of boxes) {
      const x0 = (b.left / 100) * geometry.width;
      const x1 = ((b.left + b.width) / 100) * geometry.width;
      const y0 = (b.top / 100) * geometry.height;
      const y1 = ((b.top + b.height) / 100) * geometry.height;
      for (const core of cores) {
        if (core.x0 > x1 || core.x1 < x0 || core.y0 > y1 || core.y1 < y0) continue;
        reached.push(core.glyph.unicode);
        if (core.x0 < x0 || core.x1 > x1 || core.y0 < y0 || core.y1 > y1) cut.push(core.glyph.unicode);
      }
    }
    if (lettersOf(reached.join('')) !== lettersOf(token[0]) || cut.length > 0) bad.push({ token: token[0], reached: reached.join(''), cut: cut.join('') });
  }
  return { total, bad };
}

const FORMS = [
  'real-world-irs-1040-2024.pdf',
  'real-world-uscis-i9-2025.pdf',
  'real-world-health-declaration-2021.pdf',
  'hebrew-rtl-line.pdf',
  'mid-run-hebrew.pdf',
];

describe('Find boxes on real forms (RED-15)', () => {
  for (const file of FORMS) {
    it(`${file}: every word's box holds its letters and touches no neighbour's`, async () => {
      const page = await readPage(file);
      const { total, bad } = failures(page, true);
      expect(total).toBeGreaterThan(0);
      expect(bad).toEqual([]);
    }, 30000);
  }

  it('maps all but a rotated stray of the items to their glyphs', async () => {
    for (const file of FORMS) {
      const { text, glyphs } = await readPage(file);
      const unmapped = pageGlyphMap(text, glyphs).items.filter((entry) => entry === null).length;
      expect(unmapped, file).toBeLessThanOrEqual(Math.ceil(text.items.length * 0.01));
    }
  }, 30000);

  it('is not vacuous: the estimate it replaces fails the same check on the forms', async () => {
    const page = await readPage('real-world-irs-1040-2024.pdf');
    expect(failures(page, false).bad.length).toBeGreaterThan(100);
  }, 30000);

  it('boxing the middle Hebrew word keeps both neighbours', async () => {
    const page = await readPage('real-world-health-declaration-2021.pdf');
    const start = page.text.text.indexOf('לביטחון');
    expect(start).toBeGreaterThan(0);
    const boxes = matchBoxes(page.text, { start, end: start + 'לביטחון'.length }, page.geometry, undefined, 'cover', page.glyphs);
    const [reached] = wordsUnderBoxes(page.glyphs, page.geometry, boxes);
    expect(reached).toEqual(['לביטחון']);
    expect(page.text.text).toContain('המשרד לביטחון לאומי');
  }, 30000);
});
