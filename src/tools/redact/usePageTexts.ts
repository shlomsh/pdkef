import { useEffect, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pageGeometryFromPdfJsPage } from '../../editor/geometry/coords.ts';
import { readTextItems } from '../../lib/pdfTextItems.ts';
import { buildPageText } from './find/pageText.ts';
import type { SearchablePage } from './find/findMatches.ts';
import type { TextItemLike } from './find/types.ts';

export type PageTextsState =
  | { status: 'idle' | 'reading'; pages: SearchablePage[] }
  | { status: 'ready'; pages: SearchablePage[] }
  | { status: 'failed'; pages: SearchablePage[] };

const IDLE: PageTextsState = { status: 'idle', pages: [] };

const isTextItem = (item: object): item is TextItemLike => typeof (item as TextItemLike).str === 'string';

/**
 * Every page's searchable text, read once per document and only after
 * `enabled` first turns true (the find panel opens), so a person who never
 * searches never pays for it. Pages fill in as they are read.
 */
export default function usePageTexts(
  pdfDocument: PDFDocumentProxy | null,
  numPages: number,
  enabled: boolean,
): PageTextsState {
  const [read, setRead] = useState<{ document: PDFDocumentProxy | null; state: PageTextsState }>({ document: null, state: IDLE });
  const setState = (next: PageTextsState) => setRead({ document: pdfDocument, state: next });
  const started = useRef<PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!enabled || !pdfDocument || started.current === pdfDocument) return;
    started.current = pdfDocument;
    let current = true;
    let finished = false;
    setState({ status: 'reading', pages: [] });
    (async () => {
      const pages: SearchablePage[] = [];
      try {
        for (let pageIndex = 0; pageIndex < numPages; pageIndex += 1) {
          const page = await pdfDocument.getPage(pageIndex + 1);
          const items = (await readTextItems(page)).filter(isTextItem);
          if (!current) return;
          pages.push({ text: buildPageText(pageIndex, items), geometry: pageGeometryFromPdfJsPage(page) });
          setState({ status: 'reading', pages: [...pages] });
        }
        finished = true;
        if (current) setState({ status: 'ready', pages });
      } catch (error) {
        console.error('Find could not read the page text', error);
        if (current) setState({ status: 'failed', pages });
      }
    })();
    return () => {
      current = false;
      // A finished read stays: closing and reopening Find must not read the
      // document again. An unfinished one (closed mid-read, or the document
      // changed) is dropped so the next open starts it afresh.
      if (started.current === pdfDocument && !finished) started.current = null;
    };
  }, [pdfDocument, numPages, enabled]);

  // Pages read from a document that has since been replaced are never shown.
  return read.document === pdfDocument ? read.state : IDLE;
}
