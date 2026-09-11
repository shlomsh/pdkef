// Renders every page of a PDF to an image Blob (PNG or JPEG) using PDF.js.
// Loaded lazily (dynamic import) so it never blocks the initial page paint.
// The worker URL uses Vite's native `new URL(..., import.meta.url)` asset
// pattern (see thumbnails.js) so it's bundled as a same-origin asset, never
// fetched from a CDN.
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

const EXTENSION_BY_FORMAT = { 'image/png': 'png', 'image/jpeg': 'jpg' };

// Parses a printer-style page range string (e.g. "1-3,5,8") into a sorted,
// deduped array of 1-indexed page numbers clamped to [1, pageCount]. An
// empty/blank selector means "all pages". Throws on malformed input so the
// caller can surface a validation error instead of silently converting the
// wrong pages.
export function parsePageSelector(selector, pageCount) {
  const trimmed = (selector ?? '').trim();
  if (!trimmed) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const pages = new Set();
  for (const rawPart of trimmed.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;

    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      let start = Number(rangeMatch[1]);
      let end = Number(rangeMatch[2]);
      if (start > end) [start, end] = [end, start];
      for (let n = start; n <= end; n += 1) pages.add(n);
      continue;
    }

    if (/^\d+$/.test(part)) {
      pages.add(Number(part));
      continue;
    }

    throw new Error(`Invalid page selector: "${part}"`);
  }

  const inRange = [...pages].filter((n) => n >= 1 && n <= pageCount);
  if (inRange.length === 0) {
    throw new Error('No valid pages in range');
  }
  return inRange.sort((a, b) => a - b);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      type,
      quality,
    );
  });
}

function fillWhiteIfJpeg(context, width, height, format) {
  if (format !== 'image/jpeg') return;
  // JPEG has no alpha channel - fill white first so a transparent PDF
  // background doesn't render as black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
}

async function renderPageToCanvas(page, scale, format) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = getPdfRenderContext(canvas);
  fillWhiteIfJpeg(context, canvas.width, canvas.height, format);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

// Stacks per-page canvases into a single tall canvas, centering narrower
// pages horizontally. Browsers cap canvas height (commonly ~32,767px) and
// total pixel area, so very long or high-scale documents may need a lower
// scale to stay within that ceiling.
function stackCanvases(canvases, format) {
  const width = Math.max(...canvases.map((c) => c.width));
  const height = canvases.reduce((sum, c) => sum + c.height, 0);

  const combined = document.createElement('canvas');
  combined.width = width;
  combined.height = height;
  const context = combined.getContext('2d');
  fillWhiteIfJpeg(context, width, height, format);

  let y = 0;
  for (const canvas of canvases) {
    const x = Math.round((width - canvas.width) / 2);
    context.drawImage(canvas, x, y);
    y += canvas.height;
  }
  return combined;
}

// Converts a PDF File into image Blob(s) using PDF.js.
// format: 'image/png' | 'image/jpeg'.
// scale: render multiplier (1 = ~72dpi, 2 = ~144dpi, 3 = ~216dpi).
// layout: 'separate' (one image per page, default) | 'concatenated' (all
// pages stacked into a single tall image).
export async function convertPdfToImages(
  file,
  {
    format = 'image/png',
    scale = 2,
    quality = 0.92,
    layout = 'separate',
    pages = '',
    onProgress,
  } = {},
) {
  const lib = await getPdfjs();
  const bytes = await file.arrayBuffer();
  const loadingTask = lib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const baseName = file.name.replace(/\.pdf$/i, '') || 'page';
  const extension = EXTENSION_BY_FORMAT[format] ?? 'png';
  const pageNumbers = parsePageSelector(pages, pdf.numPages);

  try {
    const canvases = [];
    for (let i = 0; i < pageNumbers.length; i += 1) {
      const page = await pdf.getPage(pageNumbers[i]);
      canvases.push(await renderPageToCanvas(page, scale, format));
      onProgress?.((i + 1) / pageNumbers.length);
    }

    if (layout === 'concatenated' && canvases.length > 1) {
      const combined = stackCanvases(canvases, format);
      const blob = await canvasToBlob(combined, format, quality);
      return [{ pageNumber: pageNumbers[0], blob, filename: `${baseName}.${extension}` }];
    }

    const images = [];
    for (let i = 0; i < canvases.length; i += 1) {
      const blob = await canvasToBlob(canvases[i], format, quality);
      const filename =
        canvases.length === 1
          ? `${baseName}.${extension}`
          : `${baseName}-page-${pageNumbers[i]}.${extension}`;
      images.push({ pageNumber: pageNumbers[i], blob, filename });
    }
    return images;
  } finally {
    // pdf.js v6 exposes teardown on the loading task, not the document proxy.
    await loadingTask.destroy();
  }
}
