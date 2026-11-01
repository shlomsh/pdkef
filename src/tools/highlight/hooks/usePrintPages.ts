import { useEffect, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { turnsOf, type PageTurns } from '#editor/geometry/pageTurn.ts';
import { renderPageToCanvas } from '#lib/pdf/renderPage.js';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { readPageInk } from './readInkBounds.ts';
import { turnedPageBox } from '../lib/zoom/turnedBox.ts';
import type { PagePrintPlan, PrintPage } from '../lib/print/printPlan.ts';

/** Pages are drawn at twice their printed size so a sheet stays sharp on paper. */
const PRINT_OVERSAMPLE = 2;
const CSS_PX_PER_PT = 96 / 72;

/** pdf.js rotation for a page: its own /Rotate plus the person's turns. */
const turnedRotation = (page: { rotate?: number }, turns: PageTurns, index: number) =>
  (((page.rotate ?? 0) + 90 * turnsOf(turns, index)) % 360 + 360) % 360;

/** READ-06: each page's printed size in points, with its own text extent when it carries a note standing beside it. */
export function usePrintPages(pdfDocument: PDFDocumentProxy, pageTurns: PageTurns, notedPages: ReadonlySet<number> | null) {
  const [pages, setPages] = useState<PrintPage[]>([]);
  // A fresh Set each render must not rerun the scan: depend on its contents.
  const notedKey = notedPages ? [...notedPages].sort((a, b) => a - b).join(',') : null;
  useEffect(() => {
    let current = true;
    (async () => {
      try {
        const sizes: PrintPage[] = [];
        for (let n = 1; n <= pdfDocument.numPages; n++) {
          const page = await pdfDocument.getPage(n);
          const rotation = turnedRotation(page, pageTurns, n - 1);
          const { width, height } = page.getViewport({ scale: 1, rotation });
          // Each page's own text extent, so the notes never cover a line however the pages differ.
          // expected: an unreadable page prints whole beside its notes, the same as a page with no text found.
          const ink = notedPages?.has(n - 1) && rotation === 0 ? await readPageInk(pdfDocument, n - 1, () => current, pageTurns).catch(() => null) : null;
          if (!current) return;
          if (!ink) { sizes.push({ width, height }); continue; }
          const box = turnedPageBox({ width, height }, rotation / 90, ink);
          sizes.push({ width, height, inkLeft: box.textLeft, inkRight: box.textRight });
        }
        if (current) setPages(sizes);
      } catch (error) {
        if (current) reportError('pdf_render', error, 'print_page_sizes');
      }
    })();
    return () => { current = false; };
  }, [pdfDocument, pageTurns, notedKey]);

  return pages;
}

/**
 * READ-06: each page rendered to an image at twice its printed size, and `onSettled(i)` for each image's load;
 * once every image has settled, `onReady` fires once for that set of images.
 */
export function usePageImages(pdfDocument: PDFDocumentProxy, pages: PrintPage[], basePlan: PagePrintPlan[], pageTurns: PageTurns, onReady: () => void) {
  const [images, setImages] = useState<string[] | null>(null);
  const settled = useRef(new Set<number>());
  const fired = useRef<string[] | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (pages.length === 0) return undefined;
    let current = true;
    setImages(null);
    (async () => {
      try {
        const urls: string[] = [];
        for (let i = 0; i < pages.length; i++) {
          const scale = PRINT_OVERSAMPLE * (basePlan[i].pageBox.width / pages[i].width) * CSS_PX_PER_PT;
          const page = await pdfDocument.getPage(i + 1);
          const canvas = await renderPageToCanvas(page, { scale, rotation: turnedRotation(page, pageTurns, i) });
          urls.push(canvas.toDataURL('image/png'));
          canvas.width = 0;
          if (!current) return;
        }
        settled.current = new Set();
        setImages(urls);
      } catch (error) {
        if (current) reportError('pdf_render', error, 'print_render');
      }
    })();
    return () => { current = false; };
  }, [pdfDocument, pages, basePlan, pageTurns]);

  const onSettled = (index: number) => {
    settled.current.add(index);
    if (images && settled.current.size === images.length && fired.current !== images) {
      fired.current = images;
      onReadyRef.current();
    }
  };

  return { images, onSettled };
}
