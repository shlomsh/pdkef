/**
 * Diagnose and repair a PDF whose catalog lost its page list (DEBT-54).
 *
 * `PDFDocument.load` accepts such a file, then `getPageCount()` throws because the
 * catalog's /Pages does not resolve to a dictionary. When exactly one parentless
 * /Type /Pages dictionary survives, it is the document's page-tree root, and
 * repointing /Pages at it restores the document's own page order and inherited
 * attributes. Loose /Page objects are never used: their order is not recorded.
 *
 * Pure: pdf-lib is 628 KiB and lazy-loaded (pdfLib.js), so the module comes in as `lib`.
 */
import type { PageTreeRoots, PageTreeShape } from '../../lib/maintenanceEventSchema';

type PdfLib = typeof import('@cantoo/pdf-lib');
type Doc = import('@cantoo/pdf-lib').PDFDocument;

/** Every indirect object that is a /Type /Pages dictionary nobody points to as a child. */
function findParentlessRoots(doc: Doc, lib: PdfLib) {
  const { PDFDict, PDFName } = lib;
  const roots: { ref: import('@cantoo/pdf-lib').PDFRef; dict: import('@cantoo/pdf-lib').PDFDict }[] = [];
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    if (obj.get(PDFName.of('Type')) !== PDFName.of('Pages')) continue;
    if (obj.has(PDFName.of('Parent'))) continue;
    roots.push({ ref, dict: obj });
  }
  return roots;
}

function describeShape(doc: Doc, lib: PdfLib): PageTreeShape {
  const { PDFName, PDFRef } = lib;
  const entry = doc.catalog.get(PDFName.of('Pages'));
  if (entry === undefined) return 'no_pages_key';
  if (entry instanceof PDFRef && doc.context.lookup(entry) === undefined) return 'pages_ref_missing';
  return 'pages_wrong_type';
}

/** null when the catalog's /Pages is a dictionary, so there is nothing to diagnose. */
export function diagnosePageTree(doc: Doc, lib: PdfLib): { shape: PageTreeShape; roots: PageTreeRoots } | null {
  const { PDFDict, PDFName } = lib;
  if (doc.context.lookup(doc.catalog.get(PDFName.of('Pages'))) instanceof PDFDict) return null;
  const count = findParentlessRoots(doc, lib).length;
  return { shape: describeShape(doc, lib), roots: count === 0 ? 'none' : count === 1 ? 'one' : 'several' };
}

/** Repoint /Pages at the single surviving root. True when the document now has pages. */
export function repairPageTree(doc: Doc, lib: PdfLib): boolean {
  const roots = findParentlessRoots(doc, lib);
  if (roots.length !== 1 || !(roots[0].dict instanceof lib.PDFPageTree)) return false;
  doc.catalog.set(lib.PDFName.of('Pages'), roots[0].ref);
  try {
    return doc.getPageCount() >= 1;
  } catch {
    // expected: a root whose Kids are damaged still throws; that is "not repaired", not a new failure.
    return false;
  }
}
