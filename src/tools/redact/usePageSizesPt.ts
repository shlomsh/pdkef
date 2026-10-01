import { useEffect, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { reportError } from '../../lib/errorReport.ts';

export interface PageSizePt { width: number; height: number }

/**
 * RED-24: each page's size in PDF points, as displayed (rotation applied),
 * so a blur box can size its on-screen blur from its own height in points,
 * the same way the export does. RED-32 adds the width, so a brush stroke is
 * round on a Letter page and an A4 page alike. Read only once `enabled` (a blur box exists);
 * pdf.js has already loaded the pages to draw them, so this costs no parsing.
 */
export default function usePageSizesPt(
  pdfDocument: PDFDocumentProxy | null,
  numPages: number,
  enabled: boolean,
): readonly PageSizePt[] {
  const [read, setRead] = useState<{ document: PDFDocumentProxy | null; sizes: PageSizePt[] }>({ document: null, sizes: [] });

  useEffect(() => {
    if (!enabled || !pdfDocument || read.document === pdfDocument) return;
    let current = true;
    (async () => {
      const sizes: PageSizePt[] = [];
      try {
        for (let pageIndex = 0; pageIndex < numPages; pageIndex += 1) {
          const page = await pdfDocument.getPage(pageIndex + 1);
          const { width, height } = page.getViewport({ scale: 1 });
          sizes.push({ width, height });
        }
      } catch (error) {
        reportError('redact', error, 'read_page_sizes');
        // Without a size a blur box draws its plain fraction, as it did
        // before RED-24; the export is unaffected.
        console.error('Redact could not read a page size', error);
      }
      if (current) setRead({ document: pdfDocument, sizes });
    })();
    return () => {
      current = false;
    };
  }, [pdfDocument, numPages, enabled, read.document]);

  return read.document === pdfDocument ? read.sizes : [];
}
