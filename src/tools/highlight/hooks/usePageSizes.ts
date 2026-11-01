import { useEffect, useMemo, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageBox } from '../lib/zoom/fit.ts';
import { turnedPageBox } from '../lib/zoom/turnedBox.ts';
import { turnsOf, type PageTurns } from '#editor/geometry/pageTurn.ts';
import { readInkBounds } from './readInkBounds.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';

const NO_TURNS: PageTurns = {};

/** The document's pages as shown: the file's own sizes and where its text sits, each page swapped for its quarter turns. */
export function usePageSizes(pdfDocument: PDFDocumentProxy | null, pageTurns?: PageTurns): PageBox[] {
  // The file's own page sizes, then where its text sits (read from the rendered pages, which Fit text sizes the document by).
  const [sizes, setSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [ink, setInk] = useState<{ left: number; right: number } | null>(null);
  const turns = pageTurns ?? NO_TURNS;
  const turnsKey = JSON.stringify(turns);

  useEffect(() => {
    setSizes([]);
    if (!pdfDocument) return;
    let live = true;
    void (async () => {
      const boxes: Array<{ width: number; height: number }> = [];
      for (let n = 1; n <= pdfDocument.numPages; n++) {
        const page = await pdfDocument.getPage(n);
        if (!live) return;
        const { width, height } = page.getViewport({ scale: 1 });
        boxes.push({ width, height });
      }
      setSizes(boxes);
    })().catch((err) => { if (live) reportError('pdf_render', err, 'read_page_sizes'); });
    return () => { live = false; };
  }, [pdfDocument]);

  // The ink is read from the pages as they are shown, so a turn reads it again.
  useEffect(() => {
    setInk(null);
    if (!pdfDocument) return;
    let live = true;
    void readInkBounds(pdfDocument, () => live, turns).then((bounds) => { if (live) setInk(bounds); })
      .catch((err) => { if (live) reportError('pdf_render', err, 'read_ink_bounds'); });
    return () => { live = false; };
  }, [pdfDocument, turnsKey]);

  return useMemo<PageBox[]>(() => sizes.map((size, i) => turnedPageBox(size, turnsOf(turns, i), ink)), [sizes, ink, turnsKey]);
}
