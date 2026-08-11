// Renders the first page of a PDF to a data-URL thumbnail using PDF.js.
// Loaded lazily (dynamic import) so it never blocks the initial page paint.
// The worker URL uses Vite's native `new URL(..., import.meta.url)` asset
// pattern (pdfjs-dist's documented Vite integration): Vite bundles and
// content-hashes the worker as a same-origin asset automatically, so it's
// never fetched from a CDN - required for both offline support and the
// no-third-party-network privacy guarantee.
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

const TARGET_WIDTH = 150;

/**
 * Render page 1 to a data URL.
 *
 * Always takes a `File` rather than bytes you already hold, and that is
 * deliberate: pdf.js may detach the ArrayBuffer it is handed, so passing a
 * buffer that something else still needs (a draft's `fileBytes`, say) would
 * empty it out from under that owner. `file.arrayBuffer()` mints a fresh copy
 * each call, which is the only reason this is safe to call alongside draft
 * persistence.
 *
 * @param {File} file
 * @param {{ width?: number, type?: string, quality?: number }} [opts]
 *   `width` in device px; `type`/`quality` go straight to `toDataURL`. The
 *   defaults are the merge tool's list thumbnails. Draft previews override all
 *   three, because they are bound for localStorage where size is the whole
 *   constraint - see draftStore's DRAFT_META_PREFIX.
 * @returns {Promise<string>} data URL
 */
export async function renderThumbnail(file, opts = {}) {
  const { width = TARGET_WIDTH, type = 'image/png', quality } = opts;
  const lib = await getPdfjs();
  const bytes = await file.arrayBuffer();
  const loadingTask = lib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);

    const nativeViewport = page.getViewport({ scale: 1 });
    const scale = width / nativeViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');

    // A PDF page is paper: it assumes white behind it. Canvas starts
    // transparent, and JPEG has no alpha, so without this the transparent
    // pixels flatten to black and a text page encodes as a black rectangle.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport }).promise;

    return canvas.toDataURL(type, quality);
  } finally {
    // pdf.js v6 exposes teardown on the loading task, not the document proxy.
    await loadingTask.destroy();
  }
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

export async function renderPdfThumbnails(file, onPageRender) {
  const lib = await getPdfjs();
  const bytes = await file.arrayBuffer();
  const loadingTask = lib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  try {
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const nativeViewport = page.getViewport({ scale: 1 });
      const scale = TARGET_WIDTH / nativeViewport.width;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');

      await page.render({ canvasContext: context, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/png');
      onPageRender(i, dataUrl);
    }
    return numPages;
  } finally {
    await loadingTask.destroy();
  }
}
