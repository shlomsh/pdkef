/**
 * RED-16 corpus: Delete's preview of each text object on the real Hebrew pages
 * of spikes/red-01/ equals the text pdf.js reads there, Hebrew in reading
 * order, the same text Find searches. pdf.js-in-Node setup as
 * `find/glyphBoxes.corpus.test.js`; no mocks.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFJS_WASM_URL } from '../../../lib/pdfjsWasm.js';
import { readTextItems } from '../../../lib/pdfTextItems.ts';
import { buildPageText } from '../find/pageText.ts';
import { listDeletableObjects } from '../../../editor/adapters/pdf/deleteObjects.js';
import { withPreviews } from '../../../editor/adapters/pdf/objectPreviews.test-helper.js';

const CORPUS_DIR = path.resolve(__dirname, '../../../../spikes/red-01/corpus');
const collapse = (text) => text.replace(/\s+/g, ' ').trim();

async function read(filename) {
  const bytes = new Uint8Array(fs.readFileSync(path.join(CORPUS_DIR, filename)));
  const objects = (await withPreviews(bytes, await listDeletableObjects(bytes))).filter((o) => o.kind === 'text' && o.pageIndex === 0);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), wasmUrl: PDFJS_WASM_URL }).promise;
  const items = (await readTextItems(await pdf.getPage(1))).filter((item) => typeof item.str === 'string' && item.str.trim() !== '');
  return { objects, items };
}

/** What pdf.js reads inside an object's box: the items whose baseline start
 * lies in it, in Find's reading order. */
function textInBox(items, bbox) {
  const inside = items.filter(({ transform: [, , , , e, f] }) => e >= bbox.x && e <= bbox.x + bbox.width && f >= bbox.y && f <= bbox.y + bbox.height);
  return collapse(buildPageText(0, inside).text);
}

describe('Delete previews on the Hebrew corpus pages', () => {
  it.each(['mid-run-hebrew.pdf', 'hebrew-rtl-line.pdf'])('%s: each text object previews what pdf.js reads in its box', async (filename) => {
    const { objects, items } = await read(filename);
    expect(objects.length).toBeGreaterThan(0);
    for (const object of objects) {
      expect(object.preview, `${filename} ${object.id}`).toBe(textInBox(items, object.bbox));
    }
  });

  it('mid-run-hebrew.pdf: one run of three words reads right to left, in order', async () => {
    const { objects } = await read('mid-run-hebrew.pdf');
    expect(objects.map((o) => o.preview)).toEqual(['טסקטדוע ילארשידוס ראשנשטסקט']);
  });

  it('a real Hebrew form: the Hebrew words of every preview are in the order pdf.js reads them', async () => {
    // Letters only: a numbered line's "1." reads as ".1" by position (the
    // same reading the saved-file check uses), where pdf.js's bidi puts the
    // dot after the digit.
    const letters = (text) => collapse(text.replace(/[^\p{L}\s]/gu, ' '));
    const { objects, items } = await read('real-world-health-declaration-2021.pdf');
    const pageText = letters(buildPageText(0, items).text);
    const previews = objects.filter((o) => o.preview);
    expect(previews.length).toBeGreaterThan(10);
    for (const { preview } of previews) expect(pageText, preview).toContain(letters(preview));
  });
});
