/**
 * The pdf.js edge of Redact's and Highlight's island tests (ARCH-78): the `pdfjs-dist` module itself, which
 * Redact reads text and metadata through, faked once and configured per test through `harness.pdfjs` (see
 * `toolHarness.ts`). Registered as a `vi.mock` by `./setup/pdfjsDistEdge.ts`, which only the island-redact
 * project in `vitest.config.js` loads, so no other test sees it. Every other tool's island test runs on real
 * pdf.js in Chromium (LAND-04 wave 6). `resetPdfjsEdges()` puts every default back; `installToolHarness()`
 * calls it, so each test starts from the same fakes.
 */
import { vi } from 'vitest';
// ---- pdfjs-dist ---------------------------------------------------------------------------------------------------

/** Text items per page (0-based), as pdf.js's text stream would hand them out. */
const pageItems = new Map<number, object[]>();

const fakePage = (pageIndex: number) => ({
  view: [0, 0, 612, 792],
  rotate: 0,
  getViewport: ({ scale = 1 }: { scale?: number } = {}) => ({ width: 612, height: 792, scale, viewBox: [0, 0, 612, 792] }),
  render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
  streamTextContent: () => {
    let sent = false;
    return { getReader: () => ({ read: async () => (sent ? { done: true } : (sent = true, { done: false, value: { items: pageItems.get(pageIndex) ?? [] } })) }) };
  },
  getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
  getAnnotations: async () => [],
  commonObjs: { get: () => { throw new Error('no font'); } },
  cleanup: () => {},
});

/** A pdf.js document of `numPages` pages. Its info (Title, Author, ...) is read back from the very bytes it was handed. */
const fakeDocument = (numPages: number, data?: BufferSource) => ({
  numPages,
  getPermissions: vi.fn(async () => null),
  getPage: vi.fn((pageNumber: number) => Promise.resolve(fakePage(pageNumber - 1))),
  getOutline: async () => null,
  getAttachments: async () => null,
  getMetadata: async () => {
    if (!data) return { info: {}, metadata: null };
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.load(data, { updateMetadata: false });
    return { info: { Title: doc.getTitle(), Author: doc.getAuthor(), Subject: doc.getSubject(), Keywords: doc.getKeywords() }, metadata: null };
  },
  destroy: async () => {},
});

const loadDocument = (args?: { data?: BufferSource }) => ({ promise: Promise.resolve(fakeDocument(2, args?.data)), destroy: async () => {} });
const getDocument = vi.fn(loadDocument);

// ---- the surface a test uses ------------------------------------------------------------------------------------

export const pdfjsEdges = {
  getDocument,
  pageItems,
  fakeDocument,
};

/** Every default back, every queued one-shot answer and every call record gone. */
export function resetPdfjsEdges(): void {
  pageItems.clear();
  getDocument.mockReset();
  getDocument.mockImplementation(loadDocument);
}

resetPdfjsEdges();

/** What `harness.pdfjs` is: the edges above plus the one-line ways a test steers them. */
export function createPdfjsHarness() {
  const doc = (numPages: number, data?: BufferSource) => ({ promise: Promise.resolve(fakeDocument(numPages, data)), destroy: async () => {} });
  return {
    /** The `pdfjs-dist` `getDocument` spy (Redact's edge). */
    getDocument,
    /** Text items per page (0-based) the fake pdf.js pages stream out. */
    pageItems,
    fakeDocument,
    /** The next pdf.js document read reports `numPages` pages. */
    pageCountOfNextRead(numPages: number) {
      getDocument.mockImplementationOnce(((args?: { data?: BufferSource }) => doc(numPages, args?.data)) as never);
    },
    /**
     * Holds the next pdf.js document read open until `release()`. Called just before a Download click, the next
     * read is the export's own, so the export stays in flight while the test acts on the editor. `finished`
     * settles once the read's document is destroyed.
     */
    holdNextDocumentRead() {
      let release: (() => void) | null = null;
      let done!: () => void;
      const finished = new Promise<void>((resolve) => { done = resolve; });
      getDocument.mockImplementationOnce(((args?: { data?: BufferSource }) => ({
        promise: new Promise((resolve) => { release = () => resolve(fakeDocument(2, args?.data)); }),
        destroy: async () => { done(); },
      })) as never);
      return { reached: () => release !== null, release: () => release!(), finished };
    },
  };
}
export type PdfjsHarness = ReturnType<typeof createPdfjsHarness>;
