import { useEffect, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pageGeometryFromPdfJsPage, type PageGeometry } from '#editor/geometry/coords.ts';
import { turnGeometry } from '#editor/geometry/pageTurn.ts';
import { toPageTextRuns } from '#editor/geometry/textRuns.ts';
import { readTextItems } from '#lib/pdf/pdfTextItems.ts';

/**
 * One page's geometry as it is shown now (the file's own, advanced by the person's `turns`), and its printed text in
 * the percent of that turned page. The text runs are a ref: they feed the swipe's reading direction and are never state.
 * A turn replaces the geometry in place, so the page never blanks while it turns.
 */
export function usePageGeometry(pdfDocument: PDFDocumentProxy | null, pageIndex: number, turns: number) {
  const [geometry, setGeometry] = useState<PageGeometry | undefined>(undefined);
  const textRunsRef = useRef<ReturnType<typeof toPageTextRuns>>([]);

  useEffect(() => {
    textRunsRef.current = [];
    if (!pdfDocument) {
      setGeometry(undefined);
      return;
    }
    let live = true;
    void pdfDocument.getPage(pageIndex + 1).then(async (page) => {
      if (!live) return;
      const shown = turnGeometry(pageGeometryFromPdfJsPage(page), turns);
      setGeometry(shown);
      try {
        const items = await readTextItems(page);
        if (live) textRunsRef.current = toPageTextRuns(items, shown);
      } catch {
        // expected: no text to read the direction from, so the swipe falls back to the reader's own.
      }
    });
    return () => { live = false; };
  }, [pdfDocument, pageIndex, turns]);

  return { geometry, textRunsRef };
}
