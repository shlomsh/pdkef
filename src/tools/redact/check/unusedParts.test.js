// RED-49: the saved-file check also reads the parts of the file no page shows.
import { describe, expect, it, beforeAll } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFString, StandardFonts } from '@cantoo/pdf-lib';
import { unreachableRefs } from '../../../editor/adapters/pdf/reachability.js';
import { termFinder } from '../find/finders.ts';
import { checkSavedFile } from './checkSavedFile.ts';
import { canRemove, findingText } from './checkCopy.ts';
import { locatePlaces, isSamePlace } from './placeLocator.ts';
import { readSavedFile } from './readSavedFile.ts';
import { removePlace } from './removePlace.ts';
import { PDFJS_WASM_URL } from '../../../lib/pdfjsWasm.js';

beforeAll(() => {
  const workerUrl = pathToFileURL(path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', { get() { return workerUrl; }, set() {}, configurable: true });
});

async function build({ leftovers }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 200]).drawText('Visible words', { x: 20, y: 160, size: 12, font });
  if (leftovers) {
    const ctx = doc.context;
    ctx.register(ctx.stream('BT /F1 12 Tf (Leftover) Tj ET'));
    ctx.register(ctx.stream('BT /F1 12 Tf [(Left) -20 (over2)] TJ ET'));
    ctx.register(ctx.obj({ Contents: PDFString.of('LeftoverNote') }));
  }
  return new Uint8Array(await doc.save({ useObjectStreams: false }));
}

async function read(bytes, withBytes = true) {
  const task = pdfjs.getDocument({ data: bytes.slice(), wasmUrl: PDFJS_WASM_URL });
  const doc = await task.promise;
  try {
    return await readSavedFile(pdfjs, doc, { picturePages: [], ...(withBytes ? { bytes } : {}) });
  } finally {
    await task.destroy();
  }
}

const unusedOf = (saved) => saved.places.filter((p) => p.kind === 'unused');
const finding = (saved, word) => checkSavedFile({
  terms: [{ label: word, source: 'typed', finder: termFinder(word) }],
  original: [],
  boxes: [],
  saved,
})[0].findings;

describe('parts of the file no page shows', () => {
  it('readSavedFile lists one place holding every readable string', async () => {
    const bytes = await build({ leftovers: true });
    expect(unreachableRefs(await PDFDocument.load(bytes))).toHaveLength(3);
    for (const withBytes of [true, false]) {
      const places = unusedOf(await read(bytes, withBytes));
      expect(places).toHaveLength(1);
      expect(places[0].removable).toBe(true);
      expect(places[0].pageIndex).toBeUndefined();
      for (const word of ['Leftover', 'Leftover2', 'LeftoverNote']) expect(places[0].text).toContain(word);
    }
  });

  it('a checked term found there is a removable in-place finding', async () => {
    const saved = await read(await build({ leftovers: true }));
    const found = finding(saved, 'Leftover');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: 'in-place', place: 'unused' });
    expect(canRemove(found[0])).toBe(true);
    expect(findingText(found[0])).toBe('In a part of the file no page shows.');
    expect(finding(saved, 'Visible')).toEqual([{ kind: 'in-text', pageIndex: 0 }]);
  });

  it('a clean file reports no such place', async () => {
    expect(unusedOf(await read(await build({ leftovers: false })))).toEqual([]);
  });

  it('the locator lists the same place, and matches it by kind alone', async () => {
    const bytes = await build({ leftovers: true });
    const saved = await read(bytes);
    const located = locatePlaces(await PDFDocument.load(bytes, { updateMetadata: false })).filter((l) => l.place.kind === 'unused');
    expect(located).toHaveLength(1);
    expect(located[0].place.text).toBe(unusedOf(saved)[0].text);
    expect(isSamePlace(located[0], { kind: 'unused', text: 'anything' })).toBe(true);
  });

  it('removePlace drops all of them and leaves the page text alone', async () => {
    const bytes = await build({ leftovers: true });
    const before = await read(bytes);
    const out = await removePlace(bytes, unusedOf(before)[0]);
    expect(unreachableRefs(await PDFDocument.load(out))).toEqual([]);
    const after = await read(out);
    expect(unusedOf(after)).toEqual([]);
    expect(after.pages.map((p) => p.text.text)).toEqual(before.pages.map((p) => p.text.text));
    expect(new TextDecoder('latin1').decode(out)).not.toContain('Leftover');
  });

  it('every removePlace drops them too, so Remove it on a title carries none along', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    doc.setTitle('title-secret');
    doc.context.register(doc.context.obj({ Contents: PDFString.of('LeftoverNote') }));
    const bytes = new Uint8Array(await doc.save({ useObjectStreams: false }));
    expect(new TextDecoder('latin1').decode(bytes)).toContain('LeftoverNote');
    const out = await removePlace(bytes, { kind: 'title', text: 'title-secret' });
    expect(new TextDecoder('latin1').decode(out)).not.toContain('LeftoverNote');
    expect(unreachableRefs(await PDFDocument.load(out))).toEqual([]);
  });
});
