// Renders PDF pages to data-URL thumbnails using PDF.js.
// Loaded lazily (dynamic import) so it never blocks the initial page paint.
// The worker URL uses Vite's native `new URL(..., import.meta.url)` asset
// pattern (pdfjs-dist's documented Vite integration): Vite bundles and
// content-hashes the worker as a same-origin asset automatically, so it's
// never fetched from a CDN - required for both offline support and the
// no-third-party-network privacy guarantee.
import { getPdfRenderContext } from '../editor/adapters/pdf/renderContext.js';

let pdfjsLib;

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
  }
  return pdfjsLib;
}

/* Thumbnail throughput (P1, UX review): one pdf.js worker for every document
 * this module ever opens, not one per document. Profiled against the Merge
 * grid's own repro (five 1-page PDFs + one 12-page report, 17 pages,
 * astro dev on Chromium): each file's FIRST page cost 200-400ms - almost
 * entirely `getDocument()` spinning up a brand-new dedicated Web Worker
 * (fetch + parse + boot pdf.worker.min.mjs, then a handshake) - while every
 * later page of a document already open cost ~15-20ms. No long task ever
 * showed up on the main thread during that gap (PerformanceObserver
 * 'longtask'), which is what rules out contention with the debounced
 * pre-merge or draft-persist: the wait is real async worker-boot latency,
 * not the main thread being busy elsewhere.
 *
 * `getDocument({ worker })` only has `PDFDocumentLoadingTask.destroy()` tear
 * down a worker it created for itself: pdf.js's own `getDocument` sets
 * `task._worker = worker` solely in the branch where IT called
 * `PDFWorker.create(...)`, never when the caller supplies `worker` (see
 * `pdfjs-dist/build/pdf.mjs`'s `getDocument`). So the one shared worker
 * below survives every per-file `destroy()` in `openThumbnailSource` and
 * `renderThumbnailWithMeta` unchanged - each still tears down its own
 * document's transport exactly as before, just never the worker underneath
 * it - and many files can render through it at once (pdf.js multiplexes by
 * `docId` over the one Worker; this is the same mechanism a multi-tab pdf.js
 * viewer relies on, not something specific to this module).
 */
let sharedWorker;

function getSharedWorker(lib) {
  if (typeof lib.PDFWorker !== 'function') return undefined; // e.g. the unit-test mock, or a build without it
  if (!sharedWorker || sharedWorker.destroyed) sharedWorker = new lib.PDFWorker();
  return sharedWorker;
}

function openDocument(lib, bytes) {
  const worker = getSharedWorker(lib);
  return lib.getDocument(worker ? { data: bytes, worker } : { data: bytes });
}

const TARGET_WIDTH = 150;

/**
 * Renders one already-fetched pdf.js page to a data URL. Every per-page
 * render below (the single-shot `renderThumbnailWithMeta` and the
 * multi-page `openThumbnailSource`) goes through this one function, so the
 * white-prefill rule and the abort contract are each written once.
 *
 * MERGE-01: a PDF page is paper - it assumes white behind it. Canvas starts
 * transparent, and JPEG has no alpha, so without the prefill a transparent
 * page flattens to black. This used to be `renderThumbnail`-only; the Edit
 * Pages grid (`renderPdfThumbnails`) went through pdf.js with no prefill.
 *
 * What MERGE-01 actually was: the "blank page 1" report came from feeding
 * the reproduction PDF to the deployed page as a hand-typed base64 string
 * inside a browser script, which silently corrupted two bytes of page 1's
 * content stream. pdf.js's evaluator swallows a per-content-stream decode
 * error by default (`ignoreErrors`), so `page.render()` resolved against an
 * empty operator list and painted nothing, twice, for the same corrupted
 * bytes. The true file renders every page in Chromium, WebKit and Node
 * (src/tools/merge/e2e/thumbnail-render.spec.js sets the real bytes through the file
 * input and counts non-white pixels on the deployed build and on this one).
 * Nothing here can turn a silently dropped page into an error; what this
 * function guarantees is that such a page is at worst blank-and-white,
 * never black-and-transparent.
 *
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {{ width?: number, type?: string, quality?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ dataUrl: string, width: number, height: number }>}
 */
async function renderPageToDataUrl(page, opts = {}) {
  const { width = TARGET_WIDTH, type = 'image/png', quality, signal } = opts;

  if (signal?.aborted) {
    throw new DOMException('Thumbnail render aborted', 'AbortError');
  }

  const nativeViewport = page.getViewport({ scale: 1 });
  const scale = width / nativeViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = getPdfRenderContext(canvas);

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const renderTask = page.render({ canvasContext: context, viewport });

  // A signal that fires mid-render cancels the in-flight pdf.js RenderTask
  // (rather than just discarding our own promise) so pdf.js actually stops
  // painting and releases the canvas; the listener is removed in `finally`
  // whichever way the render settles, so it never fires again for a task
  // that already finished on its own.
  const onAbort = () => renderTask.cancel();
  if (signal) signal.addEventListener('abort', onAbort);
  try {
    await renderTask.promise;
  } catch (err) {
    if (signal?.aborted) {
      throw new DOMException('Thumbnail render aborted', 'AbortError');
    }
    throw err;
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
  }

  // The signal can also fire in the gap between the render settling and this
  // line running; a caller that aborted expects no result at all, not a
  // dataUrl for a page it already gave up on.
  if (signal?.aborted) {
    throw new DOMException('Thumbnail render aborted', 'AbortError');
  }

  return { dataUrl: canvas.toDataURL(type, quality), width: canvas.width, height: canvas.height };
}

/**
 * Render page 1 to a data URL, plus the metadata callers occasionally need
 * alongside it (how many pages the file has, and the pixel size the canvas
 * actually came out at, which is a rounded-down function of `width` and the
 * page's own aspect ratio - see `thumbnails.test.js` for the exact figure at
 * the default width). `renderThumbnail` below is a thin wrapper over this
 * that keeps its old `Promise<string>` contract, so the two never drift.
 *
 * Always takes a `File` rather than bytes you already hold, and that is
 * deliberate: pdf.js may detach the ArrayBuffer it is handed, so passing a
 * buffer that something else still needs (a draft's `fileBytes`, say) would
 * empty it out from under that owner. `file.arrayBuffer()` mints a fresh copy
 * each call, which is the only reason this is safe to call alongside draft
 * persistence.
 *
 * @param {File | Blob} file
 * @param {{ width?: number, type?: string, quality?: number, signal?: AbortSignal }} [opts]
 *   `width` in device px; `type`/`quality` go straight to `toDataURL`. The
 *   defaults are the merge tool's list thumbnails. Draft previews override all
 *   three, because they are bound for localStorage where size is the whole
 *   constraint - see draftStore's DRAFT_META_PREFIX.
 * @returns {Promise<{ dataUrl: string, pageCount: number, width: number, height: number }>}
 */
export async function renderThumbnailWithMeta(file, opts = {}) {
  const lib = await getPdfjs();
  const bytes = await file.arrayBuffer();
  const loadingTask = openDocument(lib, bytes);
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);
    const { dataUrl, width, height } = await renderPageToDataUrl(page, opts);
    return { dataUrl, pageCount: pdf.numPages, width, height };
  } finally {
    // pdf.js v6 exposes teardown on the loading task, not the document proxy.
    await loadingTask.destroy();
  }
}

/**
 * @param {File | Blob} file
 * @param {{ width?: number, type?: string, quality?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<string>} data URL
 */
export async function renderThumbnail(file, opts = {}) {
  const { dataUrl } = await renderThumbnailWithMeta(file, opts);
  return dataUrl;
}

/**
 * The small page-1 preview the home page's resume card shows in place of a
 * generic file icon, so a draft named `pdf1.pdf` is still recognisable.
 *
 * Sized and encoded for localStorage, not for looks: ~96 device px (2x a 48px
 * CSS box) as JPEG lands around 2-3KB of base64, where the 150px PNG the merge
 * list uses would be 15-25KB. That matters because this string is read
 * synchronously before first paint - see draftStore.readDraftMeta.
 */
export const DRAFT_PREVIEW_WIDTH = 96;

export function renderDraftPreview(file) {
  return renderThumbnail(file, {
    width: DRAFT_PREVIEW_WIDTH,
    type: 'image/jpeg',
    quality: 0.7,
  });
}

/**
 * The Compress tool's before/after slider (SEO-25) renders page 1 of the
 * original file next to page 1 of the compressed result, wide enough to
 * actually show the JPEG artifacting a compression level introduces - the
 * 150px list thumbnail above is too small to judge quality by. 900px is
 * roughly the same render cost as one page of `compressPdf`'s own 1.5x
 * ("Recommended") tier against a standard 612pt-wide page (scale ~= 1.47),
 * so opening the comparison costs about one extra page-render on top of
 * what compression itself already did - see PdfCompressTool.tsx for why
 * that stays affordable even opt-in on a phone.
 *
 * Deliberately takes a `File | Blob`, unlike `renderThumbnail`'s File-only
 * doc comment above: the compressed side is a `Blob` fresh out of
 * `PDFDocument.save()`, never a `File`, and `arrayBuffer()` is all either
 * type needs to give pdf.js.
 *
 * @param {File | Blob} fileOrBlob
 * @returns {Promise<string>} data URL
 */
export const COMPARE_PREVIEW_WIDTH = 900;

export function renderComparePreview(fileOrBlob) {
  return renderThumbnail(fileOrBlob, { width: COMPARE_PREVIEW_WIDTH, type: 'image/png' });
}

/**
 * One lazy pdf.js document handle per file, for callers that need more than
 * one page out of the same file without re-parsing it per page (the Edit
 * Pages grid, and any future island lane that wants on-demand rather than
 * eager thumbnails - MERGE-07/08). The document is already open and
 * `pageCount` already known by the time this resolves; `render()` is the
 * only per-page cost paid lazily.
 *
 * @param {File | Blob} file
 * @returns {Promise<{
 *   pageCount: number,
 *   render(pageIndex: number, opts?: { width?: number, type?: string, quality?: number, signal?: AbortSignal }): Promise<string>,
 *   destroy(): Promise<void>,
 * }>}
 */
export async function openThumbnailSource(file) {
  const lib = await getPdfjs();
  const bytes = await file.arrayBuffer();
  const loadingTask = openDocument(lib, bytes);
  const pdf = await loadingTask.promise;
  let destroyed = false;

  return {
    pageCount: pdf.numPages,
    async render(pageIndex, opts = {}) {
      // A destroyed source's loading task is gone; rendering against it would
      // hand pdf.js a torn-down document instead of failing loudly here.
      if (destroyed) {
        throw new Error('openThumbnailSource: render() called after destroy()');
      }
      const page = await pdf.getPage(pageIndex + 1);
      const { dataUrl } = await renderPageToDataUrl(page, opts);
      return dataUrl;
    },
    async destroy() {
      destroyed = true;
      await loadingTask.destroy();
    },
  };
}

/**
 * Renders a file's pages (all of them by default) to data URLs, one at a
 * time, calling `onPageRender(pageNumber, dataUrl)` in order as each
 * resolves - the Edit Pages page grid's contract, unchanged since before
 * this was reimplemented over `openThumbnailSource`. Every page now gets the
 * same white prefill `renderThumbnail` always has (MERGE-01: this function
 * used to have none, so a page pdf.js silently dropped would come back
 * transparent rather than visibly white - see `renderPageToDataUrl`).
 *
 * @param {File | Blob} file
 * @param {(pageNumber: number, dataUrl: string) => void} onPageRender
 * @param {{
 *   width?: number,
 *   type?: string,
 *   quality?: number,
 *   signal?: AbortSignal,
 *   pageIndices?: number[],
 * }} [opts] `pageIndices` is 0-based and defaults to every page in order.
 * @returns {Promise<number>} the file's total page count
 */
export async function renderPdfThumbnails(file, onPageRender, opts = {}) {
  const { width, type, quality, signal, pageIndices } = opts;
  const source = await openThumbnailSource(file);
  try {
    if (signal?.aborted) {
      throw new DOMException('Thumbnail render aborted', 'AbortError');
    }

    const indices = pageIndices ?? Array.from({ length: source.pageCount }, (_, i) => i);
    for (const pageIndex of indices) {
      if (signal?.aborted) {
        throw new DOMException('Thumbnail render aborted', 'AbortError');
      }
      const dataUrl = await source.render(pageIndex, { width, type, quality, signal });
      onPageRender(pageIndex + 1, dataUrl);

      // Yield to the event loop between pages so a 200-page file renders
      // without freezing the tab for the whole sequence.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return source.pageCount;
  } finally {
    await source.destroy();
  }
}
