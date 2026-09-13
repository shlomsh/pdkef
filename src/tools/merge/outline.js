import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber } from '@cantoo/pdf-lib';

// MERGE-15 spike: writes a flat, one-level PDF outline (/Outlines) - one
// bookmark per source file, each pointing at that file's first surviving
// page in the merged output. @cantoo/pdf-lib has no high-level outline API
// (no `addOutline`/bookmark helper - see the ticket), so this builds the
// /Outlines dict chain directly from the same low-level PDFDict/PDFArray/
// PDFRef primitives pdf-lib's own internals use for the page tree, rather
// than adding a dependency just for this.
//
// Deliberately flat: this is a bookmark *per source file*, not a full
// page-by-page outline, so every item is a direct child of the outline
// root and /Count is simply the number of entries (no nested, collapsed
// subtrees to fold into a negative count).
//
// `entries` is the caller's job, not this module's: mergePdfs already walks
// its page plan to find each file's first *exported* page (respecting
// skipped pages and MERGE-09 cross-file reordering), so by the time this
// runs a file with nothing in the output has simply been left out of
// `entries` rather than needing to be filtered here.
//
// Refs for every item are reserved up front (`context.nextRef()`) so /Prev
// and /Next can point forward and backward in one pass instead of a
// second walk to patch them in after the fact.
export function addFileOutline(pdfDoc, entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;

  const { context, catalog } = pdfDoc;

  const rootRef = context.nextRef();
  const itemRefs = entries.map(() => context.nextRef());

  entries.forEach((entry, index) => {
    const page = pdfDoc.getPage(entry.pageIndex);

    // [page /XYZ left top zoom] with left/top/zoom left null means "open
    // this page, keep the viewer's current position and zoom" - the
    // conventional destination for a plain bookmark, as opposed to /Fit
    // which forces the whole page into view and overrides the reader's own
    // zoom every time the bookmark is clicked.
    const dest = PDFArray.withContext(context);
    dest.push(page.ref);
    dest.push(PDFName.of('XYZ'));
    dest.push(context.obj(null));
    dest.push(context.obj(null));
    dest.push(context.obj(null));

    const item = PDFDict.withContext(context);
    // PDFHexString.fromText encodes UTF-16BE with a leading BOM, the one
    // /Title encoding every viewer decodes correctly regardless of script -
    // a plain PDFString would mangle Hebrew and other non-Latin titles.
    item.set(PDFName.of('Title'), PDFHexString.fromText(entry.title));
    item.set(PDFName.of('Parent'), rootRef);
    item.set(PDFName.of('Dest'), dest);
    if (index > 0) item.set(PDFName.of('Prev'), itemRefs[index - 1]);
    if (index < entries.length - 1) item.set(PDFName.of('Next'), itemRefs[index + 1]);

    context.assign(itemRefs[index], item);
  });

  const root = PDFDict.withContext(context);
  root.set(PDFName.of('Type'), PDFName.of('Outlines'));
  root.set(PDFName.of('First'), itemRefs[0]);
  root.set(PDFName.of('Last'), itemRefs[itemRefs.length - 1]);
  root.set(PDFName.of('Count'), PDFNumber.of(entries.length));
  context.assign(rootRef, root);

  // PDFCatalog extends PDFDict, so this is the same catalog.set() any other
  // top-level catalog entry (AcroForm, Names, ...) goes through.
  catalog.set(PDFName.of('Outlines'), rootRef);
}
