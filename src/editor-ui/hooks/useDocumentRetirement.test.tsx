import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useEffect, useRef, useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPdf, type PdfLoadController } from '../../editor/workspace/loadPdf.ts';
import { useDocumentRetirement } from './useDocumentRetirement.ts';
import { getPdfjs } from '../../editor/adapters/pdf/pdfjsLoader.js';

vi.mock('../../editor/adapters/pdf/pdfjsLoader.js', () => ({ getPdfjs: vi.fn() }));

/** A pdf.js stand-in that throws like a dead transport once destroyed. */
function fakeDocument(name: string, log: string[]) {
  const doc: any = {
    name,
    numPages: 1,
    destroyed: false,
    destroy: vi.fn(async () => { doc.destroyed = true; log.push(`destroy:${name}`); }),
    getPage: vi.fn(async () => {
      if (doc.destroyed) throw new TypeError(`${name}: transport destroyed`);
      log.push(`use:${name}`);
      return {};
    }),
  };
  const task: any = { promise: Promise.resolve(doc), destroy: vi.fn(async () => { doc.destroyed = true; log.push(`destroyTask:${name}`); }) };
  return { doc, task };
}

let root: HTMLElement | null = null;
afterEach(() => {
  if (root) render(null, root);
  root?.remove();
  root = null;
});

describe('document retirement (RED-56)', () => {
  it('destroys the old document only after the pdfDocument prop has swapped', async () => {
    const log: string[] = [];
    const a = fakeDocument('A', log);
    const b = fakeDocument('B', log);
    vi.mocked(getPdfjs).mockResolvedValue({ getDocument: vi.fn().mockReturnValueOnce(a.task).mockReturnValueOnce(b.task) } as any);

    const errors: unknown[] = [];
    let api!: { load: () => Promise<void>; controller: { current: PdfLoadController | null } };

    // Mirrors the tools: a state-held pdfDocument, nulled by `initialize`, set by `onDocument`,
    // and a child that calls into whatever document the prop holds, on every commit.
    function Child({ pdfDocument }: { pdfDocument: any }) {
      useEffect(() => {
        if (pdfDocument) pdfDocument.getPage(1).catch((e: unknown) => errors.push(e));
      }, [pdfDocument]);
      return null;
    }
    function Tool() {
      const [pdfDocument, setPdfDocument] = useState<any>(null);
      const retireDocument = useDocumentRetirement(pdfDocument);
      const loadIdRef = useRef(0);
      const loadControllerRef = useRef<PdfLoadController | null>(null);
      api = {
        controller: loadControllerRef,
        load: () => loadPdf({
          file: new File(['%PDF'], 'x.pdf'), bytes: new ArrayBuffer(8), loadIdRef, loadControllerRef, retireDocument,
          initialize: () => { log.push('initialize'); setPdfDocument(null); },
          onDocument: (doc: any) => { setPdfDocument(doc); },
          clearDraft: () => {}, setStatus: () => {}, setAnnouncement: () => {},
        }),
      };
      return <Child pdfDocument={pdfDocument} />;
    }

    root = document.createElement('div');
    await act(async () => { render(<Tool />, root!); });
    await act(async () => { await api.load(); });
    expect(log).toEqual(['initialize', 'use:A']);

    // Replace A with B. Nothing may destroy A inside the load that starts the swap.
    await act(async () => {
      const second = api.load();
      expect(a.doc.destroyed).toBe(false);
      await second;
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    expect(a.doc.destroyed).toBe(true);
    expect(b.doc.destroyed).toBe(false);
    // A is destroyed strictly after `initialize` swapped the prop to null, and never used afterwards.
    expect(log.indexOf('destroyTask:A')).toBeGreaterThan(log.indexOf('initialize', 2));
    expect(log.filter((entry) => entry === 'use:A')).toHaveLength(1);
    expect(log.slice(log.indexOf('destroyTask:A')).some((entry) => entry === 'use:A')).toBe(false);
    expect(errors).toEqual([]);
  });

  it('destroys the committed document on unmount, whichever cleanup runs first', async () => {
    const log: string[] = [];
    const a = fakeDocument('A', log);
    vi.mocked(getPdfjs).mockResolvedValue({ getDocument: vi.fn().mockReturnValueOnce(a.task) } as any);
    let api!: { load: () => Promise<void>; controller: { current: PdfLoadController | null } };

    function Tool() {
      const [pdfDocument, setPdfDocument] = useState<any>(null);
      const retireDocument = useDocumentRetirement(pdfDocument);
      const loadIdRef = useRef(0);
      const loadControllerRef = useRef<PdfLoadController | null>(null);
      // The tools cancel the active load from their own unmount effect.
      useEffect(() => () => { loadControllerRef.current?.cancel(); }, []);
      api = {
        controller: loadControllerRef,
        load: () => loadPdf({
          file: new File(['%PDF'], 'x.pdf'), bytes: new ArrayBuffer(8), loadIdRef, loadControllerRef, retireDocument,
          initialize: () => {}, onDocument: (doc: any) => { setPdfDocument(doc); },
          clearDraft: () => {}, setStatus: () => {}, setAnnouncement: () => {},
        }),
      };
      return null;
    }

    root = document.createElement('div');
    await act(async () => { render(<Tool />, root!); });
    await act(async () => { await api.load(); });
    expect(a.doc.destroyed).toBe(false);

    await act(async () => { render(null, root!); });
    expect(a.doc.destroyed).toBe(true);
    expect(a.task.destroy).toHaveBeenCalled();
  });

  it('a document that was published but never committed is still destroyed', async () => {
    const log: string[] = [];
    const a = fakeDocument('A', log);
    const b = fakeDocument('B', log);
    vi.mocked(getPdfjs).mockResolvedValue({ getDocument: vi.fn().mockReturnValueOnce(a.task).mockReturnValueOnce(b.task) } as any);
    let api!: { load: () => Promise<void> };

    function Tool() {
      const [pdfDocument, setPdfDocument] = useState<any>(null);
      const retireDocument = useDocumentRetirement(pdfDocument);
      const loadIdRef = useRef(0);
      const loadControllerRef = useRef<PdfLoadController | null>(null);
      api = {
        load: () => loadPdf({
          file: new File(['%PDF'], 'x.pdf'), bytes: new ArrayBuffer(8), loadIdRef, loadControllerRef, retireDocument,
          initialize: () => { setPdfDocument(null); }, onDocument: (doc: any) => { setPdfDocument(doc); },
          clearDraft: () => {}, setStatus: () => {}, setAnnouncement: () => {},
        }),
      };
      return null;
    }

    root = document.createElement('div');
    await act(async () => { render(<Tool />, root!); });
    // Both loads run inside one act(): A is published and replaced before Preact commits it.
    await act(async () => { await api.load(); await api.load(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(a.doc.destroyed).toBe(true);
    expect(b.doc.destroyed).toBe(false);
  });
});
