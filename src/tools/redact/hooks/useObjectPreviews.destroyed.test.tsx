import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { DeletablePdfObject } from '../components/DeletableObjectOverlay.tsx';
import { fakePdfDocument } from '../../../test/support/fakePdfJs.ts';
import { PDFJS_WASM_URL } from '#lib/pdf/pdfjsWasm.js';
import { getPdfjs } from '#editor/adapters/pdf/pdfjsLoader.js';
import { listDeletableObjects } from '../lib/deleteObjects.js';
import { buildPdf, openOriginal } from '../../../test/support/redactCheckPdfs.test-helper.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';

// The project carries no Node ambient types; Vitest provides this at runtime.
declare const process: { on(event: string, handler: (reason: unknown) => void): void; off(event: string, handler: (reason: unknown) => void): void };

import { reportError } from '#lib/telemetry/errorReport.ts';

vi.mock('#lib/telemetry/errorReport.ts', { spy: true });

import useObjectPreviews from './useObjectPreviews.ts';

// Everything here is a chain of already-settled promises, so one event-loop turn carries it to its end.
const flush = () => drainPromises();

// pdf.js reads `this._intentStates` on a page whose document was destroyed.
const anObject = (): DeletablePdfObject => ({ id: 'a', kind: 'text', pageIndex: 0, rect: { left: 0, top: 0, width: 1, height: 1 }, start: 0, end: 1 });

/** A real file, opened in pdf.js, and the text objects Delete itself finds in it. */
async function openFile() {
  const bytes = await buildPdf([{ lines: ['Hello world'] }]);
  const opened = await openOriginal(bytes, PDFJS_WASM_URL);
  return { ...opened, objects: (await listDeletableObjects(bytes)) as DeletablePdfObject[] };
}

const destroyedError = () => new TypeError("Cannot read properties of undefined (reading '_intentStates')");

describe('useObjectPreviews when the document is replaced and destroyed mid-read', () => {
  let host: HTMLElement | null = null;
  let unhandled: unknown[];
  const onUnhandled = (e: unknown) => unhandled.push(e);

  beforeEach(() => {
    vi.mocked(reportError).mockClear();
    unhandled = [];
    process.on('unhandledRejection', onUnhandled);
    vi.spyOn(console, 'error');
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    act(() => render(null, host!));
    host!.remove();
    vi.restoreAllMocks();
  });

  it('reports nothing and commits no previews for the destroyed document (getOperatorList throws)', async () => {
    let destroyed = false;
    let releaseOps!: () => void;
    const page = {
      getOperatorList: () => new Promise((_, reject) => {
        releaseOps = () => reject(destroyedError());
      }),
      commonObjs: { get: () => null },
    };
    // Forced: the hook gives no moment between its getPage and getOperatorList to destroy a real document in, so this page
    // fails its read once the document is replaced, with the TypeError a real destroyed page throws (readGlyphs.test.js runs that one).
    const oldDoc = fakePdfDocument({ getPage: vi.fn(async () => page) });
    // Forced: the new document's read stays pending, as it does while pdf.js loads.
    const newDoc = fakePdfDocument({ getPage: vi.fn(() => new Promise(() => {})) });
    const objects = [anObject()];
    const seen: unknown[] = [];
    const Probe = ({ doc }: { doc: PDFDocumentProxy }) => {
      seen.push(useObjectPreviews(doc, objects));
      return null;
    };

    act(() => render(<Probe doc={oldDoc} />, host!));
    await act(flush);
    expect(releaseOps).toBeTypeOf('function'); // the read is in flight

    // the document is replaced (add_files) and the old one destroyed mid-await
    act(() => render(<Probe doc={newDoc} />, host!));
    destroyed = true;
    releaseOps();
    await act(flush);
    await flush();

    expect(destroyed).toBe(true);
    expect(reportError).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
    expect(seen.every((r) => r === objects)).toBe(true);
  });

  it('reports nothing when getPage itself throws after the document was replaced', async () => {
    const oldFile = await openFile();
    const newFile = await openFile();
    await getPdfjs();
    const objects = oldFile.objects;
    const getPage = vi.spyOn(oldFile.doc, 'getPage');
    const Probe = ({ doc }: { doc: PDFDocumentProxy }) => { useObjectPreviews(doc, objects); return null; };

    act(() => render(<Probe doc={oldFile.doc} />, host!));
    act(() => render(<Probe doc={newFile.doc} />, host!));
    await oldFile.close();
    await act(drainPromises);
    await drainPromises();

    // The old read did reach the destroyed document, and pdf.js refused it.
    expect(getPage).toHaveBeenCalledTimes(1);
    await expect(getPage.mock.results[0].value).rejects.toBeInstanceOf(Error);
    expect(reportError).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
    await newFile.close();
  });
});

describe('useObjectPreviews genuine errors', () => {
  it('still reports an error from a document that is current', async () => {
    const error = vi.spyOn(console, 'error');
    const page = { getOperatorList: async () => { throw new Error('bad stream'); }, commonObjs: { get: () => null } };
    const doc = fakePdfDocument({ getPage: async () => page });
    const objects = [anObject()];
    const host = document.createElement('div');
    document.body.appendChild(host);
    vi.mocked(reportError).mockClear();
    const Probe = () => { useObjectPreviews(doc, objects); return null; };
    act(() => render(<Probe />, host));
    await act(flush);
    await flush();
    expect(reportError).toHaveBeenCalledWith('redact', expect.any(Error), 'read_glyphs');
    expect(error.mock.calls).toEqual([["Redact could not read a page's text", expect.objectContaining({ message: 'bad stream' })]]);
    act(() => render(null, host));
    host.remove();
    vi.restoreAllMocks();
  });
});
