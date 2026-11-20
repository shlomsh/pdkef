import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useEffect, useRef, useState } from 'preact/hooks';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { loadPdf, type PdfLoadController } from '#editor/workspace/loadPdf.ts';
import { useDocumentRetirement } from './useDocumentRetirement.ts';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { buildPdf, legacyPdfjs } from '../../test/support/redactCheckPdfs.test-helper.ts';

// The loader, loadPdf and the hook run for real, on real pdf.js documents. The shipped loader points at a browser
// Worker, which node does not have. Forced: the same pdf.js, its legacy (node) build.
vi.mock('#lib/pdf/loadPdfjs.js', { spy: true });

declare const process: { cwd(): string };
// jsdom resolves the helper's worker URL to http; point pdf.js at the legacy build's own file.
const workerUrl = `file://${process.cwd()}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`;
Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', { get: () => workerUrl, set() {}, configurable: true });

/** Every loading task the loader opened, in order, each with its destroy watched (the real destroy still runs). */
let tasks: ReturnType<ReturnType<typeof legacyPdfjs>['getDocument']>[];
/** Every document a load handed over, in order, with getPage watched (the real ones still run). */
let docs: PDFDocumentProxy[];
let pdfBytes: ArrayBuffer;

beforeAll(async () => {
  const bytes = await buildPdf([{ lines: ['hello'] }]);
  pdfBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
});

beforeEach(() => {
  tasks = [];
  docs = [];
  const lib = legacyPdfjs();
  vi.mocked(getPdfjs).mockResolvedValue({
    ...lib,
    getDocument: ((params: Parameters<typeof lib.getDocument>[0]) => {
      const task = lib.getDocument(params);
      vi.spyOn(task, 'destroy');
      tasks.push(task);
      return task;
    }) as typeof lib.getDocument,
  });
});

/** What a tool does with a document it is handed: keep it, with its calls watched. */
function watch(doc: PDFDocumentProxy): PDFDocumentProxy {
  vi.spyOn(doc, 'getPage');
  docs.push(doc);
  return doc;
}

let root: HTMLElement | null = null;
afterEach(() => {
  if (root) render(null, root);
  root?.remove();
  root = null;
});

describe('document retirement (RED-56)', () => {
  it('destroys the old document only after the pdfDocument prop has swapped', async () => {
    const initialized = vi.fn();
    const errors: unknown[] = [];
    let api!: { load: () => Promise<void>; controller: { current: PdfLoadController | null } };

    // Mirrors the tools: a state-held pdfDocument, nulled by `initialize`, set by `onDocument`,
    // and a child that calls into whatever document the prop holds, on every commit.
    function Child({ pdfDocument }: { pdfDocument: PDFDocumentProxy | null }) {
      useEffect(() => {
        if (pdfDocument) pdfDocument.getPage(1).catch((e: unknown) => errors.push(e));
      }, [pdfDocument]);
      return null;
    }
    function Tool() {
      const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
      const retireDocument = useDocumentRetirement(pdfDocument);
      const loadIdRef = useRef(0);
      const loadControllerRef = useRef<PdfLoadController | null>(null);
      api = {
        controller: loadControllerRef,
        load: () => loadPdf({
          file: new File(['%PDF'], 'x.pdf'), bytes: pdfBytes, loadIdRef, loadControllerRef, retireDocument,
          initialize: () => { initialized(); setPdfDocument(null); },
          onDocument: (doc) => { setPdfDocument(watch(doc)); },
          clearDraft: () => {}, setStatus: () => {}, setAnnouncement: () => {},
        }),
      };
      return <Child pdfDocument={pdfDocument} />;
    }

    root = document.createElement('div');
    await act(async () => { render(<Tool />, root!); });
    await act(async () => { await api.load(); });
    expect(docs[0].getPage).toHaveBeenCalledTimes(1);
    expect(initialized).toHaveBeenCalledTimes(1);

    // Replace A with B. Nothing may destroy A inside the load that starts the swap.
    await act(async () => {
      const second = api.load();
      expect(tasks[0].destroy).not.toHaveBeenCalled();
      await second;
    });
    await act(async () => {});

    expect(tasks[0].destroyed).toBe(true);
    expect(tasks[1].destroyed).toBe(false);
    // A is destroyed strictly after `initialize` swapped the prop to null, and never used afterwards.
    const destroyedAt = vi.mocked(tasks[0].destroy).mock.invocationCallOrder[0];
    expect(destroyedAt).toBeGreaterThan(initialized.mock.invocationCallOrder[1]);
    expect(docs[0].getPage).toHaveBeenCalledTimes(1);
    expect(Math.max(...vi.mocked(docs[0].getPage).mock.invocationCallOrder)).toBeLessThan(destroyedAt);
    expect(errors).toEqual([]);
  });

  it('destroys the committed document on unmount, whichever cleanup runs first', async () => {
    let api!: { load: () => Promise<void>; controller: { current: PdfLoadController | null } };

    function Tool() {
      const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
      const retireDocument = useDocumentRetirement(pdfDocument);
      const loadIdRef = useRef(0);
      const loadControllerRef = useRef<PdfLoadController | null>(null);
      // The tools cancel the active load from their own unmount effect.
      useEffect(() => () => { loadControllerRef.current?.cancel(); }, []);
      api = {
        controller: loadControllerRef,
        load: () => loadPdf({
          file: new File(['%PDF'], 'x.pdf'), bytes: pdfBytes, loadIdRef, loadControllerRef, retireDocument,
          initialize: () => {}, onDocument: (doc) => { setPdfDocument(watch(doc)); },
          clearDraft: () => {}, setStatus: () => {}, setAnnouncement: () => {},
        }),
      };
      return null;
    }

    root = document.createElement('div');
    await act(async () => { render(<Tool />, root!); });
    await act(async () => { await api.load(); });
    expect(tasks[0].destroyed).toBe(false);

    await act(async () => { render(null, root!); });
    expect(tasks[0].destroyed).toBe(true);
    expect(tasks[0].destroy).toHaveBeenCalled();
  });

  it('a document that was published but never committed is still destroyed', async () => {
    let api!: { load: () => Promise<void> };

    function Tool() {
      const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
      const retireDocument = useDocumentRetirement(pdfDocument);
      const loadIdRef = useRef(0);
      const loadControllerRef = useRef<PdfLoadController | null>(null);
      api = {
        load: () => loadPdf({
          file: new File(['%PDF'], 'x.pdf'), bytes: pdfBytes, loadIdRef, loadControllerRef, retireDocument,
          initialize: () => { setPdfDocument(null); }, onDocument: (doc) => { setPdfDocument(watch(doc)); },
          clearDraft: () => {}, setStatus: () => {}, setAnnouncement: () => {},
        }),
      };
      return null;
    }

    root = document.createElement('div');
    await act(async () => { render(<Tool />, root!); });
    // Both loads run inside one act(): A is published and replaced before Preact commits it.
    await act(async () => { await api.load(); await api.load(); });
    await act(async () => {});
    expect(tasks[0].destroyed).toBe(true);
    expect(tasks[1].destroyed).toBe(false);
  });
});
