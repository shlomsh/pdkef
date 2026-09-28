import { useEffect, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * RED-24: each page's height in PDF points, as displayed (rotation applied),
 * so a blur box can size its on-screen blur from its own height in points,
 * the same way the export does. Read only once `enabled` (a blur box exists);
 * pdf.js has already loaded the pages to draw them, so this costs no parsing.
 */
export default function usePageHeightsPt(
  pdfDocument: PDFDocumentProxy | null,
  numPages: number,
  enabled: boolean,
): readonly number[] {
  const [read, setRead] = useState<{ document: PDFDocumentProxy | null; heights: number[] }>({ document: null, heights: [] });

  useEffect(() => {
    if (!enabled || !pdfDocument || read.document === pdfDocument) return;
    let current = true;
    (async () => {
      const heights: number[] = [];
      try {
        for (let pageIndex = 0; pageIndex < numPages; pageIndex += 1) {
          const page = await pdfDocument.getPage(pageIndex + 1);
          heights.push(page.getViewport({ scale: 1 }).height);
        }
      } catch (error) {
        // Without a height a blur box draws its plain fraction, as it did
        // before RED-24; the export is unaffected.
        console.error('Redact could not read a page size', error);
      }
      if (current) setRead({ document: pdfDocument, heights });
    })();
    return () => {
      current = false;
    };
  }, [pdfDocument, numPages, enabled, read.document]);

  return read.document === pdfDocument ? read.heights : [];
}
