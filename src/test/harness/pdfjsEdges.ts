/**
 * The pdf.js edge of the island tests (ARCH-78): what jsdom cannot run, faked once, configured per test
 * through `harness.pdfjs` (see `toolHarness.ts`).
 *
 * Three edges, each registered as a `vi.mock` by a setup file under `./setup/` that only the island
 * projects in `vitest.config.js` load, so no other test sees them:
 *   - the encryption probe (`lib/pdfEncryption.ts`: pdf.js's worker): `probe`
 *   - the thumbnail source and previews (`lib/thumbnails.js`: pdf.js painting onto a canvas): `thumbnails`, `source`
 *   - the `pdfjs-dist` module itself, for Redact, which reads text and metadata through it: `getDocument`
 * Everything above them runs for real. `resetPdfjsEdges()` puts every default back; `installToolHarness()`
 * calls it, so each test starts from the same fakes.
 */
import { vi } from 'vitest';
import type { probeEncryption } from '../../lib/pdfEncryption.ts';
type ProbeAnswer = Awaited<ReturnType<typeof probeEncryption>>;

type Bytes = ArrayBuffer | Uint8Array;

// ---- the encryption probe -----------------------------------------------------------------------------------

const probe = vi.fn<(bytes: Bytes, ...rest: unknown[]) => Promise<ProbeAnswer>>();

// ---- the thumbnail source and previews -------------------------------------------------------------------------

/** How the fake source answers: `pageCount` set wins over counting the file's own pages with pdf-lib. */
const source = { pageCount: undefined as number | undefined, failOpen: false, opened: 0, destroyed: 0 };

const thumbnails = {
  openThumbnailSource: vi.fn(),
  renderThumbnail: vi.fn(),
  renderThumbnailWithMeta: vi.fn(),
  renderPdfThumbnails: vi.fn(),
  renderComparePreview: vi.fn(),
};

async function countPages(file: File): Promise<number> {
  const { PDFDocument } = await (await import('../../lib/pdfLib.js')).getPdfLib();
  return PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true }).then((doc: { getPageCount(): number }) => doc.getPageCount(), () => 0);
}

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
  probe,
  thumbnails,
  source,
  getDocument,
  pageItems,
  fakeDocument,
};

/** Every default back, every queued one-shot answer and every call record gone. */
export function resetPdfjsEdges(): void {
  probe.mockReset();
  probe.mockImplementation(async () => 'open');

  Object.assign(source, { pageCount: undefined, failOpen: false, opened: 0, destroyed: 0 });
  for (const fn of Object.values(thumbnails)) fn.mockReset();
  thumbnails.openThumbnailSource.mockImplementation(async (file: File) => {
    source.opened += 1;
    if (source.failOpen) throw new Error('bad pdf');
    const pageCount = source.pageCount ?? await countPages(file);
    return {
      file,
      pageCount,
      render: vi.fn(async (pageIndex: number) => `data:image/png;base64,fake-${pageIndex}`),
      destroy: vi.fn(async () => { source.destroyed += 1; }),
    };
  });
  thumbnails.renderThumbnail.mockImplementation(async () => 'data:image/png;base64,mock');
  thumbnails.renderThumbnailWithMeta.mockImplementation(async () => ({ dataUrl: 'data:image/png;base64,mock', pageCount: 2, width: 150, height: 194 }));
  thumbnails.renderPdfThumbnails.mockImplementation(async () => 0);
  thumbnails.renderComparePreview.mockImplementation(async (fileOrBlob: unknown) => `data:image/png;base64,${fileOrBlob instanceof File ? 'before' : 'after'}`);

  pageItems.clear();
  getDocument.mockReset();
  getDocument.mockImplementation(loadDocument);
}

resetPdfjsEdges();

/** What `harness.pdfjs` is: the edges above plus the one-line ways a test steers them. */
export function createPdfjsHarness() {
  const doc = (numPages: number, data?: BufferSource) => ({ promise: Promise.resolve(fakeDocument(numPages, data)), destroy: async () => {} });
  return {
    /** The probe spy, for `mockImplementation` and call assertions. */
    probe,
    /** Every probe from now on answers `protection`. */
    probeAs(protection: ProbeAnswer) { probe.mockResolvedValue(protection); },
    /** Every probe from now on never answers (the check is still running). */
    probeNeverAnswers() { probe.mockReturnValue(new Promise(() => {})); },
    /** The next probe waits; the test settles it with `release(protection)` or `reject(error)`. Later probes keep their answer. */
    holdNextProbe() {
      let settleOk!: (protection: ProbeAnswer) => void;
      let settleFail!: (error: unknown) => void;
      probe.mockImplementationOnce(() => new Promise<ProbeAnswer>((resolve, reject) => { settleOk = resolve; settleFail = reject; }));
      return {
        release: (protection: ProbeAnswer = 'open') => settleOk(protection),
        reject: (error: unknown) => settleFail(error),
      };
    },
    /** Spies of `lib/thumbnails.js`; `mockImplementation` them, assert on their calls. */
    thumbnails,
    /** The fake thumbnail source: set `pageCount` or `failOpen`; `opened` and `destroyed` count its lifetime. */
    source,
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
