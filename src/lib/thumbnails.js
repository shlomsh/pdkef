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

export async function renderThumbnail(file) {
  const lib = await getPdfjs();
  const bytes = await file.arrayBuffer();
  const loadingTask = lib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);

    const nativeViewport = page.getViewport({ scale: 1 });
    const scale = TARGET_WIDTH / nativeViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');

    await page.render({ canvasContext: context, viewport }).promise;

    return canvas.toDataURL('image/png');
  } finally {
    // pdf.js v6 exposes teardown on the loading task, not the document proxy.
    await loadingTask.destroy();
  }
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
