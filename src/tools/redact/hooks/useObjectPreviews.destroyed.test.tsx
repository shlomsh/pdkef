import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { DeletablePdfObject } from '../components/DeletableObjectOverlay.tsx';
import { fakePdfDocument } from '../../../test/support/fakePdfJs.ts';

// The project carries no Node ambient types; Vitest provides this at runtime.
declare const process: { on(event: string, handler: (reason: unknown) => void): void; off(event: string, handler: (reason: unknown) => void): void };

const reportError = vi.fn();
vi.mock('../../../lib/errorReport.ts', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
vi.mock('../../../editor/adapters/pdf/pdfjsLoader.js', () => ({
  getPdfjs: async () => ({ AnnotationMode: { DISABLE: 0 }, OPS: {} }),
}));

import useObjectPreviews from './useObjectPreviews.ts';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// pdf.js reads `this._intentStates` on a page whose document was destroyed.
const anObject = (): DeletablePdfObject => ({ id: 'a', kind: 'text', pageIndex: 0, rect: { left: 0, top: 0, width: 1, height: 1 }, start: 0, end: 1 });

const destroyedError = () => new TypeError("Cannot read properties of undefined (reading '_intentStates')");

describe('useObjectPreviews when the document is replaced and destroyed mid-read', () => {
  let host: HTMLElement | null = null;
  let unhandled: unknown[];
  const onUnhandled = (e: unknown) => unhandled.push(e);

  beforeEach(() => {
    reportError.mockClear();
    unhandled = [];
    process.on('unhandledRejection', onUnhandled);
    vi.spyOn(console, 'error').mockImplementation(() => {});
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
    const oldDoc = fakePdfDocument({ getPage: vi.fn(async () => page) });
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
    let rejectPage!: () => void;
    const oldDoc = fakePdfDocument({ getPage: () => new Promise((_, reject) => { rejectPage = () => reject(destroyedError()); }) });
    const newDoc = fakePdfDocument({ getPage: () => new Promise(() => {}) });
    const objects = [anObject()];
    const Probe = ({ doc }: { doc: PDFDocumentProxy }) => { useObjectPreviews(doc, objects); return null; };

    act(() => render(<Probe doc={oldDoc} />, host!));
    await act(flush);
    act(() => render(<Probe doc={newDoc} />, host!));
    rejectPage();
    await act(flush);

    expect(reportError).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  });
});

describe('useObjectPreviews genuine errors', () => {
  it('still reports an error from a document that is current', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const page = { getOperatorList: async () => { throw new Error('bad stream'); }, commonObjs: { get: () => null } };
    const doc = fakePdfDocument({ getPage: async () => page });
    const objects = [anObject()];
    const host = document.createElement('div');
    document.body.appendChild(host);
    reportError.mockClear();
    const Probe = () => { useObjectPreviews(doc, objects); return null; };
    act(() => render(<Probe />, host));
    await act(flush);
    await flush();
    expect(reportError).toHaveBeenCalledWith('redact', expect.any(Error), 'read_glyphs');
    act(() => render(null, host));
    host.remove();
    vi.restoreAllMocks();
  });
});
