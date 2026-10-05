import { readPageGlyphs } from './pageGlyphs.ts';
import { reportError } from '../../../lib/errorReport.ts';

/**
 * Reads a pdf.js page's glyphs, or null when the page can't be read (a broken
 * content stream). A null page is saved as its picture alone, which is the
 * safe outcome. Glyphs in a font pdf.js never resolved are left out, never
 * placed by guesswork.
 *
 * `isStale` says the caller has moved on (its document was replaced and
 * destroyed); pdf.js then throws a TypeError from inside, which is not ours to
 * report, so a stale read returns null quietly.
 */
export async function readGlyphs(pdfjs, pdfjsPage, options, isStale) {
  try {
    const operatorList = await pdfjsPage.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
    return readPageGlyphs(operatorList, pdfjs.OPS, (name) => {
      try {
        return pdfjsPage.commonObjs.get(name);
      } catch {
        // expected: pdf.js throws for an unresolved font name, handled as no font
        return null;
      }
    }, options);
  } catch (error) {
    if (isStale?.()) return null;
    reportError('redact', error, 'read_glyphs');
    console.error('Redact could not read a page\'s text', error);
    return null;
  }
}
