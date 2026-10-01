import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { previewTexts } from '../../editor/adapters/pdf/deletePreviews.ts';
import { getPdfjs } from '../../editor/adapters/pdf/pdfjsLoader.js';
import { readGlyphs } from '../../editor/adapters/pdf/readGlyphs.js';
import { pageGeometryFromPdfJsPage } from '../../editor/geometry/coords.ts';
import type { DeletablePdfObject } from './DeletableObjectOverlay.tsx';
import { GLYPH_BUDGET } from './find/itemGlyphs.ts';
import { reportError } from '../../lib/errorReport.ts';

/**
 * RED-16: gives each text object Delete offers the words it holds, read from
 * the same glyph read Find and the saved-file check use, so there is one
 * reader of a PDF's text. The parser in `pdfObjects.js` finds the objects and
 * their boxes; `previewTexts` says what is in each box. Pages are read one
 * after another and their previews appear as they finish, an object whose page
 * has not been read yet simply has no preview (the hover label falls back to
 * "Click to delete this text"). Beyond `GLYPH_BUDGET` glyphs in all, later
 * pages are not read and keep no preview, the same cap Find applies.
 *
 * The result is the same array while nothing has been read, and a new one
 * (objects spread with their `preview`) only when a page finishes, so
 * marks made from it carry the preview into the delete element and into the
 * saved-file check's deleted terms.
 *
 * @param pdfDocument the loaded file as pdf.js reads it
 * @param objects what `useDeletableObjects` found for that same file
 * @param enabled false until Delete needs previews; reading is skipped
 */
export default function useObjectPreviews(
  pdfDocument: PDFDocumentProxy | null,
  objects: DeletablePdfObject[],
  enabled = true,
): DeletablePdfObject[] {
  const [read, setRead] = useState<{ objects: DeletablePdfObject[]; previews: ReadonlyMap<string, string> }>({
    objects,
    previews: new Map(),
  });

  // The object set whose read ran to the end: arming Delete again for the same
  // file reuses it instead of reading every page's glyphs a second time.
  const finishedFor = useRef<DeletablePdfObject[] | null>(null);

  useEffect(() => {
    if (finishedFor.current === objects) return undefined;
    const pages = [...new Set(objects.filter((o) => o.kind === 'text').map((o) => o.pageIndex))].sort((a, b) => a - b);
    if (!enabled || !pdfDocument || pages.length === 0) return undefined;
    let current = true;
    (async () => {
      const previews = new Map<string, string>();
      let glyphsKept = 0;
      try {
        const pdfjs = await getPdfjs();
        for (const pageIndex of pages) {
          if (glyphsKept >= GLYPH_BUDGET) break;
          const page = await pdfDocument.getPage(pageIndex + 1);
          const glyphs = await readGlyphs(pdfjs, page);
          if (!current) return;
          if (!glyphs) continue;
          glyphsKept += glyphs.length;
          const onPage = objects.filter((o) => o.pageIndex === pageIndex);
          for (const [id, text] of previewTexts(onPage, glyphs, pageGeometryFromPdfJsPage(page))) previews.set(id, text);
          setRead({ objects, previews: new Map(previews) });
        }
        if (current) finishedFor.current = objects;
      } catch (error) {
        reportError('redact', error, 'read_object_previews');
        // Without previews Delete still works: the label is the generic one.
        console.error('Delete could not read the text of this PDF', error);
      }
    })();
    return () => {
      current = false;
    };
  }, [pdfDocument, objects, enabled]);

  // Previews read for a different set of objects (an earlier file) are never shown.
  const previews = read.objects === objects ? read.previews : null;
  return useMemo(
    () => (previews && previews.size > 0
      ? objects.map((object) => (previews.has(object.id) ? { ...object, preview: previews.get(object.id) } : object))
      : objects),
    [objects, previews],
  );
}
