import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pointAtLegacyWorker } from '../../../test/support/realPdfjs.ts';
import type { PageGlyph } from '../lib/pageGlyphs.ts';
import type { DeletablePdfObject } from '../components/DeletableObjectOverlay.tsx';
import * as errorReport from '#lib/telemetry/errorReport.ts';
import { PDFJS_WASM_URL } from '#lib/pdf/pdfjsWasm.js';
import { GLYPH_BUDGET } from '../lib/find/itemGlyphs.ts';
import { listDeletableObjects } from '../lib/deleteObjects.js';
import { readGlyphs } from '../lib/readGlyphs.js';
import useObjectPreviews from './useObjectPreviews.ts';
import { getPdfjs } from '#editor/adapters/pdf/pdfjsLoader.js';
import { buildPdf, openOriginal } from '../../../test/support/redactCheckPdfs.test-helper.ts';
import type { PageSpec } from '../../../test/support/redactCheckPdfs.test-helper.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';

declare const process: { cwd(): string };

// Spy-through: the real glyph reader runs on real pages; the spy shows which pages were read.
vi.mock('../lib/readGlyphs.js', { spy: true });

pointAtLegacyWorker(pdfjs);

/** A real file, opened in pdf.js, and the text objects Delete itself finds in it. */
async function openFile(pages: PageSpec[]) {
  const bytes = await buildPdf(pages);
  const opened = await openOriginal(bytes, PDFJS_WASM_URL);
  return { ...opened, objects: (await listDeletableObjects(bytes)) as DeletablePdfObject[] };
}

// Real pages are read one after another through pdf.js, so waits are on the previews, never a fixed turn.
const settle = () => act(async () => { await drainPromises(); });

describe('useObjectPreviews', () => {
  let container: HTMLDivElement;
  const closers: Array<() => Promise<void>> = [];
  // A forced read in one test must not leak: reset puts the spy-through mock back on the real reader.
  beforeEach(() => { vi.mocked(readGlyphs).mockReset(); });
  afterEach(async () => {
    act(() => { render(null, container); });
    container.remove();
    vi.mocked(readGlyphs).mockClear();
    vi.restoreAllMocks();
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  function mount(doc: PDFDocumentProxy | null, objects: DeletablePdfObject[], enabled = true) {
    container = document.createElement('div');
    const seen: { current: DeletablePdfObject[] } = { current: [] };
    function Harness() {
      seen.current = useObjectPreviews(doc, objects, enabled);
      return null;
    }
    act(() => { render(h(Harness, {}), container); });
    return seen;
  }

  it('gives each text object the words its page shows there', async () => {
    const file = await openFile([{ lines: ['Hello world'] }]);
    closers.push(file.close);
    expect(file.objects.map((o) => o.kind)).toEqual(['text']);
    const objects = [file.objects[0], { ...file.objects[0], id: 'img', kind: 'image' as const }];
    const seen = mount(file.doc, objects);
    await waitUntil(() => seen.current.find((o) => o.id === file.objects[0].id)?.preview !== undefined);
    expect(seen.current.find((o) => o.id === file.objects[0].id)?.preview).toBe('Hello world');
    expect(seen.current.find((o) => o.id === 'img')?.preview).toBeUndefined();
  });

  it('leaves the objects as they are while nothing is read, without a document, or when switched off', async () => {
    const file = await openFile([{ lines: ['Hello world'] }]);
    closers.push(file.close);
    const objects = file.objects;
    expect(mount(null, objects).current).toBe(objects);
    await settle();
    const off = mount(file.doc, objects, false);
    await settle();
    expect(off.current).toBe(objects);
    expect(readGlyphs).not.toHaveBeenCalled();
  });

  it('gives no preview on a page whose text cannot be read', async () => {
    const file = await openFile([{ lines: ['Hello world'] }, { lines: ['later'] }]);
    closers.push(file.close);
    const second = file.objects.find((o) => o.pageIndex === 1)!;
    // Forced: a page whose text cannot be read is reported by the real reader, and this test is about a read that is not.
    vi.mocked(readGlyphs).mockResolvedValueOnce(null);
    vi.spyOn(errorReport, 'reportError');
    vi.spyOn(console, 'error');
    const seen = mount(file.doc, file.objects);
    // The read moves on to page 2 (real), which shows page 1 was passed over and not read as a failure.
    await waitUntil(() => seen.current.find((o) => o.id === second.id)?.preview === 'later', { timeout: 3000 });
    expect(seen.current.find((o) => o.pageIndex === 0)?.preview).toBeUndefined();
    expect(errorReport.reportError).not.toHaveBeenCalled();
  });

  it('stops reading pages past the glyph cap', async () => {
    const file = await openFile([{ lines: ['first page'] }, { lines: ['later'] }]);
    closers.push(file.close);
    const first = file.objects.find((o) => o.pageIndex === 0)!;
    const second = file.objects.find((o) => o.pageIndex === 1)!;
    // Page 1 yields its own words, then filler off the page.
    const actual = await vi.importActual<typeof import('../lib/readGlyphs.js')>('../lib/readGlyphs.js');
    const own = (await actual.readGlyphs(await getPdfjs(), await file.doc.getPage(1))) as PageGlyph[];
    const filler: PageGlyph[] = Array.from({ length: GLYPH_BUDGET - own.length }, () => (
      { unicode: 'x', isSpace: false, matrix: [10, 0, 0, 10, 900, 100], width: 0.5 }
    ));
    // Forced: a real page of 400,000 glyphs takes 1.5 s to list and read, and timed out on a loaded machine.
    vi.mocked(readGlyphs).mockResolvedValueOnce([...own, ...filler]);
    const getPage = vi.spyOn(file.doc, 'getPage');
    const seen = mount(file.doc, file.objects);
    // The hook asks pdf.js for the next page in the same turn it publishes page 1's words, if it will.
    await waitUntil(() => seen.current.find((o) => o.id === first.id)?.preview === 'first page');
    await settle();
    expect(getPage).toHaveBeenCalledTimes(1);
    expect(readGlyphs).toHaveBeenCalledTimes(1);
    expect(seen.current.find((o) => o.id === second.id)?.preview).toBeUndefined();
  });

  it('reports a page that throws while it is read', async () => {
    const file = await openFile([{ lines: ['Hello world'] }]);
    closers.push(file.close);
    const report = vi.spyOn(errorReport, 'reportError');
    vi.spyOn(console, 'error');
    // A real document that was destroyed while open: pdf.js refuses the page itself.
    const getPage = vi.spyOn(file.doc, 'getPage');
    await file.close();
    mount(file.doc, file.objects);
    await waitUntil(() => expect(report).toHaveBeenCalledWith('redact', expect.any(Error), 'read_object_previews'), { timeout: 3000 });
    // The error reported is the one pdf.js really threw for the page.
    expect(getPage.mock.results[0]).toMatchObject({ type: 'throw' });
    expect(report.mock.calls[0][1]).toBe(getPage.mock.results[0].value);
  });
});
