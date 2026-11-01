import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pageGeometryFromPdfJsPage, type PageGeometry } from '#editor/geometry/coords.ts';
import { turnGeometry } from '#editor/geometry/pageTurn.ts';
import { toPageTextRuns, type PageTextRun } from '#editor/geometry/textRuns.ts';
import { readTextItems } from '#lib/pdf/pdfTextItems.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';

/**
 * One page's geometry as it is shown now (the file's own, advanced by the person's `turns`), and its printed text in
 * the percent of that turned page. The page is read once per document and page; a turn is applied synchronously
 * from the file geometry already held, so it never waits on pdf.js and the page never blanks while it turns.
 * The text runs are a ref: they feed the swipe's reading direction and are never state.
 */
export function usePageGeometry(pdfDocument: PDFDocumentProxy | null, pageIndex: number, turns: number) {
  const [fileGeometry, setFileGeometry] = useState<PageGeometry | undefined>(undefined);
  const itemsRef = useRef<readonly unknown[]>([]);
  const geometryRef = useRef<PageGeometry | undefined>(undefined);

  useEffect(() => {
    itemsRef.current = [];
    if (!pdfDocument) {
      setFileGeometry(undefined);
      return;
    }
    let live = true;
    void pdfDocument.getPage(pageIndex + 1).then(async (page) => {
      if (!live) return;
      setFileGeometry(pageGeometryFromPdfJsPage(page));
      try {
        const items = await readTextItems(page);
        if (live) itemsRef.current = items;
      } catch {
        // expected: no text to read the direction from, so the swipe falls back to the reader's own.
      }
    }).catch((err) => { if (live) reportError('pdf_render', err, 'read_page_geometry'); });
    return () => { live = false; };
  }, [pdfDocument, pageIndex]);

  const geometry = useMemo(
    () => (fileGeometry ? turnGeometry(fileGeometry, turns) : undefined),
    [fileGeometry, turns],
  );

  geometryRef.current = geometry;

  // A ref-shaped reader (callers keep `() => textRunsRef.current`): the runs are derived from the stored items and the
  // shown geometry on read, and reused until either changes, so the text may arrive after the geometry without a render.
  const textRunsRef = useMemo(() => {
    let memo: { items: readonly unknown[]; geometry: PageGeometry; runs: PageTextRun[] } | undefined;
    return {
      get current(): PageTextRun[] {
        const items = itemsRef.current;
        const shown = geometryRef.current;
        if (!shown) return [];
        if (!memo || memo.items !== items || memo.geometry !== shown) memo = { items, geometry: shown, runs: toPageTextRuns(items, shown) };
        return memo.runs;
      },
    };
  }, []);

  return { geometry, textRunsRef };
}
